

import type { Request, Response } from 'express';
import { GenerateContentResponse, Content, Type } from "@google/genai";
import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';

import { getAi, prepareSystemPrompt } from '../services/gemini.service.js';
import { env } from '../config/env.js';
import { snapshotToData, querySnapshotToArray } from '../services/firestore.service.js';
import { organizationsCollection, userQuestionnaireResultsCollection, conversationsCollection, chatPersonasCollection, plansCollection, systemSettingsCollection, academyBillingCyclesCollection } from '../db/collections.js';
import { DBOrganization, JwtUserPayload, DBUserQuestionnaireResult, DBConversation, DBChatPersona, DBPlan, DBSystemSettings, DBAcademyBillingCycle, UserRole } from '../types/index.js';
import { logTokenUsage } from '../services/analytics.service.js';
import { USER_PERSONALIZATION_PROMPT_BLOCK } from '../config/prompts.js';

export const sendMessage = async (req: Request, res: Response) => {
    const { message, history, personaId } = req.body as { message: string, history: Content[], personaId: string };
    if (!message || !history || !personaId) {
        return res.status(400).json({ message: "Message, history, and personaId are required."});
    }

    let totalTokens = 0;
    const user = req.user as JwtUserPayload;

    try {
        // --- Get Model Configuration ---
        const settingsDoc = await systemSettingsCollection.doc('tokenLimits').get();
        const settings = snapshotToData<DBSystemSettings>(settingsDoc);
        const proModel = settings?.geminiProModelName || env.GEMINI_PRO_MODEL;
        const globalSystemPrompt = settings?.globalSystemPrompt || '';

        // --- AUTHORIZATION & USAGE LIMIT CHECK ---
        // 1. Check if the organization's plan has chat access enabled.
        // Admins bypass this check.
        if (user.role !== UserRole.ACADEMY_ADMIN && user.role !== UserRole.SYSTEM_ADMIN) {
            const orgDoc = await organizationsCollection.doc(user.selectedOrganizationId).get();
            if (orgDoc.exists) {
                const org = snapshotToData<DBOrganization>(orgDoc)!;
                let hasChatAccess = false; // Default to false if no plan is assigned
                if (org.planId) {
                    const planDoc = await plansCollection.doc(org.planId).get();
                    if (planDoc.exists) {
                        const plan = snapshotToData<DBPlan>(planDoc)!;
                        
                        if (plan.hasAllChatAccess !== false) { // Access is granted unless explicitly false (undefined is true)
                            hasChatAccess = true;
                        } else if (plan.accessibleChatPersonaIds?.includes(personaId)) {
                            hasChatAccess = true;
                        }

                        // --- Check Expiration for AI Chat Access ---
                        if (plan.planType === 'one-time' && plan.accessRules?.revokeChat && plan.accessRules?.revokeChat !== 'never') {
                             if (plan.accessRules.revokeChat === 'after_duration') {
                                const days = plan.accessRules.revokeChatAfterDays || 0;
                                if (days > 0 && org.createdAt) {
                                    const startDate = (org.createdAt instanceof admin.firestore.Timestamp) ? org.createdAt.toDate() : new Date(org.createdAt);
                                    const expirationDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);
                                    if (new Date() > expirationDate) {
                                        return res.status(403).json({ message: "Access to AI features has expired for your plan." });
                                    }
                                }
                             }
                             // Note: 'on_course_completion' is handled by a separate scheduled function/trigger, not here.
                        }
                    }
                }
                if (!hasChatAccess) {
                    return res.status(403).json({ message: "The chat feature is not enabled for your organization's plan." });
                }
            } else {
                return res.status(403).json({ message: "Organization not found." });
            }
        }

        // 2. Billing Limit Check
        const now = new Date();
        const cycleId = `${user.academyId}_${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
        const cycleDoc = await academyBillingCyclesCollection.doc(cycleId).get();

        if (cycleDoc.exists) {
            const cycle = snapshotToData<DBAcademyBillingCycle>(cycleDoc)!;
            if (cycle.currentTokenUsage >= cycle.calculatedTokenLimit) {
                logger.warn(`Academy ${user.academyId} has reached its token limit. Blocking request.`);
                return res.status(403).json({ message: "Your organization has reached its monthly AI usage limit." });
            }
        } else {
             logger.warn(`Billing cycle document ${cycleId} not found for academy ${user.academyId}. Allowing request but usage will not be tracked correctly.`);
        }
        
        // 3. Fetch the persona and ensure it belongs to the user's academy.
        const personaDoc = await chatPersonasCollection.doc(personaId).get();
        if (!personaDoc.exists) {
            return res.status(404).json({ message: "Chat persona not found." });
        }
        const persona = snapshotToData<DBChatPersona>(personaDoc)!;

        if (persona.academyId !== user.academyId) {
            return res.status(403).json({ message: "You do not have permission to use this chat persona." });
        }
        // --- END AUTHORIZATION & USAGE LIMIT CHECK ---

        const questionnaireSnapshot = await userQuestionnaireResultsCollection
            .where('userId', '==', user.id)
            .orderBy('completedAt', 'desc')
            .get();
        
        let formattedPatterns = "Not available.";
        if (!questionnaireSnapshot.empty) {
            const results = querySnapshotToArray<DBUserQuestionnaireResult>(questionnaireSnapshot);
            // Get the latest result for each unique questionnaire
            const latestResults = Array.from(
                results.reduce((map, result) => {
                    if (!map.has(result.questionnaireId) || map.get(result.questionnaireId)!.completedAt < result.completedAt) {
                        map.set(result.questionnaireId, result);
                    }
                    return map;
                }, new Map<string, DBUserQuestionnaireResult>()).values()
            );

            const allTopCategories = latestResults.flatMap(r => 
                (r.topCategories || []).map(cat => `- ${cat.name} (from ${r.questionnaireName})`)
            );
            
            if (allTopCategories.length > 0) {
                formattedPatterns = allTopCategories.join('\n');
            }
        }

        const conversationsSnapshot = await conversationsCollection
            .where('userId', '==', user.id)
            .orderBy('date', 'desc')
            .limit(5)
            .get();

        let formattedInsights = "No saved insights available.";
        if (!conversationsSnapshot.empty) {
            const insights = querySnapshotToArray<DBConversation>(conversationsSnapshot)
                .map(c => c.extractedFactors ? `On ${new Date(c.date).toLocaleDateString()}: Emotion - ${c.extractedFactors.negativeEmotion}, Belief - "${c.extractedFactors.falseBelief}"` : null)
                .filter(Boolean); 
            if (insights.length > 0) {
                formattedInsights = insights.join('\n');
            }
        }
        
        // --- DYNAMIC PROMPT CONSTRUCTION ---
        const enabledExtractionFields = (persona.extractionSettings || [])
            .filter(s => s.enabled && s.label.trim() !== '')
            .map(s => `"${s.label}"`);

        let summaryInstruction = '';
        if (enabledExtractionFields.length > 0) {
            const fieldList = enabledExtractionFields.join(' and ');
            const customSummaryInstructions = persona.summaryInstructions || 'present your full summary and suggestion for change.';
            // CONTROL TOKEN IMPLEMENTATION
            summaryInstruction = `\n\n**Summary Trigger Instruction:**\nWhen you believe you have identified ${fieldList}, you **MUST** append the token \`[[SHOW_SAVE_BUTTON]]\` to the very end of your response. Do not translate this token. After the token, ${customSummaryInstructions}`;
        }
        
        // 1. Combine the persona preamble and the main system prompt.
        let personaSpecificPrompt = [persona.personaPreamble, persona.systemPrompt].filter(Boolean).join('\n\n');
        
        // 2. Conditionally prepare and append the user personalization block.
        if (persona.includePersonalization !== false) { // Default to true if undefined
            let personalizationBlock = USER_PERSONALIZATION_PROMPT_BLOCK;
            personalizationBlock = personalizationBlock.replace('{user_patterns}', formattedPatterns);
            personalizationBlock = personalizationBlock.replace('{user_insights}', formattedInsights);
            personaSpecificPrompt += personalizationBlock;
        }

        // 3. Append the dynamic summary trigger instruction.
        personaSpecificPrompt += summaryInstruction;

        // 4. Combine global prompt with the persona-specific prompt.
        const fullCompositePrompt = [globalSystemPrompt, personaSpecificPrompt].filter(Boolean).join('\n\n---\n\n');

        // 5. Finalize prompt (no longer fetches DB triggers)
        const systemPrompt = await prepareSystemPrompt(fullCompositePrompt);
        // --- END DYNAMIC PROMPT CONSTRUCTION ---

        // Log the final prompt for debugging/verification purposes
        logger.info("Final constructed system prompt being sent to Gemini:", { systemPrompt });
        
        const ai = getAi();
        const chat = ai.chats.create({ 
            model: proModel, 
            config: { systemInstruction: systemPrompt }, 
            history 
        });
        const stream = await chat.sendMessageStream({ message });
      
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
      
        let lastChunk: GenerateContentResponse | undefined;
        for await (const chunk of stream) {
            res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
            lastChunk = chunk;
        }

        if (lastChunk?.usageMetadata) {
            totalTokens = lastChunk.usageMetadata.totalTokenCount ?? 0;
        }
        
        res.write(`data: ${JSON.stringify({ event: 'end' })}\n\n`);
        res.end();

    } catch (error: any) {
        logger.error("Gemini streaming error:", error);
        if (!res.headersSent) {
            res.status(500);
        }
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ event: 'error', error: error.message || 'Error processing chat stream.' })}\n\n`);
          res.end();
        }
    } finally {
        if (totalTokens > 0) {
            const settingsDoc = await systemSettingsCollection.doc('tokenLimits').get();
            const settings = snapshotToData<DBSystemSettings>(settingsDoc);
            const proModel = settings?.geminiProModelName || env.GEMINI_PRO_MODEL;

            await logTokenUsage(
                user.id,
                user.selectedOrganizationId ?? null,
                user.academyId,
                proModel,
                { totalTokens },
                '/api/chat/send-message'
            );
        }
    }
};

export const extractInsights = async (req: Request, res: Response) => {
    const { conversationMessages, personaId } = req.body as { conversationMessages: any[], personaId: string };
    const user = req.user as JwtUserPayload;

    if (!conversationMessages || !Array.isArray(conversationMessages) || !personaId) {
        return res.status(400).json({ message: 'Invalid conversation format or missing personaId.' });
    }
    const transcript = conversationMessages
        .map((msg: { sender: string; text: string; }) => `${msg.sender === 'user' ? 'User' : 'AI'}: ${msg.text}`)
        .join('\n');
    const fullPrompt = `Conversation Transcript:\n---\n${transcript}\n---`;

    try {
        const ai = getAi();
        // --- Get Model Configuration ---
        const settingsDoc = await systemSettingsCollection.doc('tokenLimits').get();
        const settings = snapshotToData<DBSystemSettings>(settingsDoc);
        const proModel = settings?.geminiProModelName || env.GEMINI_PRO_MODEL;

        // --- AUTHORIZATION ---
        // Admins bypass this check.
        if (user.role !== UserRole.ACADEMY_ADMIN && user.role !== UserRole.SYSTEM_ADMIN) {
            const orgDoc = await organizationsCollection.doc(user.selectedOrganizationId).get();
            if (orgDoc.exists) {
                const org = snapshotToData<DBOrganization>(orgDoc)!;
                let hasChatAccess = false; // Default to false
                if (org.planId) {
                    const planDoc = await plansCollection.doc(org.planId).get();
                    if (planDoc.exists) {
                        const plan = snapshotToData<DBPlan>(planDoc)!;
                        if (plan.hasAllChatAccess !== false) {
                            hasChatAccess = true;
                        } else if (plan.accessibleChatPersonaIds?.includes(personaId)) {
                            hasChatAccess = true;
                        }
                        
                        // --- Check Expiration for Extraction ---
                        if (plan.planType === 'one-time' && plan.accessRules?.revokeChat && plan.accessRules.revokeChat !== 'never') {
                            if (plan.accessRules.revokeChat === 'after_duration') {
                                const days = plan.accessRules.revokeChatAfterDays || 0;
                                if (days > 0 && org.createdAt) {
                                    const startDate = (org.createdAt instanceof admin.firestore.Timestamp) ? org.createdAt.toDate() : new Date(org.createdAt);
                                    const expirationDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);
                                    if (new Date() > expirationDate) {
                                        return res.status(403).json({ message: "Access to AI features has expired for your plan." });
                                    }
                                }
                            }
                        }
                    }
                }
                if (!hasChatAccess) {
                    return res.status(403).json({ message: "The chat feature is not enabled for your organization's plan." });
                }
            } else {
                return res.status(403).json({ message: "Organization not found." });
            }
        }
        
        const personaDoc = await chatPersonasCollection.doc(personaId).get();
        if (!personaDoc.exists) {
             return res.status(404).json({ message: "Chat persona not found." });
        }
        const persona = snapshotToData<DBChatPersona>(personaDoc)!;

        if (persona.academyId !== user.academyId) {
            return res.status(403).json({ message: "You do not have permission to use this chat persona." });
        }
        // --- END AUTHORIZATION ---


        const activeExtractionSettings = persona.extractionSettings?.filter(s => s.enabled && s.label.trim() !== '') || [];
        const activeAIInsightSettings = persona.aiInsightSettings?.filter(s => s.enabled && s.label.trim() !== '') || [];
        const aiInsightPrompt = persona.aiInsightPrompt?.trim() || '';

        if (activeExtractionSettings.length === 0 && activeAIInsightSettings.length === 0) {
            return res.json({});
        }

        let extractedData: { [key: string]: string } = {};
        let totalUsageMetadata = { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 };
        const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;

        // --- STEP 1: Perform Extraction if configured ---
        if (activeExtractionSettings.length > 0) {
            const extractionSystemInstruction = `You are an expert in analyzing conversational text. Your task is to analyze the provided conversation transcript and extract specific data points. Based *only* on this transcript, identify and extract the following points:\n` +
                activeExtractionSettings.map(s => `- \`${s.key}\`: This should be the "${s.label}", extracted directly from the conversation.`).join('\n') +
                `\nEach extracted value must be brief — use only as many words as the content requires, and never exceed 100 words per value.\nReturn your analysis *only* as a single, valid JSON object. Respond in the primary language used by the User in the conversation.`;

            const extractionSchemaProperties: { [key: string]: { type: Type, description: string } } = {};
            activeExtractionSettings.forEach(s => {
                extractionSchemaProperties[s.key] = {
                    type: Type.STRING,
                    description: `Extracted value for: ${s.label}`
                };
            });

            const extractionResponse = await ai.models.generateContent({
                model: proModel,
                contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
                config: { 
                    responseMimeType: "application/json", 
                    systemInstruction: extractionSystemInstruction,
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: extractionSchemaProperties,
                        required: activeExtractionSettings.map(s => s.key)
                    }
                }
            });

            if (extractionResponse.usageMetadata) {
                totalUsageMetadata.promptTokenCount += extractionResponse.usageMetadata.promptTokenCount ?? 0;
                totalUsageMetadata.candidatesTokenCount += extractionResponse.usageMetadata.candidatesTokenCount ?? 0;
                totalUsageMetadata.totalTokenCount += extractionResponse.usageMetadata.totalTokenCount ?? 0;
            }
            
            let jsonStr = (extractionResponse.text ?? '').trim();
            const match = jsonStr.match(fenceRegex);
            if (match && match[2]) {
                jsonStr = match[2].trim();
            }
            extractedData = JSON.parse(jsonStr);
        }

        // --- STEP 2: Perform Insight Generation if configured ---
        let generatedInsights: { [key: string]: string } = {};
        if (activeAIInsightSettings.length > 0 && aiInsightPrompt) {
            let dynamicInsightPrompt = aiInsightPrompt;
            for (const key in extractedData) {
                const placeholder = `{${key}}`;
                // Escape special regex characters in the placeholder before creating the RegExp
                const escapedPlaceholder = placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                dynamicInsightPrompt = dynamicInsightPrompt.replace(new RegExp(escapedPlaceholder, 'g'), extractedData[key]);
            }
            // Replace any remaining (unfilled) placeholders with a neutral value
            dynamicInsightPrompt = dynamicInsightPrompt.replace(/\{(field\d+|insight\d+)\}/g, '(not available)');
            
            const insightSystemInstruction = `You are an expert in analyzing conversational text to generate psychological insights. Your task is to analyze the provided conversation transcript.\n**Instructions for generating insights:** ${dynamicInsightPrompt}\n**Insights to generate:**\n` +
                activeAIInsightSettings.map(s => `- \`${s.key}\`: This should be your generated "${s.label}".`).join('\n') +
                `\nEach insight must be brief — use only as many words as the content requires, and never exceed 100 words per insight.\nReturn your complete analysis *only* as a single, valid JSON object. Respond in the primary language used by the User in the conversation.`;

            const insightSchemaProperties: { [key: string]: { type: Type, description: string } } = {};
            activeAIInsightSettings.forEach(s => {
                insightSchemaProperties[s.key] = {
                    type: Type.STRING,
                    description: `Generated insight for: ${s.label}`
                };
            });

            const insightResponse = await ai.models.generateContent({
                model: proModel,
                contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
                config: { 
                    responseMimeType: "application/json", 
                    systemInstruction: insightSystemInstruction,
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: insightSchemaProperties,
                        required: activeAIInsightSettings.map(s => s.key)
                    }
                }
            });
            
            if (insightResponse.usageMetadata) {
                totalUsageMetadata.promptTokenCount += insightResponse.usageMetadata.promptTokenCount ?? 0;
                totalUsageMetadata.candidatesTokenCount += insightResponse.usageMetadata.candidatesTokenCount ?? 0;
                totalUsageMetadata.totalTokenCount += insightResponse.usageMetadata.totalTokenCount ?? 0;
            }

            let jsonStr = (insightResponse.text ?? '').trim();
            const match = jsonStr.match(fenceRegex);
            if (match && match[2]) {
                jsonStr = match[2].trim();
            }
            generatedInsights = JSON.parse(jsonStr);
        }

        // --- STEP 3: Combine and Respond ---
        const finalResult = { ...extractedData, ...generatedInsights };

        if (totalUsageMetadata.totalTokenCount > 0) {
            await logTokenUsage(
                user.id,
                user.selectedOrganizationId ?? null,
                user.academyId,
                proModel,
                { totalTokens: totalUsageMetadata.totalTokenCount },
                '/api/chat/extract-insights'
            );
        }

        res.json(finalResult);

    } catch (error: any) {
        logger.error('Error extracting insights:', error);
        res.status(500).json({ message: 'Failed to extract insights', error: error.message });
    }
};
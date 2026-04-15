
import { GoogleGenAI } from "@google/genai";
import * as logger from "firebase-functions/logger";

import { env } from "../config/env.js";

let ai: GoogleGenAI | null = null;

/**
 * Lazily initializes and returns a singleton instance of the GoogleGenAI client.
 * This prevents the client from being instantiated at module-load time, which would
 * cause a crash during deployment analysis when environment variables are not available.
 * @returns {GoogleGenAI} The initialized GoogleGenAI client.
 */
export const getAi = (): GoogleGenAI => {
    if (!ai) {
        // This initialization now only happens the first time getAi() is called,
        // which will be within an active function execution where secrets are available.
        ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    }
    return ai;
};


export const prepareSystemPrompt = async (basePrompt: string): Promise<string> => {
    // The placeholder {DYNAMIC_TRIGGER_PHRASES_LIST} is no longer used in the new control token logic.
    // However, to maintain compatibility if the controller still sends a prompt containing it (temporarily),
    // we simply replace it with an empty string.
    return basePrompt.replace('{DYNAMIC_TRIGGER_PHRASES_LIST}', '');
};
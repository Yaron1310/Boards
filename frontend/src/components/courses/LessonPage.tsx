import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import ReactDOM from 'react-dom';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useData } from '../../hooks/useData';
import { useAuth } from '../../hooks/useAuth';
import { Lesson, LessonAssignment, Message } from '../../types';
import * as apiService from '../../services/geminiService';
import { FiLoader, FiArrowLeft, FiCheckCircle, FiCircle, FiMessageSquare, FiAirplay, FiX, FiInfo, FiCode, FiAlertCircle, FiLock, FiAlertTriangle } from 'react-icons/fi';
import QuestionnaireIcon from '../common/QuestionnaireIcon';
import LessonChat from './LessonChat';
import LessonQuiz from './LessonQuiz';
import ChatInterfacePage, { ChatInterfaceHandle } from '../chat/ChatInterfacePage';
import QuestionnairePage from '../questionnaire/user/QuestionnairePage';

// Helper to parse video URL and return provider and ID
const parseVideoUrl = (url: string, isBridgeVideo?: boolean) => {
    if (isBridgeVideo) {
        return { provider: 'bridge' as const, videoId: null };
    }
    if (!url) return null;
    let videoId: string | null = null;
    let provider: 'youtube' | 'vimeo' | 'generic' | null = null;

    // YouTube: various URL formats
    let match = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (match && match[1]) {
        videoId = match[1];
        provider = 'youtube';
    }

    // Vimeo: various URL formats
    if (!videoId) {
        match = url.match(/(?:https?:\/\/)?(?:www\.)?(?:player\.)?vimeo\.com\/(?:video\/)?(\d+)/);
        if (match && match[1]) {
            videoId = match[1];
            provider = 'vimeo';
        }
    }

    // Fallback: any other URL — render as native <video> element
    if (!provider && url.startsWith('http')) {
        provider = 'generic';
        videoId = url;
    }

    return { provider, videoId };
};


const LessonPage: React.FC = () => {
    const { t } = useTranslation();
    const { courseId, lessonId } = useParams<{ courseId: string; lessonId: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { courses, fetchCourseWithLessons, myProgress, markLessonComplete, conversations, myQuestionnaireResults, fetchUserConversations, fetchMyLatestResults, savePersonalInsight } = useData();

    // Derive lesson and accessMode from DataContext cache — no local state needed.
    const courseData = courses.find(c => c.id === courseId);
    const lesson: Lesson | null = courseData?.lessons?.find(l => l.id === lessonId) ?? null;
    const accessMode = courseData?.accessMode ?? 'full';
    // Show spinner until the course with lessons is in DataContext.
    const isLoading = courseData?.lessons == null;
    const [isCompleting, setIsCompleting] = useState(false);
    const [isChatOpenOnMobile, setIsChatOpenOnMobile] = useState(false);
    
    // Internal state to track "opened" custom code assignments in current session
    const [viewedCustomCodes, setViewedCustomCodes] = useState<Set<string>>(new Set());
    const [insightSaveFeedback, setInsightSaveFeedback] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
    useEffect(() => {
    if (insightSaveFeedback) {
      const timer = setTimeout(() => {
        setInsightSaveFeedback(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [insightSaveFeedback]);
  

    // Assignment and Video Player State
    const [activeAssignment, setActiveAssignment] = useState<LessonAssignment | null>(null);
    const [player, setPlayer] = useState<any>(null);
    const playerRef = useRef<any>(null);

    const timeUpdateIntervalRef = useRef<number | null>(null);
    const [triggeredAssignments, setTriggeredAssignments] = useState<Set<string>>(new Set());

    // New state for time-based completion
    const chatInterfaceRef = useRef<ChatInterfaceHandle>(null);
    // Ref so the postMessage handler (inside a stale closure) can read the current assignment
    const activeAssignmentRef = useRef<LessonAssignment | null>(null);
    const [assignmentStartTime, setAssignmentStartTime] = useState<number | null>(null);
    const [showCloseWarningModal, setShowCloseWarningModal] = useState(false);
    const [isSavingCompletion, setIsSavingCompletion] = useState(false);


    // Fetch the full course into DataContext only when lessons aren't cached yet.
    // This also re-triggers if a background coursesQuery refetch (e.g. on window focus)
    // overwrites the cache with data that lacks lessons.
    const lessonsAvailable = courseData?.lessons != null;
    useEffect(() => {
        if (!courseId || !lessonId) return;
        if (!lessonsAvailable) {
            fetchCourseWithLessons(courseId).catch(() => navigate(`/courses/${courseId}`));
        }
    }, [courseId, lessonId, lessonsAvailable, fetchCourseWithLessons, navigate]);

    // After the fetch completes, courseData updates reactively via DataContext.
    // If the specific lesson is still not found, redirect to the course page.
    useEffect(() => {
        if (!isLoading && courseData?.lessons != null && !lesson) {
            navigate(`/courses/${courseId}`);
        }
    }, [isLoading, lesson, courseData, courseId, navigate]);
    
    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            
            // This handler allows custom code to directly push an insight,
            // which can be useful for assignments that don't use the standard "finish button" flow.
            if (event.data && event.data.type === 'GYMIND_INSIGHT_EVENT') {
                const { payload } = event.data;
                
                if (payload && payload.key && payload.label && payload.value !== undefined) {
                    setInsightSaveFeedback(null);
                    const result = await savePersonalInsight(payload);
                    if (result) {
                        setInsightSaveFeedback({ type: 'success', text: `Insight '${payload.label}' saved!` });
                    } else {
                        setInsightSaveFeedback({ type: 'error', text: `Failed to save insight '${payload.label}'.` });
                    }
                    setTimeout(() => setInsightSaveFeedback(null), 5000);
                }
            }
            
            // This handler receives insights gathered inside the iframe via the close event payload.
            if (event.data && event.data.type === 'GYMIND_CLOSE_IFRAME_EVENT') {
                const insightsFromIframe: Array<{ key: string; label: string; value: string }> = event.data.insights || [];

                if (insightsFromIframe.length > 0) {
                    setInsightSaveFeedback({ type: 'info', text: 'Saving insights...' });
                    try {
                        const savePromises = insightsFromIframe.map(insight => savePersonalInsight(insight));
                        const results = await Promise.all(savePromises);

                        if (results.some(r => r === null)) {
                            throw new Error('Failed to save one or more insights.');
                        }

                        setInsightSaveFeedback({ type: 'success', text: 'All insights saved successfully!' });
                        setTimeout(() => setInsightSaveFeedback(null), 3000);
                    } catch (error) {
                        console.error("An error occurred while saving insights:", error);
                        setInsightSaveFeedback({ type: 'error', text: 'An error occurred while saving insights.' });
                        setTimeout(() => setInsightSaveFeedback(null), 5000);
                    }
                }

                // Mark a mandatory custom_code assignment as complete when the
                // finish button inside the iframe sends this event.
                const finished = activeAssignmentRef.current;
                if (finished?.type === 'custom_code' && finished.isMandatory) {
                    setViewedCustomCodes(prev => new Set(prev).add(finished.id));
                }

                setActiveAssignment(null);
            }
        };

        window.addEventListener('message', handleMessage);

        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [savePersonalInsight]);


    // Keep ref in sync so stale closures (e.g. postMessage handler) always see current value
    useEffect(() => {
        activeAssignmentRef.current = activeAssignment;
    }, [activeAssignment]);

    // Ensure we have latest user data for checking completion
    useEffect(() => {
        if (lesson?.assignments && lesson.assignments.length > 0) {
            if (conversations.length === 0) fetchUserConversations();
            if (myQuestionnaireResults.length === 0) fetchMyLatestResults();
        }
    }, [lesson, fetchUserConversations, fetchMyLatestResults, conversations.length, myQuestionnaireResults.length]);
    

    const isAssignmentComplete = useCallback((assignment: LessonAssignment) => {
        if (assignment.type === 'chat') {
            return conversations.some(c => c.personaId === assignment.id);
        } else if (assignment.type === 'questionnaire') {
            return myQuestionnaireResults.some(r => r.questionnaireId === assignment.id && (r.source === 'assignment' || !r.source));
        } else if (assignment.type === 'custom_code') {
            return viewedCustomCodes.has(assignment.id);
        }
        return false;
    }, [conversations, myQuestionnaireResults, viewedCustomCodes]);

    const handleOpenAssignment = useCallback((assignment: LessonAssignment) => {
        // Non-mandatory custom_code assignments are marked complete just by opening them.
        // Mandatory ones require the finish button (endButtonId) to be clicked inside the iframe.
        if (assignment.type === 'custom_code' && !assignment.isMandatory) {
            setViewedCustomCodes(prev => new Set(prev).add(assignment.id));
        }
        if (assignment.type === 'chat') {
            setAssignmentStartTime(Date.now());
        }
        setActiveAssignment(assignment);
    }, []);

    const handleAttemptCloseAssignment = async () => {
        // If the assignment is already complete, just close the modal without any checks.
        if (activeAssignment && isAssignmentComplete(activeAssignment)) {
            setActiveAssignment(null);
            setAssignmentStartTime(null);
            return;
        }
    
        if (activeAssignment?.type === 'chat' && assignmentStartTime) {
            const elapsedSeconds = (Date.now() - assignmentStartTime) / 1000;
    
            if (elapsedSeconds < 60) {
                setShowCloseWarningModal(true);
                return; // Don't close yet, wait for user confirmation
            } else {
                // Time threshold met. Mark as complete by saving.
                setIsSavingCompletion(true);
                const success = await chatInterfaceRef.current?.saveSessionForCompletion();
                setIsSavingCompletion(false);
                if (success) {
                    // This fetches latest conversations, which will update the `isAssignmentComplete` check.
                    handleAssignmentSessionCompleted();
                } else {
                    // Optional: Show an error that saving failed.
                    // For now, we still close the modal. The assignment just won't be marked complete.
                }
            }
        }
        
        // Close for non-chat types, or after logic completes for chat types
        setActiveAssignment(null);
        setAssignmentStartTime(null);
    };

    // Close any open assignment modal (or mobile chat) when Esc is pressed
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (activeAssignment) {
                handleAttemptCloseAssignment();
            } else if (isChatOpenOnMobile) {
                setIsChatOpenOnMobile(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeAssignment, isChatOpenOnMobile]); // eslint-disable-line react-hooks/exhaustive-deps

    const [bridgeError, setBridgeError] = useState<string | null>(null);

    // Effect to initialize and destroy the video player
    useEffect(() => {
        const isBridge = lesson?.isBridgeVideo;
        if (!isBridge && !lesson?.videoUrl) return;

        const videoInfo = parseVideoUrl(lesson?.videoUrl || '', isBridge);

        if (!videoInfo?.provider) {
            return;
        }

        const destroyPlayer = () => {
            if (playerRef.current) {
                if (typeof playerRef.current.destroy === 'function') {
                    playerRef.current.destroy();
                }
                playerRef.current = null;
                setPlayer(null);
            }
            const playerContainer = document.getElementById('video-player');
            if (playerContainer) playerContainer.innerHTML = '';
        };

        if (videoInfo.provider === 'bridge') {
            if (!courseId || !lessonId) return;
            setBridgeError(null);
            let hasRefreshedToken = false;
            const initBridgePlayer = async () => {
                try {
                    const { playbackUrl } = await apiService.getBridgeToken(courseId, lessonId);
                    destroyPlayer();
                    const playerContainer = document.getElementById('video-player');
                    if (!playerContainer) return;

                    const video = document.createElement('video');
                    video.src = playbackUrl;
                    video.controls = true;
                    video.className = 'w-full h-full';
                    video.preload = 'metadata';
                    video.crossOrigin = 'anonymous';
                    playerContainer.appendChild(video);

                    video.addEventListener('loadedmetadata', () => {
                        playerRef.current = {
                            getCurrentTime: () => Promise.resolve(video.currentTime),
                            pauseVideo: () => video.pause(),
                            pause: () => video.pause(),
                            destroy: () => { video.pause(); video.removeAttribute('src'); video.load(); }
                        };
                        setPlayer(playerRef.current);
                    });

                    video.addEventListener('error', async () => {
                        // On error (e.g. expired token), try refreshing the token once
                        if (!hasRefreshedToken) {
                            hasRefreshedToken = true;
                            try {
                                const currentTime = video.currentTime;
                                const refreshed = await apiService.getBridgeToken(courseId, lessonId);
                                video.src = refreshed.playbackUrl;
                                video.currentTime = currentTime;
                                video.play().catch(() => { /* autoplay may be blocked */ });
                            } catch {
                                setBridgeError('This video is hosted by your organization and is currently unavailable. Contact your IT administrator.');
                            }
                        } else {
                            setBridgeError('This video is hosted by your organization and is currently unavailable. Contact your IT administrator.');
                        }
                    });
                } catch {
                    setBridgeError('This video is hosted by your organization and is currently unavailable. Contact your IT administrator.');
                }
            };
            initBridgePlayer();
        } else if (videoInfo.provider === 'youtube') {
            const initYoutubePlayer = () => {
                destroyPlayer();
                playerRef.current = new (window as any).YT.Player('video-player', {
                    height: '100%',
                    width: '100%',
                    videoId: videoInfo.videoId,
                    playerVars: { 'playsinline': 1, 'modestbranding': 1, 'rel': 0 },
                    events: { 'onReady': (event: any) => setPlayer(event.target) }
                });
            };

            if ((window as any).YT && (window as any).YT.Player) {
                initYoutubePlayer();
            } else {
                (window as any).onYouTubeIframeAPIReady = initYoutubePlayer;
            }
        } else if (videoInfo.provider === 'vimeo' && (window as any).Vimeo) {
            destroyPlayer();
            playerRef.current = new (window as any).Vimeo.Player('video-player', {
                id: parseInt(videoInfo.videoId!, 10),
                responsive: true
            });
            playerRef.current.ready().then(() => {
                setPlayer(playerRef.current);
            });
        } else if (videoInfo.provider === 'generic' && videoInfo.videoId) {
            destroyPlayer();
            const playerContainer = document.getElementById('video-player');
            if (!playerContainer) return;

            const video = document.createElement('video');
            video.src = videoInfo.videoId;
            video.controls = true;
            video.className = 'w-full h-full';
            video.preload = 'metadata';
            playerContainer.appendChild(video);

            video.addEventListener('loadedmetadata', () => {
                playerRef.current = {
                    getCurrentTime: () => Promise.resolve(video.currentTime),
                    pauseVideo: () => video.pause(),
                    pause: () => video.pause(),
                    destroy: () => { video.pause(); video.removeAttribute('src'); video.load(); }
                };
                setPlayer(playerRef.current);
            });
        }

        return () => {
            if (timeUpdateIntervalRef.current) clearInterval(timeUpdateIntervalRef.current);
            destroyPlayer();
        };
    }, [lesson?.videoUrl, lesson?.isBridgeVideo, courseId, lessonId]);

    // Effect for monitoring video time to trigger assignments
    useEffect(() => {
        if (!player || !lesson?.assignments || lesson.assignments.length === 0) return;

        if (timeUpdateIntervalRef.current) clearInterval(timeUpdateIntervalRef.current);

        const checkTime = async () => {
            try {
                const currentTime = await player.getCurrentTime();
                for (const assignment of lesson.assignments!) {
                    if (assignment.autoOpenEnabled &&
                        assignment.autoOpenTimestamp !== undefined &&
                        assignment.autoOpenTimestamp !== null &&
                        !triggeredAssignments.has(assignment.id) &&
                        currentTime >= assignment.autoOpenTimestamp) {
                        
                        if (player.pauseVideo) player.pauseVideo(); // YouTube
                        else player.pause(); // Vimeo

                        if (document.fullscreenElement) {
                            try { await document.exitFullscreen(); } catch { /* ignore */ }
                        }

                        handleOpenAssignment(assignment);
                        setTriggeredAssignments(prev => new Set(prev).add(assignment.id));
                    }
                }
            } catch (error) {
                // This can happen briefly when the player is destroyed; it's safe to ignore.
            }
        };

        timeUpdateIntervalRef.current = window.setInterval(checkTime, 500);

        return () => {
            if (timeUpdateIntervalRef.current) clearInterval(timeUpdateIntervalRef.current);
        };
    }, [player, lesson?.assignments, triggeredAssignments, handleOpenAssignment]);


    const mandatoryAssignmentsIncomplete = useMemo(() => {
        if (!lesson?.assignments) return false;
        return lesson.assignments.some(a => a.isMandatory && !isAssignmentComplete(a));
    }, [lesson, isAssignmentComplete]);

    const handleMarkComplete = async () => {
        if (!courseId || !lessonId) return;
        setIsCompleting(true);
        try {
            await markLessonComplete(courseId, lessonId);
        } catch (error) {
            console.error("Failed to mark lesson as complete:", error);
        } finally {
            setIsCompleting(false);
        }
    };
    
    // Callback when an embedded session is finished (e.g., chat saved or questionnaire submitted)
    const handleAssignmentSessionCompleted = () => {
        fetchUserConversations();
        fetchMyLatestResults();
    };

    const isCompleted = myProgress.find(p => p.courseId === courseId)?.completedLessons.includes(lessonId ?? '') ?? false;

    const assembleAssignmentHtml = (html: string, css: string, js: string): string => {
        let result = html;
        if (css) {
            const tag = `<style>\n${css}\n</style>`;
            result = result.includes('</head>') ? result.replace('</head>', `${tag}\n</head>`) : tag + result;
        }
        if (js) {
            const tag = `<script>\n${js}\n</script>`;
            result = result.includes('</body>') ? result.replace('</body>', `${tag}\n</body>`) : result + tag;
        }
        return result;
    };

    const generateInjectedHtmlForAssignment = (assignment: LessonAssignment): string => {
        let finalHtml = (assignment.customCss || assignment.customJs)
            ? assembleAssignmentHtml(assignment.customHtml || '', assignment.customCss || '', assignment.customJs || '')
            : (assignment.customHtml || '');
        let scriptsToInject = '';

        // Inject a style override to ensure the body of the iframe is scrollable.
        // This counteracts any `overflow: hidden` that might be present in the custom HTML.
        const styleOverride = `<style>body { overflow: auto !important; }</style>`;

        if (finalHtml.includes('</head>')) {
            finalHtml = finalHtml.replace('</head>', `${styleOverride}</head>`);
        } else {
            // If no <head> tag, prepend to the whole document.
            // Browsers are lenient and will apply the style.
            finalHtml = styleOverride + finalHtml;
        }

        if (assignment.endButtonId) {
            const insightFieldsJson = JSON.stringify(assignment.insightFields || []);
            const endButtonScript = `
                <script>
                document.addEventListener('DOMContentLoaded', function() {
                    try {
                        const endButtonId = '${assignment.endButtonId}';
                        const endButton = document.getElementById(endButtonId);
                        if (endButton) {
                            endButton.addEventListener('click', function(event) {
                                event.preventDefault();
                                var insightFields = ${insightFieldsJson};
                                var insights = [];
                                for (var i = 0; i < insightFields.length; i++) {
                                    var field = insightFields[i];
                                    var element = document.getElementById(field.htmlElementId);
                                    if (element) {
                                        var value;
                                        var tag = element.tagName ? element.tagName.toUpperCase() : '';
                                        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
                                            value = element.value;
                                        } else {
                                            var dataVal = element.getAttribute('data-gymind-value');
                                            if (dataVal !== null) value = dataVal;
                                        }
                                        if (value !== undefined) {
                                            insights.push({ key: field.key, label: field.label, value: value });
                                        }
                                    }
                                }
                                window.parent.postMessage({ type: 'GYMIND_CLOSE_IFRAME_EVENT', insights: insights }, '*');
                            });
                        } else {
                            console.error('Gymind "End Button" with ID "' + endButtonId + '" was NOT FOUND in the custom HTML.');
                        }
                    } catch (e) {
                        console.error('Error attaching end button listener:', e);
                    }
                });
                </script>
            `;
            scriptsToInject += endButtonScript;
        }
        
        return finalHtml + scriptsToInject;
    };

    if (isLoading) {
        return <div className="flex justify-center items-center h-full"><FiLoader className="animate-spin h-8 w-8 text-blue-500" /></div>;
    }

    if (!lesson) {
        return <div className="text-center p-8 text-red-600">{t('courses.lessonNotFound')}</div>;
    }

    const hasQuiz = lesson.questions && lesson.questions.length > 0;
    const isCustomCodeAssignment = activeAssignment?.type === 'custom_code';
    const isReadOnly = accessMode === 'read_only';

    return (
        <div className="flex flex-col h-full bg-white md:max-w-6xl md:mx-auto md:shadow-xl md:rounded-lg overflow-hidden relative">
            {insightSaveFeedback && (
                <div
                    role={insightSaveFeedback.type === 'error' ? 'alert' : 'status'}
                    className={`fixed bottom-4 right-4 z-[100] p-4 rounded-lg shadow-lg flex items-center text-white ${
                        insightSaveFeedback.type === 'success' ? 'bg-green-500' :
                        insightSaveFeedback.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
                    }`}
                >
                    {insightSaveFeedback.type === 'success' ? <FiCheckCircle className="mr-2"/> : (insightSaveFeedback.type === 'error' ? <FiAlertCircle className="mr-2"/> : <FiLoader className="animate-spin mr-2"/>)}
                    {insightSaveFeedback.text}
                </div>
            )}
            
            {/* View Only Banner */}
            {isReadOnly && (
                <div className="bg-orange-100 text-orange-800 p-2 text-center text-sm font-semibold border-b border-orange-200 z-50">
                    <FiLock className="inline-block mr-2" /> {t('courses.viewOnlyAccess')}
                </div>
            )}

            <header className="bg-gray-800 text-white p-4 flex justify-between items-center h-16 shadow-md md:rounded-t-lg flex-shrink-0 z-10">
                <div className="flex items-center min-w-0">
                    <Link to={`/courses/${courseId}`} className="p-2 rounded-full hover:bg-gray-700 mr-3 flex-shrink-0" aria-label={t('courses.backToCourse')}>
                        <FiArrowLeft size={20} className="rtl-flip" />
                    </Link>
                    <div className="min-w-0">
                        <h1 className="text-xl font-semibold truncate">{lesson.name}</h1>
                        <p className="text-xs text-gray-300">{t('courses.lessonNumber', { number: lesson.order })}</p>
                    </div>
                </div>
                {lesson.powerpointUrl && (
                    <a href={lesson.powerpointUrl} target="_blank" rel="noopener noreferrer" className="bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center transition-colors text-sm ml-2 flex-shrink-0">
                        <FiAirplay className="mr-2" /> <span className="hidden sm:inline">{t('courses.openSlideshow')}</span>
                    </a>
                )}
            </header>
            
            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                {/* Main Content (Video + Description + Assignments) */}
                <div className="w-full lg:w-2/3 flex flex-col overflow-y-auto custom-scrollbar pb-24 lg:pb-0">
                    <div className="aspect-w-16 aspect-h-9 bg-black relative">
                         <div id="video-player" className="w-full h-full" />
                         {bridgeError && (
                             <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-90 p-6">
                                 <div className="text-center max-w-md">
                                     <FiAlertCircle className="mx-auto text-yellow-400 mb-3" size={32} />
                                     <p className="text-white text-sm">{bridgeError}</p>
                                 </div>
                             </div>
                         )}
                    </div>
                    
                    <div className="p-6">
                        <h2 className="text-2xl font-semibold text-gray-800 mb-4">{t('courses.aboutThisLesson')}</h2>
                        <p className="text-gray-600 leading-relaxed whitespace-pre-line">{lesson.description}</p>
                    </div>

                    {/* Lesson Assignments */}
                    {lesson.assignments && lesson.assignments.length > 0 && (
                        <div className="px-6 pt-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                                {t('courses.lessonAssignments')}
                                <span className="ml-2 text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full border">
                                    {t('courses.completeMarkedItems')}
                                </span>
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {lesson.assignments.map((assignment) => {
                                    const completed = isAssignmentComplete(assignment);
                                    // Disable assignment if read-only and it relies on AI
                                    const assignmentDisabled = isReadOnly && (assignment.type === 'chat'); 
                                    
                                    return (
                                        <button
                                            key={`${assignment.type}_${assignment.id}`}
                                            onClick={() => !assignmentDisabled && handleOpenAssignment(assignment)}
                                            disabled={assignmentDisabled}
                                            className={`flex items-center p-4 border rounded-lg transition-all text-left shadow-sm hover:shadow-md relative
                                                ${assignmentDisabled ? 'opacity-60 cursor-not-allowed bg-gray-50' : 
                                                  completed 
                                                    ? 'bg-green-50 border-green-200 hover:border-green-300' 
                                                    : assignment.isMandatory 
                                                        ? 'bg-white border-orange-200 hover:border-orange-400' 
                                                        : 'bg-white border-gray-200 hover:border-blue-300'
                                                }`}
                                        >
                                            <div className={`p-3 rounded-full mr-4 flex-shrink-0 ${
                                                completed ? 'bg-green-200 text-green-700' :
                                                assignment.type === 'chat' ? 'bg-blue-100 text-blue-600' : 
                                                assignment.type === 'questionnaire' ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-600'
                                            }`}>
                                                {completed ? <FiCheckCircle size={20}/> : 
                                                 (assignment.type === 'chat' ? <FiMessageSquare size={20}/> : 
                                                  assignment.type === 'questionnaire' ? <QuestionnaireIcon size={20} height={20} width={20} /> : <FiCode size={20}/>)}
                                            </div>
                                            <div className="flex-grow">
                                                <p className={`font-semibold ${completed ? 'text-green-800' : 'text-gray-800'}`}>{assignment.name}</p>
                                                <div className="flex items-center mt-1">
                                                    <span className="text-xs text-gray-500 uppercase font-bold tracking-wide mr-2">{assignment.type.replace('_', ' ')}</span>
                                                    {assignment.isMandatory && !completed && (
                                                        <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-bold uppercase border border-orange-200">{t('common.required')}</span>
                                                    )}
                                                </div>
                                            </div>
                                            {assignmentDisabled && (
                                                <div className="absolute top-2 right-2 text-gray-400">
                                                    <FiLock size={16} />
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    
                    <div className="p-6 mt-auto">
                       {isCompleted ? (
                             <button disabled className="w-full py-3 px-4 rounded-lg font-semibold text-white transition-colors flex items-center justify-center bg-green-500 cursor-not-allowed">
                                <FiCheckCircle className="mr-2"/> {t('courses.lessonCompleted')}
                            </button>
                       ) : hasQuiz ? (
                           <>
                                {mandatoryAssignmentsIncomplete && (
                                    <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-md text-sm text-orange-800 flex items-center">
                                        <FiInfo className="mr-2 flex-shrink-0"/> {t('courses.completeAssignmentsBeforeQuiz')}
                                    </div>
                                )}
                                <LessonQuiz questions={lesson.questions!} onComplete={handleMarkComplete} isCompleting={isCompleting} disabled={mandatoryAssignmentsIncomplete || isReadOnly} />
                           </>
                       ) : (
                            <>
                                {mandatoryAssignmentsIncomplete && (
                                    <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-md text-sm text-orange-800 flex items-center">
                                        <FiInfo className="mr-2 flex-shrink-0"/> {t('courses.completeAssignmentsToFinish')}
                                    </div>
                                )}
                                <button
                                    onClick={handleMarkComplete}
                                    disabled={isCompleting || mandatoryAssignmentsIncomplete || isReadOnly}
                                    className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-colors flex items-center justify-center ${
                                        isCompleting ? 'bg-blue-400 cursor-wait' :
                                        (mandatoryAssignmentsIncomplete || isReadOnly) ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                                    }`}
                                >
                                    {isCompleting ? <FiLoader className="animate-spin mr-2"/> : <FiCircle className="mr-2"/>}
                                    {t('courses.markAsComplete')}
                                </button>
                            </>
                       )}
                    </div>
                </div>

                {/* Chat Section for Desktop */}
                <div className="hidden lg:flex w-full lg:w-1/3 border-t-2 lg:border-t-0 lg:border-l-2 border-gray-200 flex-col h-full lg:max-h-full bg-gray-50">
                    {isReadOnly ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 p-6 text-center">
                            <FiLock size={48} className="mb-4 text-gray-400" />
                            <h3 className="text-lg font-semibold text-gray-600">{t('courses.aiMentorDisabled')}</h3>
                            <p className="text-sm mt-2">{t('courses.viewOnlyMode')}</p>
                        </div>
                    ) : (
                        <LessonChat lesson={lesson} />
                    )}
                </div>
            </div>

            {/* Sticky Chat Button for Mobile */}
            {!isReadOnly && (
                <div className="lg:hidden fixed bottom-0 left-0 right-0 p-3 bg-white/90 backdrop-blur-sm border-t border-gray-200 z-30">
                    <button
                        onClick={() => setIsChatOpenOnMobile(true)}
                        className="w-full bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg shadow-lg flex items-center justify-center text-base hover:bg-blue-700 active:bg-blue-800 transition-colors"
                    >
                        <FiMessageSquare className="mr-3" /> {t('courses.chatWithAI')}
                    </button>
                </div>
            )}

             {/* Mobile Chat Overlay */}
            {isChatOpenOnMobile && !isReadOnly && (
                <div className="fixed inset-0 z-50 flex flex-col bg-white lg:hidden">
                    <LessonChat lesson={lesson} onClose={() => setIsChatOpenOnMobile(false)} />
                </div>
            )}

            {/* Assignment Modal */}
            {activeAssignment && ReactDOM.createPortal(
                <div className={`fixed inset-0 z-[60] bg-black bg-opacity-75 flex items-center justify-center ${isCustomCodeAssignment ? 'p-0 md:p-4' : 'p-4'}`}>
                    <div className={`w-full relative flex flex-col bg-white overflow-hidden ${isCustomCodeAssignment ? 'h-full md:max-w-6xl md:h-[90vh] md:rounded-xl md:shadow-2xl' : 'max-w-5xl h-[90vh] rounded-xl shadow-2xl'}`}>
                        {/* Only show the absolute close button if NOT a chat assignment */}
                        {activeAssignment.type !== 'chat' && (
                            <button
                                onClick={handleAttemptCloseAssignment}
                                className="absolute top-3 right-3 z-50 bg-gray-100 hover:bg-gray-200 p-2 rounded-full shadow-sm transition-colors"
                                aria-label={t('courses.closeAssignment')}
                            >
                                <FiX size={24} className="text-gray-600"/>
                            </button>
                        )}
                        
                        <div className="flex-grow overflow-hidden">
                            {activeAssignment.type === 'chat' ? (
                                <ChatInterfacePage 
                                    ref={chatInterfaceRef}
                                    embeddedPersonaId={activeAssignment.id} 
                                    isEmbedded={true}
                                    onSessionSaved={handleAssignmentSessionCompleted}
                                    isEphemeralSession={true}
                                    onClose={handleAttemptCloseAssignment}
                                    isInsightsPrivateByDefault={activeAssignment.isInsightsPrivate}
                                />
                            ) : activeAssignment.type === 'questionnaire' ? (
                                <QuestionnairePage 
                                    embeddedQuestionnaireId={activeAssignment.id} 
                                    isEmbedded={true}
                                    onSessionSaved={handleAssignmentSessionCompleted}
                                />
                            ) : (
                                <div className="w-full h-full flex flex-col bg-gray-50">
                                    <header className="p-4 bg-white border-b flex items-center">
                                        <FiCode className="text-gray-500 mr-2"/>
                                        <h3 className="font-semibold text-gray-800">{activeAssignment.name}</h3>
                                    </header>
                                    <div className="flex-grow">
                                        <iframe 
                                            title={activeAssignment.name}
                                            srcDoc={generateInjectedHtmlForAssignment(activeAssignment)}
                                            sandbox="allow-scripts allow-forms"
                                            className="w-full h-full border-none"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.getElementById('modal-root')!
            )}

            {/* Close Warning Modal */}
            {showCloseWarningModal && ReactDOM.createPortal(
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[70]">
                    <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full">
                        <div className="flex items-start mb-4">
                            <FiAlertTriangle className="text-orange-500 h-8 w-8 mr-3 mt-1"/>
                            <div>
                                <h3 className="text-xl font-semibold text-gray-800">{t('courses.exitAssignment')}</h3>
                            </div>
                        </div>
                        <p className="text-gray-600 mb-6">
                           {t('courses.exitAssignmentWarning')}
                        </p>
                        <div className="flex justify-end space-x-3">
                            <button data-modal-escape onClick={() => setShowCloseWarningModal(false)} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">{t('courses.continueAssignment')}</button>
                            <button onClick={() => { setShowCloseWarningModal(false); setActiveAssignment(null); setAssignmentStartTime(null); }} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300">{t('courses.exitAnyway')}</button>
                        </div>
                    </div>
                </div>,
                document.getElementById('modal-root')!
            )}
        </div>
    );
};

// Ensure aspect ratio CSS is available
const style = document.createElement('style');
style.innerHTML = `
.aspect-w-16 { position: relative; padding-bottom: 56.25%; }
.aspect-w-16 > iframe, .aspect-w-16 > video, .aspect-w-16 > div { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
`;
document.head.appendChild(style);


export default LessonPage;
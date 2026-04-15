

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useData } from '../../../hooks/useData';
import { useAuth } from '../../../hooks/useAuth';
import type { Questionnaire, UserQuestionnaireResult, Question } from '../../../types';
import QuestionnaireInstructions from './QuestionnaireInstructions';
import QuestionnaireStep from './QuestionnaireStep';
import QuestionnaireResults from './QuestionnaireResults';
import QuestionnaireIcon from '../../common/QuestionnaireIcon';
import { FiLoader, FiAlertCircle, FiLock, FiBookOpen, FiChevronsRight, FiCornerUpRight } from 'react-icons/fi';
import * as apiService from '../../../services/geminiService';
import { loadFromLocalStorage, saveToLocalStorage } from '../../../contexts/DataContext';
import SubscriptionRequiredBanner from '../../common/SubscriptionRequiredBanner';


type PageState = 'loading' | 'list' | 'instructions' | 'taking' | 'results' | 'error';
type AnswersState = Record<string, any>; // Categorical: Score (number), Custom: AnswerID (string) or Text (string)

interface QuestionnairePageProps {
    embeddedQuestionnaireId?: string;
    isEmbedded?: boolean;
    onSessionSaved?: () => void;
}

const QuestionnairePage: React.FC<QuestionnairePageProps> = ({ embeddedQuestionnaireId, isEmbedded = false, onSessionSaved }) => {
  const { t } = useTranslation();
  const source: 'standalone' | 'assignment' = isEmbedded ? 'assignment' : 'standalone';
  const storageKeySuffix = isEmbedded ? '_assignment' : '';
  const { user, selectedOrganization, isOrgSubscriptionActive } = useAuth();
  const {
    myQuestionnaireResults,
    fetchMyLatestResults,
    saveQuestionnaireResult,
    publishedQuestionnaires: ctxPublishedQuestionnaires,
    fetchPublishedQuestionnaires,
    dataError: dataCtxError,
  } = useData();

  // List mode starts as 'list' immediately (no spinner) — the context sync
  // effect below populates the data.  Embedded mode needs async loading.
  const [pageState, setPageState] = useState<PageState>(
    embeddedQuestionnaireId ? 'loading' : 'list'
  );
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>(
    embeddedQuestionnaireId ? [] : ctxPublishedQuestionnaires
  );

  // Keep the list in sync whenever the context list changes (e.g. admin creates,
  // archives, or restores a questionnaire while this page is mounted).
  useEffect(() => {
    if (!embeddedQuestionnaireId) {
      setQuestionnaires(ctxPublishedQuestionnaires);
    }
  }, [ctxPublishedQuestionnaires, embeddedQuestionnaireId]);

  const [selectedQuestionnaire, setSelectedQuestionnaire] = useState<Questionnaire | null>(null);
  const [currentResult, setCurrentResult] = useState<UserQuestionnaireResult | null>(null);
  
  const [currentCategoryIndex, setCurrentCategoryIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswersState>({});
  const [displayCategories, setDisplayCategories] = useState<Questionnaire['categories']>([]);

  const [pageError, setPageError] = useState<string | null>(null);
  useEffect(() => {
    if (pageError) {
      const timer = setTimeout(() => {
        setPageError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [pageError]);
  
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  useEffect(() => {
    if (saveSuccessMessage) {
      const timer = setTimeout(() => {
        setSaveSuccessMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [saveSuccessMessage]);

  // --- Auto-Save Progress Effect ---
  useEffect(() => {
    if (pageState === 'taking' && selectedQuestionnaire && user) {
        const storageKey = `quiz_progress_${user.id}_${selectedQuestionnaire.id}${storageKeySuffix}`;
        saveToLocalStorage(storageKey, {
            answers,
            step: currentCategoryIndex,
            timestamp: Date.now()
        });
    }
  }, [answers, currentCategoryIndex, pageState, selectedQuestionnaire, user, storageKeySuffix]);

  useEffect(() => {
    if (!embeddedQuestionnaireId) {
      // List mode — no spinner.  Trigger a background refresh so admin
      // changes are reflected; the sync effect above applies the result.
      fetchPublishedQuestionnaires();
      if (!myQuestionnaireResults || myQuestionnaireResults.length === 0) {
        fetchMyLatestResults();
      }
      return;
    }

    // Embedded mode — needs async loading with spinner.
    const loadEmbedded = async () => {
      setPageState('loading');
      try {
        // Fire a background refresh of user results if not loaded yet, in parallel with the main loads
        if (!myQuestionnaireResults || myQuestionnaireResults.length === 0) {
            fetchMyLatestResults();
        }

        const [fullQuestionnaire, existingResult] = await Promise.all([
            apiService.getQuestionnaireForUser(embeddedQuestionnaireId),
            apiService.getLatestQuestionnaireResults(embeddedQuestionnaireId, 'assignment'),
        ]);
        setSelectedQuestionnaire(fullQuestionnaire);

        if (existingResult) {
            setCurrentResult({ ...existingResult, completedAt: new Date(existingResult.completedAt) });
            setPageState('results');
        } else {
            // Check for saved progress in embedded mode too
            if (user) {
                const storageKey = `quiz_progress_${user.id}_${embeddedQuestionnaireId}${storageKeySuffix}`;
                const savedProgress = loadFromLocalStorage<any>(storageKey, null);
                if (savedProgress) {
                    setAnswers(savedProgress.answers || {});
                    setCurrentCategoryIndex(savedProgress.step || 0);
                    setupDisplayCategories(fullQuestionnaire);
                    setPageState('taking');
                    return;
                }
            }
            setPageState('instructions');
        }
      } catch (err: any) {
        setPageError(err.message || "Failed to load questionnaire data.");
        setPageState('error');
      }
    };
    loadEmbedded();
  }, [fetchMyLatestResults, fetchPublishedQuestionnaires, embeddedQuestionnaireId, user]);

  const setupDisplayCategories = (questionnaire: Questionnaire) => {
    if (questionnaire.shuffleQuestions) {
      const allQuestions: Question[] = questionnaire.categories?.flatMap(c => c.questions || []) || [];
      const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
      setDisplayCategories([{
        id: 'shuffled',
        questionnaireId: questionnaire.id,
        name: '',
        description: '',
        videoUrl: '',
        order: 1,
        showNameInQuiz: false,
        questions: shuffled,
      }]);
    } else {
      setDisplayCategories(questionnaire.categories || []);
    }
  };

  const handleSelectQuestionnaire = async (q: Questionnaire) => {
    setPageState('loading');
    const existingResult = myQuestionnaireResults.find(r => r.questionnaireId === q.id && (r.source || 'standalone') === 'standalone');
    try {
        const fullQuestionnaire = await apiService.getQuestionnaireForUser(q.id);
        setSelectedQuestionnaire(fullQuestionnaire);

        if (existingResult) {
            setCurrentResult(existingResult);
            setPageState('results');
        } else {
            // Check for local saved progress before showing instructions
            if (user) {
                const storageKey = `quiz_progress_${user.id}_${q.id}${storageKeySuffix}`;
                const savedProgress = loadFromLocalStorage<any>(storageKey, null);
                if (savedProgress) {
                    setAnswers(savedProgress.answers || {});
                    setCurrentCategoryIndex(savedProgress.step || 0);
                    setupDisplayCategories(fullQuestionnaire);
                    setPageState('taking');
                    return;
                }
            }
            setPageState('instructions');
        }
    } catch (err: any) {
        setPageError(err.message || "Failed to load questionnaire details.");
        setPageState('error');
    }
  };
  
  const handleStart = () => {
    // Clear any saved progress to start fresh
    if (user && selectedQuestionnaire) {
        localStorage.removeItem(`quiz_progress_${user.id}_${selectedQuestionnaire.id}${storageKeySuffix}`);
    }
    setAnswers({});
    setCurrentCategoryIndex(0);
    setCurrentResult(null);
    setSaveSuccessMessage(null);
    if (selectedQuestionnaire) {
        setupDisplayCategories(selectedQuestionnaire);
    }
    setPageState('taking');
  }

  const handleAnswerChange = (questionId: string, value: any) => {
    setAnswers(prev => ({...prev, [questionId]: value }));
  };
  
  const handleNextCategory = () => {
    if (currentCategoryIndex < (displayCategories?.length || 0) - 1) {
        setCurrentCategoryIndex(prev => prev + 1);
    } else {
        handleQuizSubmission();
    }
  };
  
  const handlePrevCategory = () => {
      if(currentCategoryIndex > 0) {
          setCurrentCategoryIndex(prev => prev - 1);
      } else {
          setPageState('instructions');
      }
  };

  const clearSavedProgress = () => {
      if (user && selectedQuestionnaire) {
          localStorage.removeItem(`quiz_progress_${user.id}_${selectedQuestionnaire.id}${storageKeySuffix}`);
      }
  };

  // Renamed and refactored to handle both local calculation (Categorical) and Backend Grading (Custom)
  const handleQuizSubmission = async () => {
      if (!selectedQuestionnaire || !selectedQuestionnaire.categories) return;
      
      const qType = selectedQuestionnaire.type || 'categorical';

      if (qType === 'categorical') {
          // --- Logic for Categorical (Local Calculation) ---
          const { numberOfTopCategories, includeTies } = selectedQuestionnaire.resultSettings;
          const categoryScores = selectedQuestionnaire.categories.map(cat => {
              const catScore = cat.questions?.reduce((sum, q) => sum + (Number(answers[q.id]) || 0), 0) || 0;
              return { categoryId: cat.id, categoryName: cat.name, score: catScore };
          });
          
          const sortedCategories = [...categoryScores].sort((a,b) => b.score - a.score);
          let topCategories: any[] = [];
          
          if (includeTies && sortedCategories.length > 0) {
              let rank = 1;
              let lastScore = sortedCategories[0].score;
              for (const cat of sortedCategories) {
                  if (cat.score < lastScore) {
                      rank++;
                      lastScore = cat.score;
                  }
                  if (rank <= numberOfTopCategories) topCategories.push(cat);
                  else break;
              }
          } else {
              topCategories = sortedCategories.slice(0, numberOfTopCategories);
          }

          const topCategoriesData = topCategories.map(topCat => {
              const categoryDetails = selectedQuestionnaire.categories?.find(c => c.id === topCat.categoryId);
              return {
                  categoryId: topCat.categoryId,
                  name: topCat.categoryName,
                  score: topCat.score,
                  description: categoryDetails?.description || '',
                  videoUrl: categoryDetails?.videoUrl || '',
              };
          });

          // Temporary result state for display before saving
          const tempResult: UserQuestionnaireResult = {
              id: 'temp',
              userId: user!.id,
              questionnaireId: selectedQuestionnaire.id,
              questionnaireName: selectedQuestionnaire.name,
              completedAt: new Date(),
              categoryScores: categoryScores,
              topCategories: topCategoriesData,
          };
          
          setCurrentResult(tempResult);
          // Don't clear progress yet for categorical, only on "Save Results"
          setPageState('results');

      } else {
          // --- Logic for Custom Quiz (Backend Grading) ---
          // Since grading involves AI and is server-side, we trigger save directly.
          setIsSaving(true);
          
          // Prepare responses payload
          const responses = selectedQuestionnaire.categories.flatMap(c => c.questions || []).map(q => {
              const val = answers[q.id];
              return {
                  questionId: q.id,
                  questionText: q.text, // Sending text for context/logs if needed
                  answerId: q.type !== 'open_text' ? val : undefined,
                  answerText: q.type === 'open_text' ? val : q.answers.find(a => a.id === val)?.text
              };
          });

          console.log('%c[Quiz Submission DEBUG]', 'background: #222; color: #bada55', 'Submitting responses for backend grading:', responses);

          try {
              const savedResult = await saveQuestionnaireResult(selectedQuestionnaire.id, { responses, source } as any);
              if (savedResult) {
                  clearSavedProgress(); // Clear progress on successful save
                  setCurrentResult(savedResult);
                  setSaveSuccessMessage(t('questionnaire.quizSubmittedSuccess'));
                  if (isEmbedded && onSessionSaved) {
                      setTimeout(() => onSessionSaved(), 1500);
                  }
                  setPageState('results');
              } else {
                  setPageError(dataCtxError || "Failed to submit quiz.");
                  setPageState('error');
              }
          } catch (err: any) {
              setPageError(err.message || "An error occurred during submission.");
              setPageState('error');
          } finally {
              setIsSaving(false);
          }
      }
  };

  const handleSaveCategoricalResults = async () => {
      if(!currentResult || !selectedQuestionnaire) return;
      setIsSaving(true);
      setPageError(null);
      setSaveSuccessMessage(null);
      try {
          const payload = {
                categoryScores: currentResult.categoryScores,
                topCategories: currentResult.topCategories,
                source,
            };

          const saved = await saveQuestionnaireResult(selectedQuestionnaire.id, payload);
          if(saved) {
              clearSavedProgress(); // Clear progress on successful save
              setCurrentResult(saved);
              if (isEmbedded && onSessionSaved) {
                  setSaveSuccessMessage(t('questionnaire.assignmentCompleted'));
                  setTimeout(() => { onSessionSaved(); }, 1500);
              } else if (onSessionSaved) {
                  onSessionSaved();
              } else {
                  setSaveSuccessMessage(t('questionnaire.resultsSaved'));
              }
          } else {
              setPageError(dataCtxError || "Failed to save results.");
          }
      } catch (err: any) {
          setPageError(err.message || "An error occurred.");
      } finally {
          setIsSaving(false);
      }
  }

  const canAccessMindPatterns = selectedOrganization?.hasMindPatternsAccess !== false;

  if (!isOrgSubscriptionActive) {
    return (
      <div className="w-full h-full overflow-y-auto custom-scrollbar p-6">
        <SubscriptionRequiredBanner />
      </div>
    );
  }

  if (!canAccessMindPatterns) {
    return (
      <div className="flex flex-col h-full bg-white md:max-w-3xl md:mx-auto md:shadow-xl md:rounded-lg overflow-hidden items-center justify-center p-6 text-center">
        <FiLock size={48} className="text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700">{t('questionnaire.accessDenied')}</h2>
        <p className="text-gray-500">{t('questionnaire.featureNotEnabled')}</p>
      </div>
    );
  }
  
  const currentErrorMessage = pageError || dataCtxError;

  const renderContent = () => {
    switch (pageState) {
        case 'loading':
            return (
                <div className="flex flex-col items-center justify-center h-full">
                    <FiLoader className="animate-spin h-12 w-12 text-blue-600 mb-4" />
                    <p className="text-gray-700 text-lg">{t('common.loading')}</p>
                </div>
            );
        case 'error':
            return (
                <div className="flex flex-col items-center justify-center h-full text-center">
                    <FiAlertCircle className="h-12 w-12 text-red-500 mb-4" />
                    <p className="text-red-600 text-lg">{t('common.error')}</p>
                    <p className="text-red-500 mb-4">{currentErrorMessage}</p>
                </div>
            );
        case 'list':
            return (
                <>
                    {/* Sticky Header for List View */}
                    <div className="sticky top-0 z-20 bg-gray-100 px-4 md:px-8 pt-4 md:pt-8 pb-4">
                        <div className="max-w-6xl mx-auto">
                            <h1 className="text-3xl font-bold text-gray-800 flex items-center">
                                <QuestionnaireIcon className="mr-3 text-blue-500" height="1em" width="1em" /> {t('questionnaire.title')}
                            </h1>
                        </div>
                    </div>
                    
                    {/* Content for List View */}
                    <div className="px-4 md:px-8 pb-8 pt-4">
                        <div className="max-w-6xl mx-auto">
                            {questionnaires.length === 0 ? (
                                <div className="text-center py-10 text-gray-500 bg-white rounded-lg shadow-md">
                                    <QuestionnaireIcon height={48} width={48} className="mx-auto mb-4 opacity-50" />
                                    <p className="text-lg">{t('questionnaire.noQuestionnaires')}</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {questionnaires.map(q => {
                                        const result = myQuestionnaireResults.find(r => r.questionnaireId === q.id && (r.source || 'standalone') === 'standalone');
                                        const hasSavedProgress = user && loadFromLocalStorage(`quiz_progress_${user.id}_${q.id}`, null);
                                        return (
                                        <button key={q.id} onClick={() => handleSelectQuestionnaire(q)} className="block text-left bg-white rounded-xl shadow-lg hover:shadow-2xl transition-shadow duration-300 overflow-hidden transform hover:-translate-y-1 group">
                                            <div className="p-6">
                                                <div className="flex justify-between items-start">
                                                    <h2 className="text-xl font-bold text-gray-800 ">{q.name}</h2>
                                                    <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${q.type === 'custom' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                                                        {q.type === 'custom' ? t('questionnaire.typeQuiz') : t('questionnaire.typeCategorical')}
                                                    </span>
                                                </div>
                                                <p className="text-gray-600 text-sm mt-2 h-16 overflow-hidden">{q.description}</p>
                                            </div>
                                            <div className={`px-6 py-4 flex justify-between items-center font-semibold group-hover:bg-blue-100 transition-colors ${result ? 'bg-green-50 text-green-700' : hasSavedProgress ? 'bg-orange-50 text-orange-700' : 'bg-gray-50 text-blue-600'}`}>
                                                <span className="flex items-center">
                                                    {result ? t('questionnaire.viewResults') : hasSavedProgress ? t('questionnaire.resume') : t('questionnaire.startQuestionnaire')}
                                                    {hasSavedProgress && !result && <FiCornerUpRight className="ml-2"/>}
                                                </span>
                                                <FiChevronsRight className="rtl-flip"/>
                                            </div>
                                        </button>
                                    )})}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            );
        case 'instructions':
            return (
                <div className="px-4 md:px-8 pb-8 pt-4">
                    <div className="max-w-4xl mx-auto">
                        <QuestionnaireInstructions
                            onStart={handleStart}
                            instructionsText={selectedQuestionnaire?.description || ''}
                            title={selectedQuestionnaire?.name || ''}
                            backToList={isEmbedded ? undefined : () => setPageState('list')}
                        />
                    </div>
                </div>
            );
        case 'taking': {
            const currentCategory = displayCategories?.[currentCategoryIndex];
            if (!currentCategory) { setPageState('error'); return null; }
            if (isSaving) {
                 return (
                    <div className="flex flex-col items-center justify-center h-full">
                        <FiLoader className="animate-spin h-12 w-12 text-purple-600 mb-4" />
                        <p className="text-gray-700 text-lg font-semibold">{t('questionnaire.aiGrading')}</p>
                        <p className="text-gray-500 text-sm">{t('questionnaire.mayTakeAMoment')}</p>
                    </div>
                );
            }
            return (
                <div className="px-4 md:px-8 pb-8 pt-4">
                    <div className="max-w-[45rem] mx-auto">
                        <QuestionnaireStep
                            instructionsText={selectedQuestionnaire?.description || ''}
                            category={currentCategory}
                            answers={answers}
                            onAnswerChange={handleAnswerChange}
                            onNext={handleNextCategory}
                            onBack={handlePrevCategory}
                            currentStep={currentCategoryIndex + 1}
                            totalSteps={displayCategories?.length || 0}
                        />
                    </div>
                </div>
            );
        }
        case 'results':
            if (!currentResult) { setPageState('error'); return null; }
            return (
                <div className="px-4 md:px-8 pb-8 pt-4">
                    <QuestionnaireResults 
                        results={currentResult} 
                        questionnaire={selectedQuestionnaire!} 
                        onRetake={handleStart} 
                        onSave={handleSaveCategoricalResults} 
                        isSaving={isSaving} 
                        backToList={() => isEmbedded ? null : setPageState('list')}
                        isEmbedded={isEmbedded}
                        saveSuccessMessage={saveSuccessMessage}
                    />
                </div>
            );
    }
  }

  // Remove default padding from container so list view can use sticky header correctly
  const containerClasses = isEmbedded 
    ? "w-full h-full overflow-y-auto custom-scrollbar p-6" 
    : "w-full h-full overflow-y-auto custom-scrollbar";

  return (
    <div className={containerClasses}>
      {/* Visually hidden live regions — announce errors and success messages to screen readers */}
      <div role="alert" aria-atomic="true" className="sr-only">{currentErrorMessage}</div>
      <div role="status" aria-atomic="true" className="sr-only">{saveSuccessMessage}</div>
      {renderContent()}
    </div>
  );
};

export default QuestionnairePage;

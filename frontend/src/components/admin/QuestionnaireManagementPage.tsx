
import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useData } from '../../hooks/useData';
import { Questionnaire, Category, Question, Answer, QuestionnaireType, QuestionType } from '../../types';
import { FiPlusCircle, FiEdit, FiTrash2, FiSave, FiXCircle, FiLoader, FiAlertCircle, FiCheckCircle, FiChevronDown, FiChevronUp, FiSettings, FiCopy, FiInfo, FiHelpCircle, FiCheck, FiArchive } from 'react-icons/fi';
import QuestionnaireIcon from '../common/QuestionnaireIcon';
import * as apiService from '../../services/geminiService';
import TutorialSection from '../common/TutorialSection';
import ConfirmationModal from './shared/ConfirmationModal';
import ArchiveRestoreModal from './shared/ArchiveRestoreModal';

// --- Auto-Resizing Textarea Component ---
const AutoResizingTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    const element = textareaRef.current;
    if (element) {
      element.style.height = 'auto';
      element.style.height = `${element.scrollHeight}px`;
    }
  };

  useLayoutEffect(() => {
    adjustHeight();
  }, [props.value]);

  return (
    <textarea
      ref={textareaRef}
      {...props}
      style={{ ...props.style, overflow: 'hidden', resize: 'none' }}
      onInput={(e) => {
        adjustHeight();
        props.onInput?.(e);
      }}
    />
  );
};

const QuestionnaireManagementPage: React.FC = () => {
    const { t } = useTranslation();
    const {
        questionnaires, fetchQuestionnaires, fetchPublishedQuestionnaires, deleteQuestionnaire, confirmArchiveQuestionnaire,
        archivedQuestionnaires, fetchArchivedQuestionnaires, restoreQuestionnaire,
        dataError, clearDataError, isLoading: isDataLoading, tutorialSettings
    } = useData();
    const [isLoading, setIsLoading] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => {
        setFeedback(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);
    const [modalError, setModalError] = useState<string | null>(null);
    useEffect(() => {
    if (modalError) {
      const timer = setTimeout(() => {
        setModalError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [modalError]);
    const [expandedQuestionnaireId, setExpandedQuestionnaireId] = useState<string | null>(null);
    const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(new Set());
    const [categoriesMap, setCategoriesMap] = useState<Record<string, Category[]>>({});

    // Modals state
    const [editingQuestionnaire, setEditingQuestionnaire] = useState<Partial<Questionnaire> | null>(null);
    const [editingCategory, setEditingCategory] = useState<{ data: Partial<Category>, qId: string } | null>(null);
    const [editingQuestion, setEditingQuestion] = useState<{ data: Partial<Question>, qId: string, cId: string, qType: QuestionnaireType } | null>(null);

    const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ type: 'category' | 'question', data: any, extraData?: any } | null>(null);
    const [archiveConfirmData, setArchiveConfirmData] = useState<{ resource: Questionnaire; dependencies?: { name: string; id: string }[] } | null>(null);
    const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);


    useEffect(() => {
        if (questionnaires.length === 0) {
          fetchQuestionnaires();
        }
    }, [fetchQuestionnaires, questionnaires.length]);

    const clearMessages = () => {
        setFeedback(null);
        setModalError(null);
        if (dataError) clearDataError();
    };

    const fetchCategoriesAndQuestions = async (questionnaireId: string) => {
        setIsLoading(true);
        try {
            const categories = await apiService.getCategoriesForAdmin(questionnaireId);
            const categoriesWithQuestions = await Promise.all(
                categories.map(async (cat) => {
                    const questions = await apiService.getQuestionsForAdmin(questionnaireId, cat.id);
                    return { ...cat, questions };
                })
            );
            setCategoriesMap(prev => ({ ...prev, [questionnaireId]: categoriesWithQuestions }));
        } catch (err: any) {
            setFeedback({ type: 'error', text: err.message });
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleToggleExpand = (questionnaireId: string) => {
        clearMessages();
        if (expandedQuestionnaireId === questionnaireId) {
            setExpandedQuestionnaireId(null);
        } else {
            setExpandedQuestionnaireId(questionnaireId);
            if (!categoriesMap[questionnaireId]) {
                fetchCategoriesAndQuestions(questionnaireId);
            }
        }
    };

    const handleToggleCategoryExpand = (categoryId: string) => {
        setExpandedCategoryIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(categoryId)) {
                newSet.delete(categoryId);
            } else {
                newSet.add(categoryId);
            }
            return newSet;
        });
    };
    
    // --- SAVE HANDLERS ---
    const handleSaveQuestionnaire = async () => {
        if (!editingQuestionnaire) return;
        clearMessages();
        setIsLoading(true);
        try {
            const dataToSave = {
                name: editingQuestionnaire.name,
                description: editingQuestionnaire.description,
                type: editingQuestionnaire.type || 'categorical',
                passingScore: editingQuestionnaire.passingScore,
                shuffleQuestions: editingQuestionnaire.shuffleQuestions ?? false,
                resultSettings: editingQuestionnaire.resultSettings || { showGraph: true, numberOfTopCategories: 0, includeTies: false, saveToInsights: false }
            };
            
            // Clean up unrelated fields based on type
            if (dataToSave.type === 'custom') {
                dataToSave.resultSettings = { showGraph: false, numberOfTopCategories: 0, includeTies: false, saveToInsights: false }; // Not used for custom
            } else {
                delete (dataToSave as any).passingScore;
            }

            if (editingQuestionnaire.id) {
                await apiService.updateQuestionnaire(editingQuestionnaire.id, dataToSave);
            } else {
                await apiService.createQuestionnaire(dataToSave);
            }
            setFeedback({ type: 'success', text: t('admin.questionnaire.savedSuccess') });
            await Promise.all([fetchQuestionnaires(), fetchPublishedQuestionnaires()]);
            setEditingQuestionnaire(null);
        } catch (err: any) {
            setModalError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveCategory = async () => {
        if (!editingCategory) return;
        clearMessages();
        setIsLoading(true);
        try {
            const { qId, data } = editingCategory;
            if (data.id) {
                await apiService.updateCategory(qId, data.id, data);
            } else {
                await apiService.createCategory(qId, data);
            }
            setFeedback({ type: 'success', text: t('admin.questionnaire.categorySavedSuccess') });
            await fetchCategoriesAndQuestions(qId);
            setEditingCategory(null);
        } catch (err: any) {
            setModalError(err.message);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleSaveQuestion = async () => {
        if (!editingQuestion) return;

        const { qId, cId, data, qType } = editingQuestion;

        // Validation for Custom Quiz - Mandatory Correct Answer
        if (qType === 'custom' && (!data.type || data.type === 'multiple_choice')) {
            if (!data.correctAnswerId) {
                setModalError(t('admin.questionnaire.errorNoCorrectAnswer'));
                return;
            }
            // Ensure the selected ID actually exists in the answers list
            const isValidId = data.answers?.some(a => a.id === data.correctAnswerId);
            if (!isValidId) {
                setModalError(t('admin.questionnaire.errorInvalidCorrectAnswer'));
                return;
            }
        }

        clearMessages();
        setIsLoading(true);
        try {
            // Clean payload based on type
            if (data.type === 'open_text') {
                data.answers = [];
                data.correctAnswerId = '';
            } else {
                // If switching to multiple choice, clear correct text
                data.correctAnswerText = undefined;
            }
            // For custom quiz, allow fixed score. For categorical, clear it.
            if (editingQuestion.qType !== 'custom') {
                data.customScore = undefined;
                data.correctAnswerText = undefined;
            }

            if(data.id) {
                await apiService.updateQuestion(qId, cId, data.id, data);
            } else {
                await apiService.createQuestion(qId, cId, data);
            }
            setFeedback({ type: 'success', text: t('admin.questionnaire.questionSavedSuccess') });
            await fetchCategoriesAndQuestions(qId);
            setEditingQuestion(null);
        } catch (err: any) {
             setModalError(err.message);
        } finally {
            setIsLoading(false);
        }
    };
    
    // --- DUPLICATE HANDLERS ---
    const handleDuplicateCategory = async (qId: string, categoryToDuplicate: Category) => {
        clearMessages();
        setIsLoading(true);
        try {
            const newCategoryData: Partial<Category> = {
                name: t('admin.questionnaire.copyOf', { name: categoryToDuplicate.name }),
                description: categoryToDuplicate.description,
                videoUrl: categoryToDuplicate.videoUrl,
                order: (categoriesMap[qId]?.length || 0) + 1,
            };

            const newCategory = await apiService.createCategory(qId, newCategoryData);
            
            if (categoryToDuplicate.questions && categoryToDuplicate.questions.length > 0) {
                const questionPromises = categoryToDuplicate.questions.map(question => {
                    // Create ID map for this question
                    const answerIdMap: Record<string, string> = {};
                    const newAnswers = question.answers.map(ans => {
                        const newId = crypto.randomUUID();
                        answerIdMap[ans.id] = newId;
                        return { ...ans, id: newId };
                    });

                    const newQuestionData: Partial<Question> = {
                        ...question,
                        answers: newAnswers,
                        // Remap correct answer ID
                        correctAnswerId: question.correctAnswerId ? answerIdMap[question.correctAnswerId] : undefined
                    };
                    delete newQuestionData.id;
                    delete newQuestionData.categoryId;
                    return apiService.createQuestion(qId, newCategory.id, newQuestionData);
                });
                await Promise.all(questionPromises);
            }

            setFeedback({ type: 'success', text: t('admin.questionnaire.categoryDuplicatedSuccess') });
            await fetchCategoriesAndQuestions(qId);
        } catch (err: any) {
            setFeedback({ type: 'error', text: err.message || t('admin.questionnaire.errorDuplicateCategory') });
        } finally {
            setIsLoading(false);
        }
    };

    const handleDuplicateQuestion = async (qId: string, cId: string, questionToDuplicate: Question) => {
        clearMessages();
        setIsLoading(true);
        try {
            // Create mapping for answers to preserve correct answer link
            const answerIdMap: Record<string, string> = {};
            const newAnswers = questionToDuplicate.answers.map(ans => {
                const newId = crypto.randomUUID();
                answerIdMap[ans.id] = newId;
                return { ...ans, id: newId };
            });

            const category = categoriesMap[qId]?.find(c => c.id === cId);
            const newQuestionData: Partial<Question> = {
                ...questionToDuplicate,
                order: (category?.questions?.length || 0) + 1,
                answers: newAnswers,
                // Remap correct answer ID to the new ID
                correctAnswerId: questionToDuplicate.correctAnswerId ? answerIdMap[questionToDuplicate.correctAnswerId] : undefined
            };
            
            delete newQuestionData.id;
            delete newQuestionData.categoryId;

            await apiService.createQuestion(qId, cId, newQuestionData);
            
            setFeedback({ type: 'success', text: t('admin.questionnaire.questionDuplicatedSuccess') });
            await fetchCategoriesAndQuestions(qId);

        } catch (err: any) {
            setFeedback({ type: 'error', text: err.message || t('admin.questionnaire.errorDuplicateQuestion') });
        } finally {
            setIsLoading(false);
        }
    };


    // --- DELETE / ARCHIVE HANDLERS ---
    const handleAttemptArchive = async (questionnaire: Questionnaire) => {
        clearMessages();
        setIsLoading(true);
        const result = await deleteQuestionnaire(questionnaire.id);
        if (result.isConflict) {
            setArchiveConfirmData({ resource: questionnaire, dependencies: result.dependencies.plans || [] });
        } else if (dataError) {
            // Error is already set in context, which will trigger feedback
        } else {
            setArchiveConfirmData({ resource: questionnaire });
        }
        setIsLoading(false);
    };

    const handleConfirmArchive = async () => {
        if (!archiveConfirmData) return;
        setIsLoading(true);
        const success = await confirmArchiveQuestionnaire(archiveConfirmData.resource.id);
        if (success) {
            setFeedback({ type: 'success', text: t('admin.questionnaire.archivedSuccess') });
        }
        setIsLoading(false);
        setArchiveConfirmData(null);
    };
    
    const handleDelete = async () => {
        if (!showDeleteConfirm) return;
        clearMessages();
        setIsLoading(true);
        const { type, data, extraData } = showDeleteConfirm;
        try {
            if (type === 'category') {
                await apiService.deleteCategory(extraData.qId, data.id);
                await fetchCategoriesAndQuestions(extraData.qId);
            } else if (type === 'question') {
                await apiService.deleteQuestion(extraData.qId, extraData.cId, data.id);
                await fetchCategoriesAndQuestions(extraData.qId);
            }
            setFeedback({ type: 'success', text: t('admin.questionnaire.itemDeletedSuccess', { type: type.charAt(0).toUpperCase() + type.slice(1) }) });
        } catch (err: any) {
            setFeedback({ type: 'error', text: err.message });
        } finally {
            setShowDeleteConfirm(null);
            setIsLoading(false);
        }
    };

    const renderModals = () => (
        <>
            {editingQuestionnaire && <QuestionnaireModal
                questionnaire={editingQuestionnaire}
                onClose={() => setEditingQuestionnaire(null)}
                onSave={handleSaveQuestionnaire}
                isLoading={isLoading}
                error={modalError}
                setFormData={setEditingQuestionnaire}
             />}
            {editingCategory && <CategoryModal 
                category={editingCategory.data}
                onClose={() => setEditingCategory(null)}
                onSave={handleSaveCategory}
                isLoading={isLoading}
                error={modalError}
                setFormData={(updater) => setEditingCategory(prev => prev ? { ...prev, data: updater(prev.data) } : null)}
            />}
            {editingQuestion && <QuestionModal
                question={editingQuestion.data}
                qType={editingQuestion.qType}
                onClose={() => setEditingQuestion(null)}
                onSave={handleSaveQuestion}
                isLoading={isLoading}
                error={modalError}
                setFormData={(updater) => setEditingQuestion(prev => prev ? { ...prev, data: updater(prev.data) } : null)}
            />}
            {showDeleteConfirm && <DeleteConfirmModal 
                itemType={showDeleteConfirm.type}
                itemName={showDeleteConfirm.data.name || showDeleteConfirm.data.text}
                onClose={() => setShowDeleteConfirm(null)}
                onConfirm={handleDelete}
                isLoading={isLoading}
            />}
            <ConfirmationModal
                isOpen={!!archiveConfirmData}
                onClose={() => setArchiveConfirmData(null)}
                onConfirm={handleConfirmArchive}
                isLoading={isLoading}
                title={t('admin.questionnaire.confirmArchiveTitle')}
                message={<>{t('admin.questionnaire.confirmArchiveMessage', { name: archiveConfirmData?.resource.name ?? '' })}</>}
                confirmText={t('admin.questionnaire.confirmArchive')}
                dependencies={archiveConfirmData?.dependencies}
                dependencyWarning={archiveConfirmData?.dependencies ? t('admin.questionnaire.archiveDependencyWarning', { count: archiveConfirmData.dependencies.length }) : undefined}
            />
            <ArchiveRestoreModal
                isOpen={isArchiveModalOpen}
                onClose={() => setIsArchiveModalOpen(false)}
                title={t('admin.questionnaire.archivedTitle')}
                items={archivedQuestionnaires}
                onRestore={restoreQuestionnaire}
                fetchItems={fetchArchivedQuestionnaires}
            />
        </>
    );

    return (
        <div className="w-full h-full overflow-y-auto custom-scrollbar">
            {/* Sticky Header */}
            <div className="sticky top-0 z-20 bg-gray-100 px-4 md:px-8 pt-4 md:pt-8 pb-4">
                <div className="max-w-4xl mx-auto">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <h1 className="text-3xl font-bold text-gray-800 flex items-center"><QuestionnaireIcon className="mr-3 text-blue-500" height="1em" width="1em" />{t('admin.questionnaire.title')}</h1>
                        <div className="flex flex-col sm:flex-row gap-2 sm:shrink-0">
                            <button onClick={() => setIsArchiveModalOpen(true)} className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center transition-colors text-sm w-full sm:w-auto">
                                <FiArchive className="mr-2" /> {t('admin.questionnaire.viewArchived')}
                            </button>
                            <button onClick={() => setEditingQuestionnaire({ type: 'categorical', resultSettings: { showGraph: true, numberOfTopCategories: 0, includeTies: false, saveToInsights: false } })} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center transition-colors w-full sm:w-auto">
                                <FiPlusCircle className="mr-2" /> {t('admin.questionnaire.addQuestionnaire')}
                            </button>
                        </div>
                    </div>
                    <div className="mt-4">
                        <TutorialSection videoUrl={tutorialSettings?.questionnaires?.videoUrl} />
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="px-4 md:px-8 pb-8 pt-4">
                <div className="max-w-4xl mx-auto">
                    <p className="text-gray-600 mb-6">{t('admin.questionnaire.pageDescription')}</p>

                    {feedback && (
                        <div className={`p-3 mb-4 rounded-md flex items-center text-sm ${feedback.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {feedback.type === 'success' ? <FiCheckCircle className="mr-2"/> : <FiAlertCircle className="mr-2"/>}
                            {feedback.text}
                            <button onClick={clearMessages} className="ml-auto text-lg font-semibold">&times;</button>
                        </div>
                    )}
                    
                    <div className="space-y-4">
                        {isDataLoading && questionnaires.length === 0 ? (
                            <div className="text-center p-4"><FiLoader className="animate-spin h-6 w-6 text-blue-500 mx-auto"/></div>
                        ) : questionnaires.length === 0 ? (
                            <div className="text-center p-8 bg-gray-50 border-2 border-dashed rounded-lg">
                                <QuestionnaireIcon className="mx-auto h-12 w-12 text-gray-400" height={48} width={48} />
                                <h3 className="mt-2 text-lg font-medium text-gray-900">{t('admin.questionnaire.noQuestionnairesYet')}</h3>
                                <p className="mt-1 text-sm text-gray-500">{t('admin.questionnaire.getStarted')}</p>
                                <div className="mt-6">
                                    <button
                                        onClick={() => setEditingQuestionnaire({ type: 'categorical', resultSettings: { showGraph: true, numberOfTopCategories: 0, includeTies: false, saveToInsights: false } })}
                                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center mx-auto transition-colors"
                                    >
                                        <FiPlusCircle className="mr-2" /> {t('admin.questionnaire.addQuestionnaire')}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            questionnaires.map(q => (
                                <div key={q.id} className="bg-white rounded-lg shadow-lg overflow-hidden">
                                    <div className="p-4 flex justify-between items-center">
                                        <div>
                                            <div className="flex items-center">
                                                <h2 className="text-xl font-bold text-gray-800 flex items-center">
                                                    {q.name}
                                                    <span className={`ml-3 text-xs font-semibold px-2 py-0.5 rounded-full border ${q.type === 'custom' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                                                        {q.type === 'custom' ? t('admin.questionnaire.typeQuiz') : t('admin.questionnaire.typeCategorical')}
                                                    </span>
                                                </h2>
                                                <button onClick={() => setEditingQuestionnaire(q)} className="p-2 text-blue-600 hover:text-blue-800 rounded-full hover:bg-blue-100 ml-2" title={t('admin.questionnaire.editQuestionnaire')}>
                                                    <FiEdit size={18}/>
                                                </button>
                                            </div>
                                            <p className="text-sm text-gray-600 mt-1">{q.description}</p>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <button 
                                                onClick={() => handleToggleExpand(q.id)} 
                                                className="flex items-center space-x-2 p-2 rounded-lg border border-blue-500 hover:bg-blue-100 transition-colors text-sm font-medium text-blue-600 hover:text-blue-800"
                                                aria-expanded={expandedQuestionnaireId === q.id}
                                            >
                                                <span>{t('admin.questionnaire.categoriesCount', { count: q.categoryCount ?? categoriesMap[q.id]?.length ?? 0 })}</span>
                                                {expandedQuestionnaireId === q.id ? <FiChevronUp/> : <FiChevronDown/>}
                                            </button>
                                            <button onClick={() => handleAttemptArchive(q)} className="p-2 text-red-600 hover:text-red-800 rounded-full hover:bg-red-100" title={t('admin.questionnaire.archiveQuestionnaire')}>
                                                <FiTrash2 size={18}/>
                                            </button>
                                        </div>
                                    </div>
                                    {expandedQuestionnaireId === q.id && (
                                        <div className="p-4 border-t border-gray-200">
                                            <div className="flex justify-between items-center mb-4">
                                                <h3 className="text-lg font-semibold text-gray-700">{t('admin.questionnaire.categoriesSections')}</h3>
                                                <button onClick={() => setEditingCategory({ qId: q.id, data: { order: (categoriesMap[q.id]?.length || 0) + 1, showNameInQuiz: false }})} className="bg-green-500 hover:bg-green-600 text-white text-sm font-semibold py-1 px-3 rounded-md shadow-sm flex items-center">
                                                    <FiPlusCircle className="mr-1.5"/> {t('admin.questionnaire.addCategory')}
                                                </button>
                                            </div>
                                            {isLoading && !categoriesMap[q.id] ? <div className="text-center p-4"><FiLoader className="animate-spin h-6 w-6 text-gray-400 mx-auto"/></div> :
                                            categoriesMap[q.id]?.length > 0 ? (
                                                <div className="space-y-2">
                                                    {categoriesMap[q.id].map(cat => {
                                                        const isCategoryExpanded = expandedCategoryIds.has(cat.id);
                                                        return (
                                                        <div key={cat.id} className="bg-gray-50 rounded-md border shadow-sm overflow-hidden">
                                                            <div className="flex justify-between items-center p-3">
                                                                <div>
                                                                    <div className="flex items-center">
                                                                        <p className="font-semibold text-gray-800">{cat.order}. {cat.name}</p>
                                                                        <button
                                                                            onClick={() => setEditingCategory({ qId: q.id, data: cat })}
                                                                            className="p-1.5 text-blue-600 hover:text-blue-800 rounded-full hover:bg-blue-100 ml-2"
                                                                            title={t('admin.questionnaire.editCategory')}
                                                                        >
                                                                            <FiEdit size={16}/>
                                                                        </button>
                                                                    </div>
                                                                    <p className="text-xs text-gray-500 mt-0.5">
                                                                        {cat.description && cat.description.length > 400 
                                                                            ? `${cat.description.substring(0, 400)}...` 
                                                                            : cat.description}
                                                                    </p>
                                                                </div>
                                                                <div className="flex items-center space-x-2">
                                                                    <button 
                                                                        onClick={() => handleToggleCategoryExpand(cat.id)}
                                                                        className="flex items-center space-x-1 p-1.5 rounded-lg hover:bg-gray-200 transition-colors text-xs font-medium text-gray-600"
                                                                    >
                                                                        <span>{t('admin.questionnaire.questionsCount', { count: cat.questions?.length || 0 })}</span>
                                                                        {isCategoryExpanded ? <FiChevronUp /> : <FiChevronDown />}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDuplicateCategory(q.id, cat)}
                                                                        className="p-1.5 text-gray-500 hover:text-green-700 rounded-full hover:bg-green-100"
                                                                        title={t('admin.questionnaire.duplicateCategory')}
                                                                    >
                                                                        <FiCopy size={16}/>
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setShowDeleteConfirm({type: 'category', data: cat, extraData: { qId: q.id }})}
                                                                        className="p-1.5 text-red-600 hover:text-red-800 rounded-full hover:bg-red-100"
                                                                        title={t('admin.questionnaire.deleteCategory')}
                                                                    >
                                                                        <FiTrash2 size={16}/>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            
                                                            {isCategoryExpanded && (
                                                                <div className="p-3 border-t bg-white">
                                                                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-100">
                                                                        <h4 className="text-sm font-semibold text-gray-600">{t('admin.questionnaire.questions')}</h4>
                                                                        <button
                                                                            onClick={() => setEditingQuestion({
                                                                                qId: q.id, 
                                                                                cId: cat.id, 
                                                                                qType: q.type || 'categorical',
                                                                                data: {
                                                                                    order: (cat.questions?.length || 0) + 1,
                                                                                    type: 'multiple_choice',
                                                                                    answers: q.type === 'custom' ? [] : [
                                                                                        {id: '1', text: 'Does not describe me at all', score: 1},
                                                                                        {id: '2', text: '', score: 2},
                                                                                        {id: '3', text: 'Describes me somewhat', score: 3},
                                                                                        {id: '4', text: '', score: 4},
                                                                                        {id: '5', text: 'Describes me very well', score: 5},
                                                                                    ]
                                                                                }
                                                                            })} 
                                                                            className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 py-1 px-3 rounded border border-blue-200 flex items-center"
                                                                        >
                                                                            <FiPlusCircle className="mr-1"/> {t('admin.questionnaire.addQuestion')}
                                                                        </button>
                                                                    </div>
                                                                    <div className="space-y-1">
                                                                        {cat.questions?.map(qu => (
                                                                            <div key={qu.id} className="text-sm flex justify-between items-center p-2 hover:bg-gray-50 rounded group">
                                                                                <div className="flex-grow pr-4">
                                                                                    <span className="font-medium mr-2 text-gray-500">{qu.order}.</span>
                                                                                    <span className="text-gray-800">{qu.text}</span>
                                                                                    {qu.type === 'open_text' && <span className="ml-2 text-[10px] bg-gray-200 px-1.5 py-0.5 rounded text-gray-600 uppercase tracking-wide">{t('admin.questionnaire.openText')}</span>}
                                                                                    {q.type === 'custom' && qu.customScore && <span className="ml-2 text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded uppercase tracking-wide">Fixed: {qu.customScore}%</span>}
                                                                                </div>
                                                                                <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                                    <button onClick={() => handleDuplicateQuestion(q.id, cat.id, qu)} className="p-1 text-gray-400 hover:text-green-700 rounded-full" title={t('admin.questionnaire.duplicateQuestion')}><FiCopy size={14}/></button>
                                                                                    <button onClick={() => setEditingQuestion({ qId: q.id, cId: cat.id, qType: q.type || 'categorical', data: qu })} className="p-1 text-gray-400 hover:text-blue-700 rounded-full" title={t('admin.questionnaire.editQuestion')}><FiEdit size={14}/></button>
                                                                                    <button onClick={() => setShowDeleteConfirm({type: 'question', data: qu, extraData: { qId: q.id, cId: cat.id }})} className="p-1 text-gray-400 hover:text-red-700 rounded-full" title={t('admin.questionnaire.deleteQuestion')}><FiTrash2 size={14}/></button>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                        {(!cat.questions || cat.questions.length === 0) && (
                                                                            <p className="text-xs text-gray-400 italic text-center py-2">{t('admin.questionnaire.noQuestionsYet')}</p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )})}
                                                </div>
                                            ) : <p className="text-center text-gray-500 italic py-4">{t('admin.questionnaire.noCategoriesYet')}</p>}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
            {renderModals()}
        </div>
    );
};

// --- MODAL COMPONENTS ---

const QuestionnaireModal = ({ questionnaire, onClose, onSave, isLoading, error, setFormData }: any) => {
    const { t } = useTranslation();
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        // Handle nested resultSettings manually if needed, but simple top-level for now
        setFormData((prev: any) => ({ ...prev, [name]: value }));
    };
    
    const handleResultSettingsChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const isCheckbox = type === 'checkbox';
        const checked = (e.target as HTMLInputElement).checked;
        setFormData((prev: any) => ({ ...prev, resultSettings: { ...prev.resultSettings, [name]: isCheckbox ? checked : Number(value) } }));
    };

    const qType = questionnaire.type || 'categorical';

    return ReactDOM.createPortal(
        <ModalWrapper title={questionnaire.id ? t('admin.questionnaire.editQuestionnaireTitle') : t('admin.questionnaire.createQuestionnaireTitle')} onClose={onClose}>
            <form onSubmit={(e) => { e.preventDefault(); onSave(); }} className="space-y-6">
                {error && <div className="p-3 rounded-md text-sm bg-red-100 text-red-700"><FiAlertCircle className="inline mr-2"/>{error}</div>}
                <p className="text-xs text-gray-500">{t('admin.questionnaire.mandatoryFieldsNote')}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700">{t('admin.questionnaire.fieldName')} <span aria-hidden="true">*</span></label>
                        <input type="text" name="name" id="name" value={questionnaire.name || ''} onChange={handleInputChange} className="mt-1 w-full p-2 border border-gray-300 rounded-md" required aria-required="true"/>
                    </div>
                    <div>
                        <label htmlFor="type" className="block text-sm font-medium text-gray-700 flex items-center">
                            {t('admin.questionnaire.fieldType')}
                            <div className="relative group ml-2">
                                <FiInfo className="text-blue-500 cursor-help"/>
                                <div className="absolute top-0 right-0 z-50 w-96 p-4 bg-white border border-gray-200 shadow-xl rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none text-sm text-gray-700">
                                    <div className="mb-4">
                                        <strong className="text-purple-600 block mb-1 text-base">Custom Scoring Quiz</strong>
                                        <p className="mb-1"><strong>Description:</strong> Each question has a correct answer and a point value. You can optionally set a minimum score required to pass.</p>
                                        <p className="mb-1"><strong>Used for:</strong> Any knowledge assessment.</p>
                                        <p className="mb-1"><strong>Supported question types:</strong> Multiple choice, Open text (with AI answer evaluation).</p>
                                        <p><strong>Result:</strong> Total score, Pass/Fail, Test summary.</p>
                                    </div>
                                    <div>
                                        <strong className="text-blue-600 block mb-1 text-base">Category Mapping Quiz</strong>
                                        <p className="mb-1"><strong>Description:</strong> Each answer contributes points to one or more categories.</p>
                                        <p className="mb-1"><strong>Used for:</strong> Personality profiles, psychological scales, and multi-dimension assessments.</p>
                                        <p className="mb-1"><strong>Supported question types:</strong> Likert scale (1 to 5 etc.).</p>
                                        <p><strong>Result:</strong> Category scores, Profile summary, Optional column chart display.</p>
                                    </div>
                                </div>
                            </div>
                        </label>
                        <select name="type" id="type" value={qType} onChange={handleInputChange} className="mt-1 w-full p-2 border border-gray-300 rounded-md bg-white">
                            <option value="categorical">{t('admin.questionnaire.typeCategoryMapping')}</option>
                            <option value="custom">{t('admin.questionnaire.typeCustomScoring')}</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label htmlFor="description" className="block text-sm font-medium text-gray-700">{t('admin.questionnaire.fieldInstructions')} <span aria-hidden="true">*</span></label>
                    <textarea name="description" id="description" value={questionnaire.description || ''} onChange={handleInputChange} rows={3} className="mt-1 w-full p-2 border border-gray-300 rounded-md" required aria-required="true"/>
                </div>

                <div className="flex items-center justify-between pt-2 border-t">
                    <label htmlFor="shuffleQuestions" className="text-sm font-medium text-gray-700 flex items-center">
                        {t('admin.questionnaire.shuffleQuestions')}
                        <FiInfo className="ml-2 h-4 w-4 text-gray-400 cursor-help" title={t('admin.questionnaire.shuffleQuestionsTooltip')} />
                    </label>
                    <input
                        type="checkbox"
                        id="shuffleQuestions"
                        checked={questionnaire.shuffleQuestions ?? false}
                        onChange={(e) => setFormData((prev: any) => ({ ...prev, shuffleQuestions: e.target.checked }))}
                        className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        aria-label="Shuffle questions order"
                    />
                </div>

                {qType === 'custom' && (
                    <div className="p-4 bg-purple-50 border border-purple-200 rounded-md">
                        <h3 className="text-sm font-semibold text-purple-800 mb-2">{t('admin.questionnaire.quizSettings')}</h3>
                        <div>
                            <label htmlFor="passingScore" className="block text-xs font-medium text-purple-700">{t('admin.questionnaire.passingScore')}</label>
                            <input type="number" name="passingScore" id="passingScore" value={questionnaire.passingScore || ''} onChange={handleInputChange} min="0" max="100" className="mt-1 w-24 p-2 border border-purple-300 rounded-md" placeholder="e.g. 70"/>
                        </div>
                    </div>
                )}

                {qType === 'categorical' && (
                    <div className="pt-2 border-t">
                        <h3 className="text-md font-semibold text-gray-700 flex items-center mb-2"><FiSettings className="mr-2"/> {t('admin.questionnaire.resultSettings')}</h3>
                        <div className="flex items-center justify-between">
                            <label htmlFor="showGraph" className="text-sm font-medium text-gray-700">{t('admin.questionnaire.showGraph')}</label>
                            <input type="checkbox" name="showGraph" id="showGraph" checked={questionnaire.resultSettings?.showGraph ?? true} onChange={handleResultSettingsChange} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"/>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                            <label htmlFor="showTopCategories" className="text-sm font-medium text-gray-700">{t('admin.questionnaire.showTopCategories')}</label>
                            <input
                                type="checkbox"
                                id="showTopCategories"
                                checked={(questionnaire.resultSettings?.numberOfTopCategories ?? 0) > 0}
                                onChange={(e) => setFormData((prev: any) => ({ ...prev, resultSettings: { ...prev.resultSettings, numberOfTopCategories: e.target.checked ? 2 : 0 } }))}
                                className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                aria-controls="numberOfTopCategories"
                            />
                        </div>
                        {(questionnaire.resultSettings?.numberOfTopCategories ?? 0) > 0 && (
                            <div className="flex items-center justify-between mt-2">
                                <label htmlFor="numberOfTopCategories" className="text-sm font-medium text-gray-700">{t('admin.questionnaire.numberOfTopCategories')}</label>
                                <input type="number" name="numberOfTopCategories" id="numberOfTopCategories" min="0" max="10" value={questionnaire.resultSettings?.numberOfTopCategories ?? 2} onChange={handleResultSettingsChange} className="w-20 p-1 border rounded-md"/>
                            </div>
                        )}
                        <div className="flex items-center justify-between mt-2">
                            <label htmlFor="includeTies" className="text-sm font-medium text-gray-700 flex items-center">
                                {t('admin.questionnaire.includeTies')}
                                <FiInfo className="ml-2 h-4 w-4 text-gray-400 cursor-help" title={t('admin.questionnaire.includeTiesTooltip')} />
                            </label>
                            <input
                                type="checkbox"
                                name="includeTies"
                                id="includeTies"
                                checked={questionnaire.resultSettings?.includeTies ?? false}
                                onChange={handleResultSettingsChange}
                                className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                        </div>
                         <div className="flex items-center justify-between mt-2">
                            <label htmlFor="saveToInsights" className="text-sm font-medium text-gray-700 flex items-center">
                                {t('admin.questionnaire.saveToInsights')}
                                <FiInfo className="ml-2 h-4 w-4 text-gray-400 cursor-help" title={t('admin.questionnaire.saveToInsightsTooltip')} />
                            </label>
                            <input
                                type="checkbox"
                                name="saveToInsights"
                                id="saveToInsights"
                                checked={questionnaire.resultSettings?.saveToInsights ?? false}
                                onChange={handleResultSettingsChange}
                                className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                )}
                <ModalFooter onClose={onClose} isLoading={isLoading} />
            </form>
        </ModalWrapper>,
        document.getElementById('modal-root')!
    );
};

const CategoryModal = ({ category, onClose, onSave, isLoading, error, setFormData }: any) => {
    const { t } = useTranslation();
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        const isCheckbox = type === 'checkbox';
        const checked = (e.target as HTMLInputElement).checked;
        setFormData((prev: any) => ({ ...prev, [name]: isCheckbox ? checked : (name === 'order' ? Number(value) : value) }));
    };

    const footerContent = (
        <div className="flex justify-end space-x-3">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300" disabled={isLoading}>{t('common.cancel')}</button>
            <button type="submit" form="category-form" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center" disabled={isLoading}>
                {isLoading ? <FiLoader className="animate-spin mr-2"/> : <FiSave className="mr-2"/>} {t('common.save')}
            </button>
        </div>
    );

    return ReactDOM.createPortal(
        <ModalWrapper
            title={category.id ? t('admin.questionnaire.editCategoryTitle') : t('admin.questionnaire.createCategoryTitle')}
            onClose={onClose}
            footer={footerContent}
        >
             <form id="category-form" onSubmit={(e) => { e.preventDefault(); onSave(); }} className="space-y-4">
                {error && <div className="p-3 rounded-md text-sm bg-red-100 text-red-700"><FiAlertCircle className="inline mr-2"/>{error}</div>}
                <p className="text-xs text-gray-500">{t('admin.questionnaire.mandatoryFieldsNote')}</p>
                <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2">
                        <label htmlFor="cat_name" className="block text-sm font-medium">{t('admin.questionnaire.fieldName')} <span aria-hidden="true">*</span></label>
                        <input type="text" name="name" id="cat_name" value={category.name || ''} onChange={handleInputChange} className="mt-1 w-full p-2 border rounded-md" required aria-required="true"/>
                    </div>
                    <div>
                        <label htmlFor="cat_order" className="block text-sm font-medium">{t('admin.questionnaire.fieldOrder')} <span aria-hidden="true">*</span></label>
                        <input type="number" name="order" id="cat_order" value={category.order || 1} onChange={handleInputChange} className="mt-1 w-full p-2 border rounded-md" required aria-required="true" min="1"/>
                    </div>
                </div>
                <div>
                    <label htmlFor="cat_desc" className="block text-sm font-medium">{t('admin.questionnaire.fieldDescription')}</label>
                    <AutoResizingTextarea name="description" id="cat_desc" value={category.description || ''} onChange={handleInputChange} rows={3} className="mt-1 w-full p-2 border rounded-md"/>
                </div>
                <div>
                    <label htmlFor="cat_video" className="block text-sm font-medium">{t('admin.questionnaire.fieldVideoUrl')}</label>
                    <input type="url" name="videoUrl" id="cat_video" value={category.videoUrl || ''} onChange={handleInputChange} className="mt-1 w-full p-2 border rounded-md" placeholder="e.g., https://www.youtube.com/embed/..."/>
                </div>
                 <div className="flex items-center justify-between pt-2 border-t">
                    <label htmlFor="showNameInQuiz" className="text-sm font-medium text-gray-700">{t('admin.questionnaire.showCategoryName')}</label>
                    <input type="checkbox" name="showNameInQuiz" id="showNameInQuiz" checked={category.showNameInQuiz ?? false} onChange={handleInputChange} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"/>
                </div>
             </form>
        </ModalWrapper>,
        document.getElementById('modal-root')!
    );
};

const QuestionModal = ({ question, qType, onClose, onSave, isLoading, error, setFormData }: any) => {
    const { t } = useTranslation();
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [question.text]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData((prev: any) => ({ ...prev, [name]: name === 'order' || name === 'customScore' ? Number(value) : value }));
    };
    
    // For Custom: Toggle Question Type
    const handleTypeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData((prev: any) => ({ ...prev, type: e.target.value }));
    };

    // For Categorical: Change number of answers
    const handleAnswerCountChange = (count: number) => {
        setFormData((prev: any) => {
            const newAnswers = Array.from({ length: count }, (_, i) => 
                prev.answers?.[i] || { id: crypto.randomUUID(), text: '', score: i + 1 }
            );
            return { ...prev, answers: newAnswers };
        });
    };
    
    // For Custom: Change Correct Answer
    const handleCorrectAnswerChange = (ansId: string) => {
        setFormData((prev: any) => ({ ...prev, correctAnswerId: ansId }));
    }

    const handleAnswerTextChange = (index: number, text: string) => {
        setFormData((prev: any) => {
            const newAnswers = [...prev.answers];
            newAnswers[index].text = text;
            return { ...prev, answers: newAnswers };
        });
    };
    
    // Manage adding/removing answers for custom MC questions
    const addAnswerOption = () => {
        setFormData((prev: any) => ({
            ...prev,
            answers: [...(prev.answers || []), { id: crypto.randomUUID(), text: '', score: 0 }]
        }));
    };
    
    const removeAnswerOption = (index: number) => {
        setFormData((prev: any) => ({
            ...prev,
            answers: prev.answers.filter((_:any, i:number) => i !== index)
        }));
    };
    
    const isCustom = qType === 'custom';
    const isMultipleChoice = !question.type || question.type === 'multiple_choice';

    return ReactDOM.createPortal(
        <ModalWrapper title={question.id ? t('admin.questionnaire.editQuestionTitle') : t('admin.questionnaire.createQuestionTitle')} onClose={onClose}>
            <form onSubmit={(e) => { e.preventDefault(); onSave(); }} className="space-y-4">
                {error && <div className="p-3 rounded-md text-sm bg-red-100 text-red-700"><FiAlertCircle className="inline mr-2"/>{error}</div>}
                <p className="text-xs text-gray-500">{t('admin.questionnaire.mandatoryFieldsNote')}</p>
                 <div className="flex gap-4">
                    <div className="flex-grow">
                        <label htmlFor="q_text" className="block text-sm font-medium">{t('admin.questionnaire.fieldQuestionText')} <span aria-hidden="true">*</span></label>
                        <textarea
                            name="text"
                            id="q_text"
                            ref={textareaRef}
                            value={question.text || ''}
                            onChange={handleInputChange}
                            className="mt-1 w-full p-2 border rounded-md resize-none overflow-hidden"
                            style={{ minHeight: '42px' }}
                            rows={1}
                            required
                            aria-required="true"
                        />
                    </div>
                    <div className="w-24 flex-shrink-0">
                        <label htmlFor="q_order" className="block text-sm font-medium">{t('admin.questionnaire.fieldOrder')} <span aria-hidden="true">*</span></label>
                        <input type="number" name="order" id="q_order" value={question.order || 1} onChange={handleInputChange} className="mt-1 w-full p-2 border rounded-md" required aria-required="true" min="1"/>
                    </div>
                </div>

                {isCustom && (
                    <div className="p-4 bg-purple-50 rounded-md border border-purple-200">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <label className="block text-xs font-semibold text-purple-800 uppercase mb-1">{t('admin.questionnaire.questionType')}</label>
                                <div className="flex space-x-4">
                                    <label className="flex items-center cursor-pointer">
                                        <input type="radio" name="qType" value="multiple_choice" checked={isMultipleChoice} onChange={handleTypeChange} className="text-purple-600 focus:ring-purple-500"/>
                                        <span className="ml-2 text-sm">{t('admin.questionnaire.multipleChoice')}</span>
                                    </label>
                                    <label className="flex items-center cursor-pointer">
                                        <input type="radio" name="qType" value="open_text" checked={!isMultipleChoice} onChange={handleTypeChange} className="text-purple-600 focus:ring-purple-500"/>
                                        <span className="ml-2 text-sm">{t('admin.questionnaire.openTextOption')}</span>
                                    </label>
                                </div>
                            </div>
                            <div className="text-right">
                                <label className="block text-xs font-semibold text-purple-800 uppercase mb-1">{t('admin.questionnaire.fixedScore')}</label>
                                <input type="number" name="customScore" value={question.customScore || ''} onChange={handleInputChange} min="0" max="100" placeholder="Auto" className="w-20 p-1 border border-purple-300 rounded text-center"/>
                            </div>
                        </div>
                        
                        {!isMultipleChoice && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                                    {t('admin.questionnaire.correctAnswer')}
                                    <div className="relative group ml-2">
                                        <FiHelpCircle className="text-purple-500 cursor-help"/>
                                        <div className="absolute bottom-full mb-2 w-64 p-2 bg-gray-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                            {t('admin.questionnaire.correctAnswerTooltip')}
                                        </div>
                                    </div>
                                </label>
                                <textarea 
                                    name="correctAnswerText" 
                                    value={question.correctAnswerText || ''} 
                                    onChange={handleInputChange} 
                                    rows={3} 
                                    className="w-full p-2 border border-purple-300 rounded-md focus:ring-2 focus:ring-purple-500" 
                                    placeholder={t('admin.questionnaire.correctAnswerPlaceholder')}
                                />
                            </div>
                        )}
                    </div>
                )}

                {(!isCustom || isMultipleChoice) && (
                    <div className="pt-2 border-t">
                        {!isCustom ? (
                            <div className="mb-2">
                                <label htmlFor="ans_count" className="block text-sm font-medium">{t('admin.questionnaire.numberOfAnswers')}</label>
                                <select id="ans_count" value={question.answers?.length || 5} onChange={(e) => handleAnswerCountChange(Number(e.target.value))} className="mt-1 p-2 border rounded-md bg-white">
                                    {[2,3,4,5,6,7].map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                            </div>
                        ) : (
                            <div className="mb-2 flex justify-between items-center">
                                <label className="block text-sm font-medium">{t('admin.questionnaire.answers')}</label>
                                <button type="button" onClick={addAnswerOption} className="text-xs text-blue-600 hover:underline">{t('admin.questionnaire.addOption')}</button>
                            </div>
                        )}
                        
                        <div className="space-y-2">
                            {question.answers?.map((ans: Answer, index: number) => {
                                const isFirstOrLast = !isCustom && (index === 0 || index === (question.answers?.length || 0) - 1);
                                return (
                                    <div key={ans.id} className="flex items-center space-x-2">
                                        {isCustom && (
                                            <input 
                                                type="radio" 
                                                name="correctAnswer" 
                                                checked={question.correctAnswerId === ans.id} 
                                                onChange={() => handleCorrectAnswerChange(ans.id)} 
                                                className="h-4 w-4 text-green-600 focus:ring-green-500"
                                                title={t('admin.questionnaire.markCorrect')}
                                            />
                                        )}
                                        <div className="flex-grow">
                                            {!isCustom && <span className="text-xs text-gray-500 block mb-0.5">Score: {ans.score}</span>}
                                            <input 
                                                type="text" 
                                                value={ans.text} 
                                                onChange={(e) => handleAnswerTextChange(index, e.target.value)} 
                                                className="w-full p-2 border rounded-md" 
                                                placeholder={isCustom ? `Option ${index + 1}` : `Label for score ${ans.score}`} 
                                                required={isFirstOrLast || isCustom}
                                            />
                                        </div>
                                        {isCustom && question.answers.length > 2 && (
                                            <button type="button" onClick={() => removeAnswerOption(index)} className="text-red-500 hover:text-red-700 p-1"><FiTrash2/></button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                <ModalFooter onClose={onClose} isLoading={isLoading} />
            </form>
        </ModalWrapper>,
         document.getElementById('modal-root')!
    );
};

const DeleteConfirmModal = ({ itemType, itemName, onClose, onConfirm, isLoading }: any) => {
    const { t } = useTranslation();
    return ReactDOM.createPortal(
         <ModalWrapper title={t('admin.questionnaire.confirmDeletionTitle')} onClose={onClose} size="max-w-sm">
             <p className="text-gray-600 mb-1">{t('admin.questionnaire.confirmDeleteMessage', { type: itemType })}</p>
             <p className="text-gray-700 bg-gray-100 p-2 rounded text-sm mb-6 truncate">"<strong>{itemName}</strong>"</p>
             <div className="flex justify-end space-x-3">
                 <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300" disabled={isLoading}>{t('common.cancel')}</button>
                 <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center disabled:opacity-50" disabled={isLoading}>
                     {isLoading ? <FiLoader className="animate-spin mr-2"/> : <FiTrash2 className="mr-2"/>}
                     {t('common.delete')}
                 </button>
             </div>
         </ModalWrapper>,
         document.getElementById('modal-root')!
     );
};

const ModalWrapper = ({ title, onClose, children, footer, size = 'max-w-2xl' }: { title: string, onClose: () => void, children: React.ReactNode, footer?: React.ReactNode, size?: string }) => (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
        <div className={`bg-white rounded-lg shadow-xl w-full ${size} max-h-[90vh] flex flex-col`}>
            <div className="p-4 border-b flex justify-between items-center flex-shrink-0">
                <h2 className="text-xl font-bold text-gray-800">{title}</h2>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><FiXCircle size={24}/></button>
            </div>
            <div className="p-6 flex-grow overflow-y-auto custom-scrollbar">
                {children}
            </div>
            {footer && (
                <div className="p-4 border-t bg-gray-50 rounded-b-lg flex-shrink-0">
                    {footer}
                </div>
            )}
        </div>
    </div>
);

const ModalFooter = ({ onClose, isLoading }: { onClose: () => void, isLoading: boolean }) => {
    const { t } = useTranslation();
    return (
        <div className="flex justify-end space-x-3 pt-4 border-t flex-shrink-0">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300" disabled={isLoading}>{t('common.cancel')}</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center" disabled={isLoading}>
                {isLoading ? <FiLoader className="animate-spin mr-2"/> : <FiSave className="mr-2"/>} {t('common.save')}
            </button>
        </div>
    );
};

export default QuestionnaireManagementPage;
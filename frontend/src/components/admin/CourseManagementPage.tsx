
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useData } from '../../hooks/useData';
import * as apiService from '../../services/geminiService';
import { Course, Lesson } from '../../types';
import { FiPlusCircle, FiEdit, FiTrash2, FiLoader, FiAlertCircle, FiCheckCircle, FiChevronDown, FiChevronUp, FiBookOpen, FiCopy, FiArchive, FiArrowUp, FiArrowDown } from 'react-icons/fi';
import TutorialSection from '../common/TutorialSection';
import ConfirmationModal from './shared/ConfirmationModal';
import ArchiveRestoreModal from './shared/ArchiveRestoreModal';

import CourseModal from './course/CourseModal';
import LessonModal from './course/LessonModal';
import DeleteConfirmModal from './course/DeleteConfirmModal';

const CourseManagementPage: React.FC = () => {
  const { t } = useTranslation();
  const {
    courses, fetchCourses, fetchCourseWithLessons,
    archivedCourses, fetchArchivedCourses, restoreCourse,
    chatPersonas, fetchChatPersonas, questionnaires, fetchQuestionnaires,
    deleteCourse, confirmArchiveCourse,
    dataError, clearDataError, tutorialSettings 
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

  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  
  // Modal State
  const [editingCourse, setEditingCourse] = useState<Partial<Course> | null>(null);
  const [editingLesson, setIsEditingLesson] = useState<{ lesson: Partial<Lesson>, courseId: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{type: 'lesson', data: Lesson} | null>(null);
  const [archiveConfirmData, setArchiveConfirmData] = useState<{ resource: Course; dependencies?: { name: string; id: string }[] } | null>(null);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);


  useEffect(() => {
    if (courses.length === 0) fetchCourses();
    if (chatPersonas.length === 0) fetchChatPersonas();
    if (questionnaires.length === 0) fetchQuestionnaires();
  }, [fetchCourses, fetchChatPersonas, fetchQuestionnaires, courses.length, chatPersonas.length, questionnaires.length]);

  useEffect(() => {
    if(dataError) {
      setFeedback({ type: 'error', text: dataError });
      clearDataError();
    }
  }, [dataError, clearDataError]);

  const clearMessages = () => {
    setFeedback(null);
    if(dataError) clearDataError();
  };

  const handleCourseHover = (courseId: string) => {
    const course = courses.find(c => c.id === courseId);
    if (course && !course.lessons) {
      fetchCourseWithLessons(courseId);
    }
  };

  const handleToggleExpand = async (courseId: string) => {
    clearMessages();
    const isCurrentlyExpanded = expandedCourseId === courseId;
    if (isCurrentlyExpanded) {
        setExpandedCourseId(null);
        return;
    }

    const course = courses.find(c => c.id === courseId);
    if (course && !course.lessons) {
        setIsLoading(true);
        await fetchCourseWithLessons(courseId);
        setIsLoading(false);
    }
    
    setExpandedCourseId(courseId);
  };
  

  const handleSaveCourse = async (courseData: { name: string, description: string, coverImage?: string, promoVideoUrl?: string }) => {
    clearMessages();
    setIsLoading(true);
    try {
      if (editingCourse?.id) {
        await apiService.updateCourse(editingCourse.id, courseData);
        setFeedback({ type: 'success', text: t('admin.course.courseUpdated')});
      } else {
        await apiService.createCourse(courseData);
        setFeedback({ type: 'success', text: t('admin.course.courseCreated')});
      }
      await fetchCourses();
      setEditingCourse(null);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || t('admin.course.failedToSaveCourse') });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSaveLesson = async (courseId: string, lessonData: Partial<Lesson>) => {
    clearMessages();
    setIsLoading(true);
    try {
        if(lessonData.id) {
            await apiService.updateLesson(courseId, lessonData.id, lessonData as any);
            setFeedback({ type: 'success', text: t('admin.course.lessonUpdated') });
        } else {
            await apiService.createLesson(courseId, lessonData as any);
            setFeedback({ type: 'success', text: t('admin.course.lessonCreated') });
        }
        await fetchCourseWithLessons(courseId);
        setIsEditingLesson(null);
    } catch(err: any) {
        // The modal will show its own error, but we catch it here to stop loading
        setFeedback({ type: 'error', text: err.message || t('admin.course.failedToSaveLesson') });
    } finally {
        setIsLoading(false);
    }
  };
  
  const handleMoveLesson = async (courseId: string, lessons: Lesson[], index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= lessons.length) return;
    clearMessages();
    setIsLoading(true);
    try {
        const lessonA = lessons[index];
        const lessonB = lessons[targetIndex];
        await Promise.all([
            apiService.updateLesson(courseId, lessonA.id, { order: lessonB.order } as any),
            apiService.updateLesson(courseId, lessonB.id, { order: lessonA.order } as any),
        ]);
        await fetchCourseWithLessons(courseId);
    } catch (err: any) {
        setFeedback({ type: 'error', text: err.message || t('admin.course.failedToMoveLesson') });
    } finally {
        setIsLoading(false);
    }
  };

  const handleAttemptArchive = async (course: Course) => {
    clearMessages();
    setIsLoading(true);
    const result = await deleteCourse(course.id);
    setIsLoading(false);
    if (result.isConflict) {
        setArchiveConfirmData({ resource: course, dependencies: result.dependencies.plans || [] });
    } else if (!dataError) {
        setArchiveConfirmData({ resource: course });
    }
  };
  
  const handleConfirmArchive = async () => {
    if (!archiveConfirmData) return;
    setIsLoading(true);
    const success = await confirmArchiveCourse(archiveConfirmData.resource.id);
    if (success) {
        setFeedback({ type: 'success', text: t('admin.course.courseArchived') });
    }
    setIsLoading(false);
    setArchiveConfirmData(null);
  };


  const handleDeleteLesson = async () => {
    if (!showDeleteConfirm) return;
    clearMessages();
    setIsLoading(true);
    const { data: lesson } = showDeleteConfirm;
    try {
        await apiService.deleteLesson(lesson.courseId, lesson.id);
        setFeedback({ type: 'success', text: t('admin.course.lessonDeleted') });
        await fetchCourseWithLessons(lesson.courseId);
    } catch(err: any) {
      setFeedback({ type: 'error', text: err.message || t('admin.course.failedToDeleteLesson') });
    } finally {
      setShowDeleteConfirm(null);
      setIsLoading(false);
    }
  };
  
   const handleDuplicateCategory = async (qId: string, categoryToDuplicate: any) => {
        clearMessages();
        setIsLoading(true);
        try {
            const newCategoryData = {
                name: t('admin.course.copyOf', { name: categoryToDuplicate.name }),
                description: categoryToDuplicate.description,
                videoUrl: categoryToDuplicate.videoUrl,
                order: (courses.find(c=>c.id === qId)?.lessons?.length || 0) + 1, // Simplified logic
            };
            const newCategory = await apiService.createCategory(qId, newCategoryData);
            if (categoryToDuplicate.questions && categoryToDuplicate.questions.length > 0) {
                const questionPromises = categoryToDuplicate.questions.map((question: any) => {
                    const newQuestionData = { ...question, answers: question.answers.map((ans: any) => ({ ...ans, id: crypto.randomUUID() })) };
                    delete newQuestionData.id;
                    delete newQuestionData.categoryId;
                    return apiService.createQuestion(qId, newCategory.id, newQuestionData);
                });
                await Promise.all(questionPromises);
            }
            setFeedback({ type: 'success', text: t('admin.course.lessonDuplicated') });
            await fetchCourseWithLessons(qId);
        } catch (err: any) {
            setFeedback({ type: 'error', text: err.message || t('admin.course.failedToDuplicateLesson') });
        } finally {
            setIsLoading(false);
        }
    };
    
  const handleDuplicateQuestion = async (qId: string, cId: string, questionToDuplicate: any) => {
    clearMessages();
    setIsLoading(true);
    try {
        const newQuestionData = {
            ...questionToDuplicate,
            order: (courses.find(c=>c.id === qId)?.lessons?.find(l => l.id === cId)?.questions?.length || 0) + 1,
            answers: questionToDuplicate.answers.map((ans: any) => ({ ...ans, id: crypto.randomUUID() }))
        };
        delete newQuestionData.id;
        delete newQuestionData.categoryId;
        await apiService.createQuestion(qId, cId, newQuestionData);
        setFeedback({ type: 'success', text: t('admin.course.questionDuplicated') });
        await fetchCourseWithLessons(qId);
    } catch (err: any) {
        setFeedback({ type: 'error', text: err.message || t('admin.course.failedToDuplicateQuestion') });
    } finally {
        setIsLoading(false);
    }
  };


  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-gray-100 px-4 md:px-8 pt-4 md:pt-8 pb-4">
        <div className="max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h1 className="text-3xl font-bold text-gray-800 flex items-center"><FiBookOpen className="mr-3 text-blue-500"/>{t('admin.course.title')}</h1>
                <div className="flex flex-col sm:flex-row gap-2 sm:shrink-0">
                    <button onClick={() => setIsArchiveModalOpen(true)} className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center transition-colors text-sm w-full sm:w-auto">
                        <FiArchive className="mr-2" /> {t('admin.course.viewArchived')}
                    </button>
                    <button onClick={() => setEditingCourse({})} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center transition-colors w-full sm:w-auto">
                        <FiPlusCircle className="mr-2" /> {t('admin.course.addCourse')}
                    </button>
                </div>
            </div>
            {feedback && (
                <div className={`mt-3 p-3 rounded-md flex items-center text-sm ${feedback.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`} role={feedback.type === 'error' ? 'alert' : 'status'}>
                    {feedback.type === 'success' ? <FiCheckCircle className="mr-2 flex-shrink-0"/> : <FiAlertCircle className="mr-2 flex-shrink-0"/>}
                    {feedback.text}
                    <button onClick={clearMessages} className="ml-auto text-lg font-semibold" aria-label={t('common.close')}>&times;</button>
                </div>
            )}
            <div className="mt-4">
                <TutorialSection videoUrl={tutorialSettings?.courses?.videoUrl} />
            </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 md:px-8 pb-8 pt-4">
        <div className="max-w-4xl mx-auto">
          <p className="text-gray-600 mb-6">{t('admin.course.pageDescription')}</p>

            <div className="space-y-4">
            {isLoading && courses.length === 0 ? (
                <div className="text-center p-4"><FiLoader className="animate-spin h-6 w-6 text-blue-500 mx-auto"/></div>
            ) : courses.length === 0 ? (
                <div className="text-center p-8 bg-gray-50 border-2 border-dashed rounded-lg">
                    <FiBookOpen className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-lg font-medium text-gray-900">{t('admin.course.noCoursesYet')}</h3>
                    <p className="mt-1 text-sm text-gray-500">{t('admin.course.getStartedCourse')}</p>
                    <div className="mt-6">
                        <button onClick={() => setEditingCourse({})} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center mx-auto transition-colors">
                            <FiPlusCircle className="mr-2" /> {t('admin.course.addCourse')}
                        </button>
                    </div>
                </div>
            ) : (
                courses.map(course => (
                    <div key={course.id} className="bg-white rounded-lg shadow-lg overflow-hidden" onMouseEnter={() => handleCourseHover(course.id)}>
                    <div className="p-4 flex justify-between items-center gap-4">
                        <div className="min-w-0">
                        <div className="flex items-center">
                            <h2 className="text-xl font-bold text-gray-800">{course.name}</h2>
                            <button onClick={() => setEditingCourse(course)} className="p-2 text-blue-600 hover:text-blue-800 rounded-full hover:bg-blue-100 ml-2"><FiEdit/></button>
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2">{course.description}</p>
                        </div>
                        <div className="flex items-center space-x-2 flex-shrink-0">
                        <button
                            onClick={() => handleToggleExpand(course.id)}
                            className="flex items-center space-x-2 p-2 rounded-lg border border-blue-500 hover:bg-blue-100 transition-colors text-sm font-medium text-blue-600 hover:text-blue-800"
                            aria-expanded={expandedCourseId === course.id}
                            aria-controls={`lessons-${course.id}`}
                        >
                            <span>{t('admin.course.lessonsCount', { count: course.lessonCount ?? (course.lessons?.length || 0) })}</span>
                            {expandedCourseId === course.id ? <FiChevronUp /> : <FiChevronDown />}
                        </button>
                        <button onClick={() => handleAttemptArchive(course)} className="p-2 text-red-600 hover:text-red-800 rounded-full hover:bg-red-100"><FiTrash2/></button>
                        </div>
                    </div>

                    {expandedCourseId === course.id && (
                        <div id={`lessons-${course.id}`} className="p-4 border-t border-gray-200">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-lg font-semibold text-gray-700">{t('admin.course.lessons')}</h3>
                            <button onClick={() => {
                                const nextOrder = course.lessons ? course.lessons.length + 1 : 1;
                                setIsEditingLesson({ courseId: course.id, lesson: { order: nextOrder, name: '', description: '', transcript: '', videoUrl: '', powerpointUrl: '', questions: [], assignments: [] }});
                            }} className="bg-green-500 hover:bg-green-600 text-white text-sm font-semibold py-1 px-3 rounded-md shadow-sm flex items-center">
                                <FiPlusCircle className="mr-1.5"/> {t('admin.course.addLesson')}
                            </button>
                        </div>
                        <div className="space-y-2">
                            {(course.lessons && course.lessons.length > 0) ?
                                [...course.lessons].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((lesson, idx, sorted) => (
                                    <div key={lesson.id} className="p-3 bg-gray-50 rounded-md flex justify-between items-start">
                                        <div>
                                            <p className="font-semibold">{idx + 1}. {lesson.name}</p>
                                            <p className="text-xs text-gray-500">{lesson.description}</p>
                                        </div>
                                        <div className="flex items-center space-x-1 flex-shrink-0 ml-4">
                                            <button
                                                onClick={() => handleMoveLesson(course.id, sorted, idx, 'up')}
                                                disabled={idx === 0 || isLoading}
                                                className="p-1.5 text-gray-500 hover:text-blue-600 rounded-full hover:bg-blue-50 disabled:opacity-30 disabled:hover:text-gray-500 disabled:hover:bg-transparent"
                                                title={t('admin.course.moveUp')}
                                                aria-label={t('admin.course.moveUp')}
                                            ><FiArrowUp size={16}/></button>
                                            <button
                                                onClick={() => handleMoveLesson(course.id, sorted, idx, 'down')}
                                                disabled={idx === sorted.length - 1 || isLoading}
                                                className="p-1.5 text-gray-500 hover:text-blue-600 rounded-full hover:bg-blue-50 disabled:opacity-30 disabled:hover:text-gray-500 disabled:hover:bg-transparent"
                                                title={t('admin.course.moveDown')}
                                                aria-label={t('admin.course.moveDown')}
                                            ><FiArrowDown size={16}/></button>
                                            <button onClick={() => handleDuplicateCategory(course.id, lesson)} className="p-1.5 text-gray-500 hover:text-green-700 rounded-full hover:bg-green-100" title="Duplicate Lesson"><FiCopy size={16}/></button>
                                            <button onClick={() => setIsEditingLesson({ courseId: course.id, lesson: lesson })} className="p-1.5 text-blue-600 hover:text-blue-800 rounded-full hover:bg-blue-100"><FiEdit size={16}/></button>
                                            <button onClick={() => setShowDeleteConfirm({type: 'lesson', data: lesson})} className="p-1.5 text-red-600 hover:text-red-800 rounded-full hover:bg-red-100"><FiTrash2 size={16}/></button>
                                        </div>
                                    </div>
                                ))
                            : isLoading ? (
                                <div className="text-center p-2"><FiLoader className="animate-spin h-5 w-5 text-blue-500 mx-auto"/></div>
                            ) : (
                                <p className="text-sm text-gray-500 text-center py-2">{t('admin.course.noLessonsYet')}</p>
                            )}
                        </div>
                        </div>
                    )}
                    </div>
                ))
            )}
            </div>
        </div>
      </div>
      
      <CourseModal 
        isOpen={!!editingCourse}
        onClose={() => setEditingCourse(null)}
        course={editingCourse}
        onSave={handleSaveCourse}
        isLoading={isLoading}
      />

      <LessonModal
        isOpen={!!editingLesson}
        onClose={() => setIsEditingLesson(null)}
        onSave={handleSaveLesson}
        lessonData={editingLesson?.lesson}
        courseId={editingLesson?.courseId}
        chatPersonas={chatPersonas}
        questionnaires={questionnaires}
        onDuplicateQuestion={handleDuplicateQuestion}
      />

      <DeleteConfirmModal
          isOpen={!!showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(null)}
          onConfirm={handleDeleteLesson}
          itemType={showDeleteConfirm?.type ?? ''}
          itemName={showDeleteConfirm?.data.name ?? ''}
          isLoading={isLoading}
          additionalInfo={t('admin.course.deleteLessonWarning')}
      />
      
      <ConfirmationModal
        isOpen={!!archiveConfirmData}
        onClose={() => setArchiveConfirmData(null)}
        onConfirm={handleConfirmArchive}
        isLoading={isLoading}
        title={t('admin.course.confirmArchiveTitle')}
        message={<>{t('admin.course.confirmArchiveMessage', { name: archiveConfirmData?.resource.name ?? '' })}</>}
        confirmText={t('admin.course.confirmArchive')}
        dependencies={archiveConfirmData?.dependencies}
        dependencyWarning={archiveConfirmData?.dependencies ? t('admin.course.archiveDependencyWarning', { count: archiveConfirmData.dependencies.length }) : undefined}
      />

      <ArchiveRestoreModal
        isOpen={isArchiveModalOpen}
        onClose={() => setIsArchiveModalOpen(false)}
        title={t('admin.course.archivedCoursesTitle')}
        items={archivedCourses}
        onRestore={restoreCourse}
        fetchItems={fetchArchivedCourses}
      />

    </div>
  );
};

export default CourseManagementPage;

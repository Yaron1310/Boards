
import React, { useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useData } from '../../hooks/useData';
import { FiLoader, FiCheckCircle, FiCircle, FiPlayCircle, FiArrowLeft, FiClock } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

const getEmbedUrl = (url: string): string => {
    const vimeoMatch = url.match(/(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(?:video\/)?(\d+)/);
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    const ytMatch = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]+)/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
    return url;
};

const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
};

const CourseDetailPage: React.FC = () => {
    const { t } = useTranslation();
    const { courseId } = useParams<{ courseId: string }>();
    const navigate = useNavigate();
    const { courses, fetchCourseWithLessons, myProgress } = useData();

    // Derive the course directly from DataContext. DataContext.fetchCourseWithLessons
    // updates the courses array in-place, so this is always up to date.
    const course = useMemo(
        () => courses.find(c => c.id === courseId) ?? null,
        [courses, courseId]
    );

    // Fetch only when the course hasn't been loaded with full lesson data yet.
    // Course summaries from fetchCourses() have lessons === undefined.
    // After fetchCourseWithLessons() the field is an array (possibly empty).
    // Also re-fetches if a background coursesQuery refetch (e.g. on window focus)
    // overwrites the cache with data that lacks lessons.
    const lessonsAvailable = course?.lessons != null;
    useEffect(() => {
        if (courseId && !lessonsAvailable) {
            fetchCourseWithLessons(courseId).catch(() => navigate('/courses'));
        }
    }, [courseId, lessonsAvailable, fetchCourseWithLessons, navigate]);

    const progress = useMemo(
        () => myProgress.find(p => p.courseId === courseId) ?? null,
        [myProgress, courseId]
    );

    // Show spinner only while lessons haven't loaded yet.
    // dataIsLoading is intentionally excluded — it goes true during background
    // re-fetches (e.g. tab restore on mobile) and would blank out the page even
    // though all the content is already available.
    const isLoading = course?.lessons == null;

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-full">
                <FiLoader className="animate-spin h-8 w-8 text-blue-500" aria-label="Loading course" role="status" />
            </div>
        );
    }

    if (!course) {
        return (
            <div className="text-center p-8">
                <h2 className="text-xl text-red-600">{t('courses.courseNotFound')}</h2>
                <Link to="/courses" className="text-blue-600 hover:underline mt-4 inline-block">{t('courses.backToCourses')}</Link>
            </div>
        );
    }

    const totalLessons = course.lessons?.length || 0;
    const completedLessonsCount = progress?.completedLessons.length || 0;
    const percentage = totalLessons > 0 ? Math.round((completedLessonsCount / totalLessons) * 100) : 0;


    return (
        <div className="w-full h-full overflow-y-auto p-4 md:p-8 custom-scrollbar">
            <div className="max-w-4xl mx-auto">
                <Link to="/courses" className="text-blue-600 hover:text-blue-800 inline-flex items-center mb-4 text-sm">
                    <FiArrowLeft className="mr-2 rtl-flip" /> {t('courses.backToAllCourses')}
                </Link>

                <div className="bg-white rounded-lg shadow-xl p-6 md:p-8">
                    <h1 className="text-3xl md:text-4xl font-bold text-gray-800">{course.name}</h1>
                    <p className="text-gray-600 mt-2">{course.description}</p>

                    {course.promoVideoUrl && (
                        <div className="mt-6 flex flex-col items-center">
                            <h2 className="text-xl font-semibold text-gray-700 mb-3">{t('courses.aboutThisCourse', 'About this course')}</h2>
                            <div className="w-full md:w-4/5 mx-auto mb-8">
                            {/youtube\.com|youtu\.be|vimeo\.com/.test(course.promoVideoUrl) ? (
                                <div className="w-full aspect-video rounded-lg overflow-hidden shadow-md">
                                    <iframe
                                        src={getEmbedUrl(course.promoVideoUrl)}
                                        className="w-full h-full"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                        title={t('courses.aboutThisCourse', 'About this course')}
                                    />
                                </div>
                            ) : (
                                <video
                                    src={course.promoVideoUrl}
                                    controls
                                    className="w-full rounded-lg shadow-md"
                                    aria-label={t('courses.aboutThisCourse', 'About this course')}
                                />
                            )}
                            </div>
                        </div>
                    )}

                    <div className="mt-6">
                        <div className="flex justify-between items-center mb-1 text-sm">
                            <span className="font-semibold text-gray-700">{t('courses.courseProgress')}</span>
                            <span className="font-semibold text-blue-600">{t('courses.lessonsCompleted', { completed: completedLessonsCount, total: totalLessons })}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3">
                            <div className="bg-blue-500 h-3 rounded-full" style={{ width: `${percentage}%` }}></div>
                        </div>
                    </div>

                    <div className="mt-8">
                        <h2 className="text-2xl font-semibold text-gray-700 border-b pb-2 mb-4">{t('courses.lessons')}</h2>
                        <div className="space-y-3">
                            {course.lessons?.map(lesson => {
                                const isCompleted = progress?.completedLessons.includes(lesson.id);
                                return (
                                    <Link to={`/courses/${course.id}/lessons/${lesson.id}`} key={lesson.id} className="block p-4 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200 hover:border-blue-300 transition-colors duration-200">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center">
                                                {isCompleted ? (
                                                    <FiCheckCircle className="h-6 w-6 text-green-500 mr-4 flex-shrink-0"/>
                                                ) : (
                                                    <FiCircle className="h-6 w-6 text-gray-400 mr-4 flex-shrink-0"/>
                                                )}
                                                <div>
                                                    <p className="font-semibold text-gray-800">{lesson.order}. {lesson.name}</p>
                                                    <p className="text-sm text-gray-500">{lesson.description}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                                                {lesson.videoDuration != null && (
                                                    <span className="flex items-center text-xs text-gray-500 gap-1" aria-label={`Duration: ${formatDuration(lesson.videoDuration)}`}>
                                                        <FiClock className="h-3.5 w-3.5" aria-hidden="true" />
                                                        {formatDuration(lesson.videoDuration)}
                                                    </span>
                                                )}
                                                <FiPlayCircle className="h-7 w-7 text-blue-500 opacity-70"/>
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CourseDetailPage;

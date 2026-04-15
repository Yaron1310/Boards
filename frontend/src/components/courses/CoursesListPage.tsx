
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../../hooks/useData';
import { FiLoader, FiBookOpen, FiChevronsRight, FiClock } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { Course } from '../../types';

const formatTotalDuration = (seconds: number): string => {
    if (!seconds || seconds <= 0) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
};

interface CourseCardProps {
    course: Course;
    completedLessons: number;
    totalLessons: number;
    percentage: number;
    status: string;
}

const CourseCard: React.FC<CourseCardProps> = ({ course, completedLessons, totalLessons, percentage, status }) => {
    const { t } = useTranslation();
    const [hovered, setHovered] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const isDescriptionVisible = hovered || expanded;
    const durationLabel = formatTotalDuration(course.totalDuration ?? 0);

    const statusColor =
        status === 'completed' ? 'text-green-600' :
        status === 'in-progress' ? 'text-blue-600' : 'text-gray-400';

    const progressColor =
        status === 'completed' ? 'bg-green-500' : 'bg-blue-500';

    return (
        <div
            style={{ width: '270px', flexShrink: 0 }}
            onMouseEnter={() => { if (window.matchMedia('(hover: hover)').matches) setHovered(true); }}
            onMouseLeave={() => setHovered(false)}
        >
            <Link
                to={`/courses/${course.id}`}
                className="block bg-white rounded-2xl shadow-md hover:shadow-xl transition-shadow duration-300 overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-400"
                aria-label={`${course.name} — ${status.replace('-', ' ')}`}
                style={{ height: '360px', display: 'flex', flexDirection: 'column', position: 'relative' }}
            >
                {/* Cover image */}
                <div className="flex-shrink-0" style={{ height: '200px' }}>
                    {course.coverImage ? (
                        <img
                            src={course.coverImage}
                            alt={`${course.name} cover`}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center">
                            <FiBookOpen className="h-14 w-14 text-blue-300" aria-hidden="true" />
                        </div>
                    )}
                </div>

                {/* Spacer — keeps footer in place */}
                <div className="flex-1" />

                {/* Footer */}
                <div
                    className="px-4 py-3 flex justify-between items-center flex-shrink-0 transition-colors duration-200 relative z-20"
                    style={{ backgroundColor: hovered ? '#c8e5ff' : '#eff6ff' }}
                >
                    <div className="flex items-center gap-1.5 text-gray-500 text-sm">
                        <FiClock className="h-4 w-4 text-blue-400" aria-hidden="true" />
                        {durationLabel ? (
                            <span aria-label={`Total duration: ${durationLabel}`}>{durationLabel}</span>
                        ) : (
                            <span className="text-gray-300 text-xs">{t('courses.noDuration', '—')}</span>
                        )}
                    </div>
                    <FiChevronsRight className="h-5 w-5 text-blue-400 transition-colors rtl-flip" aria-hidden="true" />
                </div>

                {/* Info panel — absolute, anchored just above footer, grows upward on hover */}
                <div
                    className="absolute left-0 right-0 bg-white z-10 flex flex-col rounded-t-2xl"
                    style={{ bottom: '52px' }}
                >
                    {/* Course name — always visible */}
                    <h2
                        className="px-4 pt-3 font-bold text-blue-500 leading-snug line-clamp-2 transition-[padding-bottom] duration-300"
                        style={{ fontSize: '1.3rem', fontFamily: 'Assistant, sans-serif', paddingBottom: isDescriptionVisible ? '0.25rem' : '2rem' }}
                    >
                        {course.name}
                    </h2>

                    {/* Read more / Read less toggle — mobile only */}
                    {course.description && (
                        <button
    className="md:hidden px-4 pb-2 text-xs text-blue-400 font-medium text-left flex items-center gap-1"
    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(prev => !prev); }}
    aria-label={expanded ? t('courses.close', 'Close') : t('courses.readMore', 'Read more')}
>
    {expanded ? (
        <>
            {t('courses.close', 'Close')}
            <svg
                className="w-4 h-4 ml-1"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d="M6 10 L12 16 L18 10" />
            </svg>
        </>
    ) : (
        t('courses.readMore', 'Read more')
    )}
</button>
                    )}

                    {/* Description — fades in and grows below name on hover (desktop) or expand (mobile) */}
                    {course.description && (
                        <div
                            className="overflow-hidden"
                            style={{
                                maxHeight: isDescriptionVisible ? '150px' : '0px',
                                transition: 'max-height 0.5s ease-in-out',
                            }}
                        >
                            <p
                                className="px-4 pb-3 text-sm text-gray-600 leading-relaxed"
                                style={{
                                    opacity: isDescriptionVisible ? 1 : 0,
                                    transition: 'opacity 0.5s ease-in-out',
                                }}
                            >
                                {course.description}
                            </p>
                        </div>
                    )}

                    {/* Status + progress */}
                    <div className="px-4 pb-3">
                        <div className="flex justify-between items-center mb-1.5 text-sm">
                            <span className={`font-medium capitalize ${statusColor}`}>
                                {status === 'not-started'
                                    ? t('courses.notStarted', 'Not Started')
                                    : status === 'in-progress'
                                    ? t('courses.inProgress', 'In Progress')
                                    : t('courses.completed', 'Completed')}
                            </span>
                            <span className="text-gray-400 text-xs font-medium">
                                {t('courses.lessonsCount', { completed: completedLessons, total: totalLessons, defaultValue: `Lessons ${completedLessons} / ${totalLessons}` })}
                            </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div
                                className={`h-1.5 rounded-full transition-all duration-500 ${progressColor}`}
                                style={{ width: `${percentage}%` }}
                                role="progressbar"
                                aria-valuenow={percentage}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-label={`${percentage}% complete`}
                            />
                        </div>
                    </div>
                </div>
            </Link>
        </div>
    );
};

const CoursesListPage: React.FC = () => {
    const { t } = useTranslation();
    const { courses, myProgress, isLoading } = useData();

    if (isLoading && courses.length === 0) {
        return (
            <div className="flex justify-center items-center h-full">
                <FiLoader className="animate-spin h-8 w-8 text-blue-500" aria-label="Loading courses" />
            </div>
        );
    }

    return (
        <div className="w-full h-full overflow-y-auto custom-scrollbar">
            <div className="px-4 md:px-8 pt-6 pb-8">
                <div className="max-w-6xl mx-auto">
                    <h1 className="text-3xl font-bold text-gray-800 mb-6">{t('courses.title', 'My Courses')}</h1>

                    {courses.length === 0 ? (
                        <div className="text-center py-16 text-gray-500">
                            <FiBookOpen className="mx-auto h-16 w-16 mb-4 text-gray-300" aria-hidden="true" />
                            <p className="text-xl">{t('courses.noCourses', 'No courses available yet.')}</p>
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-6 justify-center md:justify-start">
                            {courses.map(course => {
                                const progress = myProgress.find(p => p.courseId === course.id);
                                const completedLessons = progress?.completedLessons?.length ?? 0;
                                const totalLessons = course.lessonsCount ?? 0;
                                const percentage = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
                                const status = completedLessons === 0 ? 'not-started' : completedLessons >= totalLessons ? 'completed' : 'in-progress';

                                return (
                                    <CourseCard
                                        key={course.id}
                                        course={course}
                                        completedLessons={completedLessons}
                                        totalLessons={totalLessons}
                                        percentage={percentage}
                                        status={status}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CoursesListPage;

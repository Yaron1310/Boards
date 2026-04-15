

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CourseQuestion } from '../../types';
import { FiCheckCircle, FiXCircle, FiLoader, FiPlay, FiRefreshCw, FiChevronLeft, FiChevronRight } from 'react-icons/fi';

interface LessonQuizProps {
  questions: CourseQuestion[];
  onComplete: () => Promise<void>;
  isCompleting: boolean;
  disabled?: boolean;
}

type QuizState = 'idle' | 'attempting' | 'failed' | 'passed';

const LessonQuiz: React.FC<LessonQuizProps> = ({ questions, onComplete, isCompleting, disabled }) => {
  const { t } = useTranslation();
  const [quizState, setQuizState] = useState<QuizState>('idle');
  const [activeQuestions, setActiveQuestions] = useState<CourseQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});

  const handleStartQuiz = () => {
    if (disabled) return;
    setActiveQuestions(questions); // Start with all questions
    setCurrentIndex(0);
    setUserAnswers({});
    setQuizState('attempting');
  };

  const handleRetryQuiz = () => {
    const incorrectQuestions = questions.filter(q => userAnswers[q.id] !== q.correctAnswerId);
    setActiveQuestions(incorrectQuestions);
    setCurrentIndex(0);
    
    const answersForRetry = { ...userAnswers };
    incorrectQuestions.forEach(q => {
        delete answersForRetry[q.id];
    });
    setUserAnswers(answersForRetry);
    
    setQuizState('attempting');
  };

  const handleAnswerSelect = (questionId: string, answerId: string) => {
    setUserAnswers(prev => ({ ...prev, [questionId]: answerId }));
  };

  const handleSubmit = async () => {
    const allStillIncorrect = questions.filter(q => userAnswers[q.id] !== q.correctAnswerId);
    
    if (allStillIncorrect.length === 0) {
      setQuizState('passed');
      await onComplete();
    } else {
      setQuizState('failed');
    }
  };

  if (isCompleting) {
     return (
        <div className="text-center p-4 bg-green-50 border border-green-200 rounded-lg flex items-center justify-center">
            <FiLoader className="animate-spin h-6 w-6 text-green-500 mr-3"/>
            <p className="font-semibold text-green-700">{t('courses.completingLesson')}</p>
        </div>
    );
  }

  if (quizState === 'idle') {
    return (
      <button
        onClick={handleStartQuiz}
        disabled={disabled}
        className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-colors flex items-center justify-center ${disabled ? 'bg-gray-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'}`}
      >
        <FiPlay className="mr-2"/> {t('courses.startQuizToComplete')}
      </button>
    );
  }

  if (quizState === 'failed') {
    return (
        <div className="text-center p-4 bg-red-50 border border-red-200 rounded-lg">
            <FiXCircle className="mx-auto h-10 w-10 text-red-500 mb-2"/>
            <p className="font-semibold text-red-700">{t('courses.someAnswersIncorrect')}</p>
            <p className="text-sm text-red-600 mb-4">{t('courses.pleaseTryAgain')}</p>
            <button
                onClick={handleRetryQuiz}
                className="w-full sm:w-auto px-6 py-2 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center"
            >
                <FiRefreshCw className="mr-2"/> {t('courses.retryIncorrect')}
            </button>
        </div>
    );
  }

  if (quizState === 'passed') {
     return (
        <div className="text-center p-4 bg-green-50 border border-green-200 rounded-lg">
            <FiCheckCircle className="mx-auto h-10 w-10 text-green-500 mb-2"/>
            <p className="font-semibold text-green-700">{t('courses.quizPassed')}</p>
            <p className="text-sm text-green-600">{t('courses.lessonMarkedComplete')}</p>
        </div>
    );
  }

  const currentQuestion = activeQuestions[currentIndex];
  if (!currentQuestion) return null; // Should not happen

  const isLastQuestion = currentIndex === activeQuestions.length - 1;

  return (
    <div className="w-full">
      <div className="mb-4 p-4 border rounded-lg bg-gray-50">
        <p className="text-sm text-gray-600 font-medium">{t('courses.questionOf', { current: currentIndex + 1, total: activeQuestions.length })}</p>
        <p className="text-lg font-semibold text-gray-800 mt-1">{currentQuestion.text}</p>
      </div>
      
      <div className="space-y-2 mb-6">
        {currentQuestion.answers.map(answer => (
          <label key={answer.id} className="flex items-center p-3 border-2 rounded-lg cursor-pointer transition-all border-gray-300 has-[:checked]:border-purple-500 has-[:checked]:bg-purple-50">
            <input
              type="radio"
              name={`question_${currentQuestion.id}`}
              value={answer.id}
              checked={userAnswers[currentQuestion.id] === answer.id}
              onChange={() => handleAnswerSelect(currentQuestion.id, answer.id)}
              className="h-4 w-4 mr-3 text-purple-600 focus:ring-purple-500"
            />
            <span className="flex-grow text-gray-700">{answer.text}</span>
          </label>
        ))}
      </div>
      
      <div className="flex justify-between items-center">
        <button
          onClick={() => setCurrentIndex(prev => prev - 1)}
          disabled={currentIndex === 0}
          className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50 flex items-center"
        >
          <FiChevronLeft className="mr-1 rtl-flip"/> {t('common.back')}
        </button>
        {isLastQuestion ? (
          <button
            onClick={handleSubmit}
            disabled={!userAnswers[currentQuestion.id] || isCompleting}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center"
          >
            <FiCheckCircle className="mr-2"/> {t('courses.submitAnswers')}
          </button>
        ) : (
          <button
            onClick={() => setCurrentIndex(prev => prev + 1)}
            disabled={!userAnswers[currentQuestion.id]}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 flex items-center"
          >
            {t('common.next')} <FiChevronRight className="ml-1 rtl-flip"/>
          </button>
        )}
      </div>
    </div>
  );
};

export default LessonQuiz;
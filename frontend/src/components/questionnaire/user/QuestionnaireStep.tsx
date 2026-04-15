
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Category } from '../../../types';
import QuestionnaireProgressBar from './QuestionnaireProgressBar';
import { FiChevronLeft, FiChevronRight, FiChevronDown, FiChevronUp } from 'react-icons/fi';

interface QuestionnaireStepProps {
  instructionsText: string;
  category: Category;
  answers: Record<string, any>; // { [questionId]: score | text }
  onAnswerChange: (questionId: string, value: any) => void;
  onNext: () => void;
  onBack: () => void;
  currentStep: number;
  totalSteps: number;
}

const isRtl = (text: string): boolean => {
    const rtlRegex = /[\u0590-\u05FF]/;
    return rtlRegex.test(text);
};

const QuestionnaireStep: React.FC<QuestionnaireStepProps> = ({
  instructionsText,
  category,
  answers,
  onAnswerChange,
  onNext,
  onBack,
  currentStep,
  totalSteps
}) => {
  const { t } = useTranslation();
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  // Check completion:
  // For open text: need non-empty string.
  // For MC: need non-null value (score or ID, handling legacy 'score' vs new ID later)
  const allQuestionsAnswered = category.questions?.every(q => {
      const val = answers[q.id];
      if (q.type === 'open_text') return typeof val === 'string' && val.trim().length > 0;
      return val !== undefined && val !== null;
  }) ?? false;

  return (
    <div className="animate-fadeIn">
      {/* Collapsible Instructions */}
      <div className="mb-6 border border-indigo-200 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setInstructionsOpen(prev => !prev)}
          className="w-full flex items-center justify-between px-4 py-3 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors text-sm font-medium"
          aria-expanded={instructionsOpen}
          aria-controls="questionnaire-instructions"
        >
          <span>{t('questionnaire.instructions')}</span>
          {instructionsOpen ? <FiChevronUp className="h-4 w-4" /> : <FiChevronDown className="h-4 w-4" />}
        </button>
        {instructionsOpen && (
          <div id="questionnaire-instructions" className="px-4 py-3 bg-indigo-50 border-t border-indigo-200 text-indigo-800">
            <p className="text-sm italic whitespace-pre-line">{instructionsText}</p>
          </div>
        )}
      </div>

      <QuestionnaireProgressBar currentStep={currentStep} totalSteps={totalSteps} />

      {category.showNameInQuiz &&
        <h2 className="text-2xl font-semibold text-gray-700 mb-6 text-center">{category.name}</h2>}

      <form onSubmit={(e: React.FormEvent) => { e.preventDefault(); if (allQuestionsAnswered) onNext(); }}>
        {category.questions?.map((question) => (
          <div key={question.id} role="group" aria-labelledby={`legend-${question.id}`} className="mb-8 p-4 border border-gray-200 rounded-lg shadow-sm bg-slate-50">
            <p
              id={`legend-${question.id}`}
              className={`text-md font-medium text-gray-800 mb-4 px-2 ${isRtl(question.text) ? 'text-right' : 'text-left'}`}
              dir={isRtl(question.text) ? 'rtl' : 'ltr'}
            >
              {question.text}
            </p>

            {question.type === 'open_text' ? (
                <div className="px-2">
                    <textarea
                        className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        rows={3}
                        placeholder={t('questionnaire.typeYourAnswer')}
                        value={answers[question.id] || ''}
                        onChange={(e) => onAnswerChange(question.id, e.target.value)}
                        aria-labelledby={`legend-${question.id}`}
                    />
                </div>
            ) : (
                <div className="flex flex-row justify-around items-start flex-wrap gap-y-4 gap-x-1 px-2">
                {(question.answers || []).map((answer) => {
                    const isCustomQuiz = !!question.correctAnswerId;
                    const valueToStore = isCustomQuiz ? answer.id : answer.score;
                    const isSelected = answers[question.id] === valueToStore;

                    return (
                        <label
                          key={answer.id}
                          htmlFor={`q${question.id}-ans${answer.id}`}
                          className="flex flex-col items-center cursor-pointer group"
                        >
                          <div
                            className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all duration-200
                              ${isSelected
                                ? 'bg-purple-600 border-purple-700 text-white shadow-lg scale-110'
                                : 'bg-white border-gray-300 text-purple-700 hover:border-purple-400 hover:shadow-md group-hover:scale-105'
                              }`}
                            aria-hidden="true"
                          >
                            {!isCustomQuiz && (
                              <span className={`font-semibold text-sm ${isSelected ? 'text-white' : 'text-purple-700'}`}>
                                {answer.score}
                              </span>
                            )}
                          </div>
                          <input
                              type="radio"
                              id={`q${question.id}-ans${answer.id}`}
                              name={`question-${question.id}`}
                              value={String(valueToStore)}
                              checked={isSelected}
                              onChange={() => onAnswerChange(question.id, valueToStore)}
                              className="sr-only"
                          />
                          {answer.text && (
                            <span className={`text-xs mt-1 text-center max-w-[60px] leading-tight ${isSelected ? 'text-purple-700 font-medium' : 'text-gray-500'}`}>
                              {answer.text}
                            </span>
                          )}
                        </label>
                    );
                })}
                </div>
            )}
          </div>
        ))}

        <div className="flex justify-between items-center mt-10">
          <button
            type="button"
            onClick={onBack}
            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center text-sm sm:text-base"
            aria-label={t('common.previousStep')}
          >
            <FiChevronLeft className="mr-2 h-5 w-5 rtl-flip" /> {t('common.back')}
          </button>
          <button
            type="submit"
            disabled={!allQuestionsAnswered}
            className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center text-sm sm:text-base"
            aria-label={currentStep === totalSteps ? t('questionnaire.viewResults') : t('common.nextStep')}
          >
            {currentStep === totalSteps ? t('questionnaire.viewResults') : t('common.next')}
            <FiChevronRight className="ml-2 h-5 w-5 rtl-flip" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default QuestionnaireStep;

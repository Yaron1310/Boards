import React from 'react';
import { useTranslation } from 'react-i18next';

interface QuestionnaireProgressBarProps {
  currentStep: number; // Current question step (e.g., 1 for first set of questions)
  totalSteps: number;  // Total number of question steps (e.g., 12)
}

const QuestionnaireProgressBar: React.FC<QuestionnaireProgressBarProps> = ({ currentStep, totalSteps }) => {
  const { t } = useTranslation();
  const progressPercentage = (currentStep / totalSteps) * 100;

  return (
    <div className="my-6">
      <div className="text-center text-sm text-gray-600 mb-2" id="progress-label">
        {t('questionnaire.stepOf', { current: currentStep, total: totalSteps })}
      </div>
      <div 
        className="w-full bg-gray-200 rounded-full h-[15px] overflow-hidden shadow-inner"
        role="progressbar"
        aria-valuenow={currentStep}
        aria-valuemin={1}
        aria-valuemax={totalSteps}
        aria-labelledby="progress-label"
      >
        <div
          className="bg-purple-600 h-[15px] rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
    </div>
  );
};

export default QuestionnaireProgressBar;

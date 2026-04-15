import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiPlayCircle, FiArrowLeft } from 'react-icons/fi';

interface QuestionnaireInstructionsProps {
  onStart: () => void;
  instructionsText: string;
  title: string;
  backToList?: () => void;
}

const QuestionnaireInstructions: React.FC<QuestionnaireInstructionsProps> = ({ onStart, instructionsText, title, backToList }) => {
  const { t } = useTranslation();
  return (
    <div className="animate-fadeIn">
       {backToList && (
           <button onClick={backToList} className="text-blue-600 hover:text-blue-800 inline-flex items-center mb-4 text-sm">
               <FiArrowLeft className="mr-2 rtl-flip" /> {t('questionnaire.backToList')}
           </button>
       )}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">{title}</h1>
        <div className="bg-indigo-50 p-6 rounded-lg shadow-md mb-8 text-left">
          <h2 className="text-xl font-semibold text-indigo-700 mb-3">{t('questionnaire.instructions')}</h2>
          <p className="text-gray-700 leading-relaxed whitespace-pre-line">
            {instructionsText}
          </p>
        </div>
        <button
          onClick={onStart}
          className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-8 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out transform hover:scale-105 flex items-center justify-center mx-auto text-lg"
          aria-label={t('questionnaire.startQuestionnaire')}
        >
          <FiPlayCircle className="mr-3 h-6 w-6" /> {t('questionnaire.startQuestionnaire')}
        </button>
      </div>
    </div>
  );
};

export default QuestionnaireInstructions;

// Basic fadeIn animation
const style = document.createElement('style');
style.innerHTML = `
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fadeIn {
  animation: fadeIn 0.5s ease-out forwards;
}
`;
document.head.appendChild(style);
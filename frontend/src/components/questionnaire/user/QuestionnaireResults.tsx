
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserQuestionnaireResult, Questionnaire } from '../../../types';
import { FiBarChart2, FiSave, FiRefreshCw, FiLoader, FiInfo, FiArrowLeft, FiCheckSquare, FiCheckCircle, FiXCircle, FiChevronDown, FiChevronUp } from 'react-icons/fi';

interface QuestionnaireResultsProps {
  results: UserQuestionnaireResult;
  questionnaire: Questionnaire;
  onRetake: () => void;
  onSave: () => Promise<void>;
  isSaving: boolean;
  backToList: () => void;
  isEmbedded?: boolean;
  saveSuccessMessage?: string | null;
}

const QuestionnaireResults: React.FC<QuestionnaireResultsProps> = ({ results, questionnaire, onRetake, onSave, isSaving, backToList, isEmbedded, saveSuccessMessage }) => {
  const { t } = useTranslation();
  const { categoryScores, topCategories, score, passed, responses } = results;
  const isCustomQuiz = questionnaire.type === 'custom';
  const [showReview, setShowReview] = useState(false);

  const maxPossibleScore = categoryScores?.reduce((max, cat) => {
    const categoryDetails = questionnaire.categories?.find(c => c.id === cat.categoryId);
    const maxScoreForCat = categoryDetails?.questions?.reduce((maxQ, q) => Math.max(maxQ, ...(q.answers || []).map(a => a.score)), 0) || 0;
    const numQuestions = categoryDetails?.questions?.length || 1;
    return Math.max(max, maxScoreForCat * numQuestions);
  }, 1) || 1;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="animate-fadeIn">
        {!isEmbedded && (
            <button onClick={backToList} className="text-blue-600 hover:text-blue-800 inline-flex items-center mb-4 text-sm">
                <FiArrowLeft className="mr-2 rtl-flip" /> {t('questionnaire.backToList')}
            </button>
        )}
        <h1 className="text-3xl font-bold text-gray-800 mb-8 text-center">{questionnaire.name} {t('questionnaire.results')}</h1>

        {saveSuccessMessage && (
            <div className="mb-6 p-4 bg-green-100 text-green-700 border border-green-200 rounded-lg flex items-center justify-center">
                <FiCheckCircle className="mr-2 h-5 w-5"/>
                <span className="font-semibold">{saveSuccessMessage}</span>
            </div>
        )}

        {isCustomQuiz ? (
            <div className="flex flex-col items-center mb-10">
                <div className={`w-40 h-40 rounded-full flex flex-col items-center justify-center shadow-lg mb-6 border-8 ${passed ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
                    <span className={`text-4xl font-bold ${passed ? 'text-green-600' : 'text-red-600'}`}>{score}%</span>
                    <span className={`text-sm font-semibold uppercase tracking-wide mt-1 ${passed ? 'text-green-700' : 'text-red-700'}`}>
                        {passed ? t('questionnaire.passed') : t('questionnaire.failed')}
                    </span>
                </div>
                <p className="text-gray-600 mb-6 text-center">
                    {passed
                        ? t('questionnaire.congratulations')
                        : t('questionnaire.didNotPass')}
                </p>
                
                <div className="w-full bg-white rounded-lg shadow border overflow-hidden">
                    <button 
                        onClick={() => setShowReview(!showReview)}
                        className="w-full flex justify-between items-center p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                        <span className="font-semibold text-gray-700">{t('questionnaire.reviewAnswers')}</span>
                        {showReview ? <FiChevronUp /> : <FiChevronDown />}
                    </button>
                    
                    {showReview && (
                        <div className="divide-y divide-gray-200">
                            {responses?.map((resp, idx) => {
                                const questionObj = questionnaire.categories?.flatMap(c => c.questions).find(q => q?.id === resp.questionId);
                                const isCorrect = resp.isCorrect;
                                const isOpenText = questionObj?.type === 'open_text';

                                return (
                                    <div key={idx} className="p-4">
                                        <div className="flex items-start mb-2">
                                            <div className={`mt-1 mr-3 flex-shrink-0 ${isCorrect ? 'text-green-500' : 'text-red-500'}`}>
                                                {isCorrect ? <FiCheckCircle size={20} /> : <FiXCircle size={20} />}
                                            </div>
                                            <div className="flex-grow">
                                                <p className="font-medium text-gray-800">{resp.questionText}</p>
                                                
                                                <div className="mt-2 text-sm">
                                                    <p className="text-gray-600 font-medium">{t('questionnaire.yourAnswer')}</p>
                                                    <p className={`p-2 rounded bg-gray-50 border ${isCorrect ? 'border-green-200 text-green-800' : 'border-red-200 text-red-800'}`}>
                                                        {resp.answerText || "(No Answer)"}
                                                    </p>
                                                </div>

                                                {!isCorrect && (
                                                    <div className="mt-2 text-sm">
                                                        <p className="text-gray-600 font-medium">{t('questionnaire.correctAnswer')}</p>
                                                        {isOpenText ? (
                                                            <div className="p-2 rounded bg-blue-50 border border-blue-200 text-blue-900 mt-1 whitespace-pre-wrap">
                                                                {resp.correctAnswerText || "Exact key points required."}
                                                            </div>
                                                        ) : (
                                                            <p className="text-green-700 font-medium mt-1">
                                                                {questionObj?.answers.find(a => a.id === questionObj.correctAnswerId)?.text}
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                                
                                                {/* Display AI Feedback if available */}
                                                {resp.feedback && (
                                                    <div className="mt-3 p-3 bg-indigo-50 border border-indigo-100 rounded-md flex items-start text-sm">
                                                        <FiInfo className="text-indigo-500 mt-0.5 mr-2 flex-shrink-0" />
                                                        <div>
                                                            <span className="font-semibold text-indigo-700 block mb-1">{t('questionnaire.feedback')}</span>
                                                            <span className="text-indigo-800">{resp.feedback}</span>
                                                        </div>
                                                    </div>
                                                )}
                                                
                                                <div className="mt-2 flex justify-between items-center text-xs text-gray-400">
                                                    {isOpenText && <span className="italic">{t('questionnaire.gradedByAI')}</span>}
                                                    <span>{t('questionnaire.pointsEarned', { points: resp.pointsEarned?.toFixed(1) })}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        ) : (
            <>
                {/* Bar Graph Section */}
                {questionnaire.resultSettings.showGraph && (
                <section className="mb-10 p-4 md:p-6 bg-slate-50 rounded-lg shadow-lg">
                    <h2 className="text-2xl font-semibold text-gray-700 mb-6 flex items-center">
                    <FiBarChart2 className="mr-3 text-purple-600 h-7 w-7" />
                    {t('questionnaire.categoryScoresOverview')}
                    </h2>
                    <div className="md:max-w-[50%] md:mx-auto">
                    <div className="grid grid-cols-12 gap-x-1 sm:gap-x-2 items-start">
                    {categoryScores.map((catScore) => (
                        <div key={catScore.categoryId} className="flex flex-col items-center text-center">
                        <div className="text-sm sm:text-base font-semibold mb-1 text-purple-700" style={{ height: '2em' }}>
                            {catScore.score}
                        </div>
                        <div className="w-full h-32 sm:h-40 bg-gray-200 overflow-hidden relative shadow-inner">
                            <div
                            className="absolute bottom-0 left-0 right-0 bg-purple-600 transition-all duration-1000 ease-out"
                            style={{ height: `${(catScore.score / maxPossibleScore) * 100}%` }}
                            role="img"
                            aria-label={`${catScore.categoryName} score ${catScore.score}`}
                            ></div>
                        </div>
                        <div className="mt-2 w-full min-h-[3rem] flex items-center justify-center">
                            <p className="text-xs text-gray-600 [writing-mode:vertical-rl] [transform:rotate(180deg)]">
                                {catScore.categoryName}
                            </p>
                        </div>
                        </div>
                    ))}
                    </div>
                    </div>
                </section>
                )}

                {/* Top Categories Section */}
                <section className="mb-10">
                <h2 className="text-2xl font-semibold text-gray-700 mb-6 flex items-center">
                    <FiInfo className="mr-3 text-indigo-600 h-7 w-7"/>
                    {t('questionnaire.yourTopCategories')}
                </h2>
                {topCategories.length === 0 && (
                    <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700">
                    <p className="font-medium">{t('questionnaire.noTopCategories')}</p>
                    <p className="text-sm">This might mean your scores were generally low, or there wasn't a clear distinction. Consider retaking the questionnaire if you'd like to explore further.</p>
                    </div>
                )}
                <div className="space-y-8">
                    {topCategories.map((category) => {
                    const isVideoValid = category.videoUrl && (category.videoUrl.includes('youtube.com/embed') || category.videoUrl.includes('player.vimeo.com/video'));
                    return (
                        <div key={category.categoryId} className="p-4 md:p-6 bg-indigo-50 rounded-lg shadow-lg">
                        <h3 className="text-xl md:text-2xl font-bold text-indigo-700 mb-3">{category.name} (Score: {category.score})</h3>
                        <p className="text-gray-700 mb-4 leading-relaxed whitespace-pre-line text-sm md:text-base">{category.description}</p>
                        {isVideoValid ? (
                            <div className="aspect-w-16 aspect-h-9 rounded-lg overflow-hidden shadow-md border border-indigo-200">
                            <iframe
                                src={category.videoUrl}
                                title={category.name + " Video"}
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                allowFullScreen
                                className="w-full h-full"
                            ></iframe>
                            </div>
                        ) : (
                            category.videoUrl && <p className="text-sm text-red-500">Note: The provided video link for this category may not be a valid YouTube or Vimeo embed URL.</p>
                        )}
                        </div>
                    );
                    })}
                </div>
                </section>
            </>
        )}

        {/* Action Buttons */}
        <section className="mt-12 pt-8 border-t border-gray-200 flex flex-col sm:flex-row justify-center items-center space-y-4 sm:space-y-0 sm:space-x-6">
          {!isCustomQuiz && (
              <button
                onClick={onSave}
                disabled={isSaving}
                className={`w-full sm:w-auto px-6 py-3 text-white font-semibold rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center text-base shadow-md hover:shadow-lg ${isEmbedded ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}
                aria-label={isEmbedded ? t('questionnaire.completeAssignment') : t('questionnaire.saveResultsForAI')}
              >
                {isSaving ? <FiLoader className="animate-spin mr-2 h-5 w-5" /> : (isEmbedded ? <FiCheckSquare className="mr-2 h-5 w-5"/> : <FiSave className="mr-2 h-5 w-5" />)}
                {isSaving ? t('common.saving') : (isEmbedded ? t('questionnaire.completeAssignment') : t('questionnaire.saveResultsForAI'))}
              </button>
          )}
          <button
            onClick={onRetake}
            disabled={isSaving}
            className="w-full sm:w-auto px-6 py-3 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 disabled:opacity-50 transition-colors flex items-center justify-center text-base shadow-md hover:shadow-lg"
            aria-label={t('questionnaire.retakeQuestionnaire')}
          >
            <FiRefreshCw className="mr-2 h-5 w-5" /> {t('questionnaire.retakeQuestionnaire')}
          </button>
        </section>
        {!isEmbedded && !isCustomQuiz && (
            <p className="text-xs text-gray-500 mt-4 text-center px-2">
            Saving your results will allow the AI Mentor to use this information to better understand your needs and tailor responses to you. Your previous results for this questionnaire will be overwritten.
            </p>
        )}
      </div>
    </div>
  );
};

export default QuestionnaireResults;

const style = document.createElement('style');
style.innerHTML = `
.aspect-w-16 { position: relative; padding-bottom: 56.25%; }
.aspect-w-16 > iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fadeIn { animation: fadeIn 0.5s ease-out forwards; }
`;
document.head.appendChild(style);
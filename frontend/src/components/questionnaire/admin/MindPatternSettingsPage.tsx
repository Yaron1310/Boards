import React, { useState, useEffect, ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useData } from '../../../hooks/useData';
import type { MindPatternSetting } from '../../../types';
import { UserRole } from '../../../types';
import { useAuth } from '../../../hooks/useAuth';
import { FiEdit, FiSave, FiXCircle, FiChevronDown, FiChevronUp, FiLoader, FiAlertCircle, FiCheckCircle, FiHelpCircle } from 'react-icons/fi';
import { NUMBER_OF_MIND_PATTERNS } from '../../../constants';

const MindPatternSettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { 
    mindPatternSettings, 
    fetchMindPatternSettings, 
    updateMindPatternSetting, 
    isLoading: dataIsLoading, 
    dataError,
    clearDataError 
  } = useData();

  const [localLoading, setLocalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);
  
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);
  
  
  const [expandedPatternId, setExpandedPatternId] = useState<string | null>(null);
  const [currentEditData, setCurrentEditData] = useState<Partial<MindPatternSetting>>({});

  useEffect(() => {
    fetchMindPatternSettings();
  }, [fetchMindPatternSettings]);

  useEffect(() => {
    if (dataError) setError(dataError);
  }, [dataError]);

  const clearMessages = () => {
    setError(null);
    setSuccessMessage(null);
    if(dataError) clearDataError();
  }

  const handleToggleExpand = (patternId: string) => {
    clearMessages();
    if (expandedPatternId === patternId) {
      setExpandedPatternId(null);
      setCurrentEditData({});
    } else {
      const patternToEdit = mindPatternSettings.find(p => p.id === patternId);
      if (patternToEdit) {
        setExpandedPatternId(patternId);
        setCurrentEditData({ ...patternToEdit });
      }
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setCurrentEditData({
      ...currentEditData,
      [e.target.name]: e.target.value,
    });
  };
  
  const handleOrderChange = (e: ChangeEvent<HTMLInputElement>) => {
     setCurrentEditData({
      ...currentEditData,
      order: parseInt(e.target.value, 10)
    });
  };

  const handleSave = async (patternId: string) => {
    clearMessages();
    setLocalLoading(true);
    // Basic Validation
    if (!currentEditData.name?.trim() || 
        !currentEditData.question1?.trim() ||
        !currentEditData.question2?.trim() ||
        !currentEditData.question3?.trim() ||
        !currentEditData.resultText?.trim() ||
        currentEditData.order === undefined || currentEditData.order < 1 || currentEditData.order > NUMBER_OF_MIND_PATTERNS) {
        setError(t('questionnaire.admin.mindPattern.errorAllFieldsRequired'));
        setLocalLoading(false);
        return;
    }

    const dataToSave: Partial<Omit<MindPatternSetting, 'id' | 'createdAt' | 'updatedAt'>> = {
        name: currentEditData.name,
        question1: currentEditData.question1,
        question2: currentEditData.question2,
        question3: currentEditData.question3,
        resultText: currentEditData.resultText,
        videoUrl: currentEditData.videoUrl || '', // Ensure videoUrl is not undefined
        order: currentEditData.order,
    };
    
    const updatedPattern = await updateMindPatternSetting(patternId, dataToSave);
    setLocalLoading(false);
    if (updatedPattern) {
      setSuccessMessage(t('questionnaire.admin.mindPattern.saveSuccess', { name: updatedPattern.name }));
      setExpandedPatternId(null); // Collapse on save
      setCurrentEditData({});
    } else if (!dataError){
      setError(t('questionnaire.admin.mindPattern.errorSaveFailed'));
    }
  };

  if (user?.role !== UserRole.ACADEMY_ADMIN && user?.role !== UserRole.SYSTEM_ADMIN) {
    return <div className="p-6 text-red-600">{t('questionnaire.admin.mindPattern.accessDenied')}</div>;
  }

  const isLoading = dataIsLoading || localLoading;

  return (
    <div className="w-full h-full overflow-y-auto p-4 md:p-6 custom-scrollbar">
      <h1 className="text-3xl font-bold text-gray-800 mb-2">{t('questionnaire.admin.mindPattern.title')}</h1>
      <p className="text-gray-600 mb-6">{t('questionnaire.admin.mindPattern.subtitle')}</p>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 border border-red-300 rounded-md flex items-center">
          <FiAlertCircle className="mr-2"/> {error}
          <button onClick={clearMessages} className="ml-auto text-lg font-semibold">&times;</button>
        </div>
      )}
      {successMessage && (
        <div className="mb-4 p-3 bg-green-100 text-green-700 border border-green-300 rounded-md flex items-center">
          <FiCheckCircle className="mr-2"/> {successMessage}
           <button onClick={clearMessages} className="ml-auto text-lg font-semibold">&times;</button>
        </div>
      )}

      {dataIsLoading && mindPatternSettings.length === 0 && (
         <div className="flex justify-center items-center p-10">
            <FiLoader className="animate-spin h-8 w-8 text-blue-500" />
            <p className="ml-3 text-gray-600">{t('questionnaire.admin.mindPattern.loadingSettings')}</p>
        </div>
      )}

      <div className="space-y-4">
        {mindPatternSettings.sort((a,b) => a.order - b.order).map((pattern) => (
          <div key={pattern.id} className="bg-white shadow-lg rounded-lg overflow-hidden">
            <button
              onClick={() => handleToggleExpand(pattern.id)}
              className="w-full flex justify-between items-center p-4 text-left bg-gray-50 hover:bg-gray-100 focus:outline-none"
              aria-expanded={expandedPatternId === pattern.id}
            >
              <h2 className="text-lg font-semibold text-blue-700">
                {t('questionnaire.admin.mindPattern.patternLabel', { order: pattern.order })}: {pattern.name || t('questionnaire.admin.mindPattern.notDefined')}
              </h2>
              {expandedPatternId === pattern.id ? <FiChevronUp size={20} /> : <FiChevronDown size={20} />}
            </button>

            {expandedPatternId === pattern.id && (
              <div className="p-4 md:p-6 border-t border-gray-200">
                <form onSubmit={(e: React.FormEvent) => { e.preventDefault(); handleSave(pattern.id); }} className="space-y-4">
                  <p className="text-xs text-gray-500">{t('questionnaire.admin.mindPattern.mandatoryNote')}</p>
                  <div>
                    <label htmlFor={`order-${pattern.id}`} className="block text-sm font-medium text-gray-700">{t('questionnaire.admin.mindPattern.displayOrder')} <span aria-hidden="true">*</span></label>
                    <input
                      type="number"
                      id={`order-${pattern.id}`}
                      name="order"
                      value={currentEditData.order || ''}
                      onChange={handleOrderChange}
                      min="1"
                      max={NUMBER_OF_MIND_PATTERNS}
                      required
                      aria-required="true"
                      className="mt-1 block w-full sm:w-1/4 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor={`name-${pattern.id}`} className="block text-sm font-medium text-gray-700">{t('questionnaire.admin.mindPattern.patternName')} <span aria-hidden="true">*</span></label>
                    <input
                      type="text"
                      id={`name-${pattern.id}`}
                      name="name"
                      value={currentEditData.name || ''}
                      onChange={handleInputChange}
                      required
                      aria-required="true"
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor={`question1-${pattern.id}`} className="block text-sm font-medium text-gray-700">{t('questionnaire.admin.mindPattern.question1')} <span aria-hidden="true">*</span></label>
                    <textarea
                      id={`question1-${pattern.id}`}
                      name="question1"
                      rows={2}
                      value={currentEditData.question1 || ''}
                      onChange={handleInputChange}
                      required
                      aria-required="true"
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                   <div>
                    <label htmlFor={`question2-${pattern.id}`} className="block text-sm font-medium text-gray-700">{t('questionnaire.admin.mindPattern.question2')} <span aria-hidden="true">*</span></label>
                    <textarea
                      id={`question2-${pattern.id}`}
                      name="question2"
                      rows={2}
                      value={currentEditData.question2 || ''}
                      onChange={handleInputChange}
                      required
                      aria-required="true"
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                   <div>
                    <label htmlFor={`question3-${pattern.id}`} className="block text-sm font-medium text-gray-700">{t('questionnaire.admin.mindPattern.question3')} <span aria-hidden="true">*</span></label>
                    <textarea
                      id={`question3-${pattern.id}`}
                      name="question3"
                      rows={2}
                      value={currentEditData.question3 || ''}
                      onChange={handleInputChange}
                      required
                      aria-required="true"
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor={`resultText-${pattern.id}`} className="block text-sm font-medium text-gray-700">{t('questionnaire.admin.mindPattern.resultText')} <span aria-hidden="true">*</span></label>
                    <textarea
                      id={`resultText-${pattern.id}`}
                      name="resultText"
                      rows={4}
                      value={currentEditData.resultText || ''}
                      onChange={handleInputChange}
                      required
                      aria-required="true"
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor={`videoUrl-${pattern.id}`} className="block text-sm font-medium text-gray-700">
                        {t('questionnaire.admin.mindPattern.videoUrl')}
                        <button type="button" onClick={()=> alert("Use the 'embed' URL from YouTube or Vimeo.\n\nYouTube: Go to video > Share > Embed > copy the URL from the src attribute.\n\nVimeo: Go to video > Share > copy the URL from the Embed section.\n\nExample: https://www.youtube.com/embed/VIDEO_ID")} className="ml-2 text-blue-500 hover:text-blue-700">
                            <FiHelpCircle size={14} className="inline"/>
                        </button>
                    </label>
                    <input
                      type="url"
                      id={`videoUrl-${pattern.id}`}
                      name="videoUrl"
                      value={currentEditData.videoUrl || ''}
                      onChange={handleInputChange}
                      placeholder="e.g., https://www.youtube.com/embed/abc or https://player.vimeo.com/video/123"
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  <div className="flex justify-end space-x-3 pt-3">
                    <button
                      type="button"
                      onClick={() => handleToggleExpand(pattern.id)}
                      disabled={isLoading}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 disabled:opacity-50"
                    >
                      <FiXCircle className="inline mr-1" /> Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 flex items-center"
                    >
                      {isLoading && currentEditData.id === pattern.id ? <FiLoader className="animate-spin mr-2" /> : <FiSave className="inline mr-1" />}
                      {t('questionnaire.admin.mindPattern.savePattern', { order: pattern.order })}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default MindPatternSettingsPage;
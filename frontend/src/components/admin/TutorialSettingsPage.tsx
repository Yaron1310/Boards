
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useData } from '../../hooks/useData';
import { useAuth } from '../../hooks/useAuth';
import { UserRole, TutorialSettings } from '../../types';
import { FiVideo, FiSave, FiLoader, FiCheckCircle, FiAlertCircle, FiYoutube } from 'react-icons/fi';

const TutorialSettingsPage: React.FC = () => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const { 
        tutorialSettings, 
        fetchTutorialSettings, 
        updateTutorialSettings,
        isLoading: dataIsLoading,
        dataError,
        clearDataError
    } = useData();

    const [formData, setFormData] = useState<TutorialSettings>({});
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

    useEffect(() => {
        fetchTutorialSettings();
    }, [fetchTutorialSettings]);

    useEffect(() => {
        if (tutorialSettings) {
            setFormData(tutorialSettings);
        }
    }, [tutorialSettings]);

    useEffect(() => {
        if (dataError) {
            setFeedback({ type: 'error', text: dataError });
            clearDataError();
        }
    }, [dataError, clearDataError]);

    if (user?.role !== UserRole.SYSTEM_ADMIN) {
        return <div className="p-6 text-red-600">{t('admin.accessDenied')}</div>;
    }

    const sections = [
        { key: 'workspaces', label: t('admin.workspaceManagement') },
        { key: 'users', label: t('admin.userManagement') },
        { key: 'theme', label: t('admin.themeSettings') },
    ];

    const handleToggle = (key: keyof TutorialSettings) => {
        setFormData(prev => ({
            ...prev,
            [key]: {
                ...prev[key],
                enabled: !prev[key]?.enabled,
                videoUrl: prev[key]?.videoUrl || ''
            }
        }));
    };

    const handleUrlChange = (key: keyof TutorialSettings, value: string) => {
        setFormData(prev => ({
            ...prev,
            [key]: {
                ...prev[key],
                enabled: prev[key]?.enabled || false,
                videoUrl: value
            }
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFeedback(null);
        setIsLoading(true);
        const success = await updateTutorialSettings(formData);
        if (success) {
            setFeedback({ type: 'success', text: 'Tutorial settings saved successfully!' });
        }
        setIsLoading(false);
    };

    return (
        <div className="w-full h-full overflow-y-auto p-4 md:p-8 custom-scrollbar">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-3xl font-bold text-gray-800 mb-8 flex items-center">
                    <FiVideo className="mr-3 text-red-600"/> Tutorial Settings
                </h1>
                
                <p className="text-gray-600 mb-6">
                    Configure tutorial videos for WorkHub Admin pages. When enabled, a "Watch a tutorial" link will appear on the corresponding page for WorkHub Admins.
                </p>

                {feedback && (
                    <div className={`p-3 mb-6 rounded-md flex items-center text-sm ${feedback.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {feedback.type === 'success' ? <FiCheckCircle className="mr-2"/> : <FiAlertCircle className="mr-2"/>}
                        {feedback.text}
                        <button onClick={() => setFeedback(null)} className="ml-auto text-lg font-semibold">&times;</button>
                    </div>
                )}

                {dataIsLoading && !tutorialSettings ? (
                    <div className="flex justify-center items-center p-10">
                        <FiLoader className="animate-spin h-8 w-8 text-blue-500" />
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 gap-6">
                            {sections.map(section => {
                                const key = section.key as keyof TutorialSettings;
                                const isEnabled = formData[key]?.enabled || false;
                                const videoUrl = formData[key]?.videoUrl || '';

                                return (
                                    <div key={key} className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-lg font-semibold text-gray-800">{section.label}</h3>
                                            <div className="relative inline-block w-12 mr-2 align-middle select-none transition duration-200 ease-in">
                                                <input 
                                                    type="checkbox" 
                                                    name={`toggle-${key}`} 
                                                    id={`toggle-${key}`} 
                                                    checked={isEnabled}
                                                    onChange={() => handleToggle(key)}
                                                    className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
                                                />
                                                <label 
                                                    htmlFor={`toggle-${key}`} 
                                                    className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer ${isEnabled ? 'bg-green-400' : 'bg-gray-300'}`}
                                                ></label>
                                            </div>
                                        </div>
                                        
                                        {isEnabled && (
                                            <div className="animate-fadeIn">
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Video URL (YouTube or Vimeo)</label>
                                                <div className="flex items-center">
                                                    <div className="relative flex-grow">
                                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                            <FiYoutube className="text-gray-400" />
                                                        </div>
                                                        <input
                                                            type="text"
                                                            value={videoUrl}
                                                            onChange={(e) => handleUrlChange(key, e.target.value)}
                                                            className="pl-10 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                                                            placeholder="https://www.youtube.com/watch?v=..."
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex justify-end pt-6">
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 flex items-center"
                            >
                                {isLoading ? <FiLoader className="animate-spin mr-2"/> : <FiSave className="mr-2"/>}
                                Save Settings
                            </button>
                        </div>
                    </form>
                )}
            </div>
            <style>{`
                .toggle-checkbox:checked {
                    right: 0;
                    border-color: #68D391;
                }
                .toggle-checkbox {
                    right: 24px;
                    transition: all 0.3s;
                }
                .toggle-label {
                    width: 48px;
                }
            `}</style>
        </div>
    );
};

export default TutorialSettingsPage;

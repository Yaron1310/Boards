import React, { useState, useEffect, useCallback } from 'react';
import type { Settings, ProductMapping } from '../types';
import { fetchSettings, saveSettings as apiSaveSettings } from '../services/api';
import ApiSettings from './ApiSettings';
import ProductMappingManager from './ProductMappingManager';
import { SpinnerIcon } from './icons';

const Settings: React.FC = () => {
    const [initialSettings, setInitialSettings] = useState<Settings | null>(null);
    const [settings, setSettings] = useState<Settings | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    
    // State for API Settings save operation
    const [isApiSaving, setIsApiSaving] = useState<boolean>(false);
    const [apiSaveState, setApiSaveState] = useState<{
        status: 'idle' | 'success' | 'error';
        message: string;
    }>({ status: 'idle', message: '' });

    useEffect(() => {
        const loadSettings = async () => {
            setIsLoading(true);
            try {
                const fetchedSettings = await fetchSettings();
                setSettings(fetchedSettings);
                setInitialSettings(JSON.parse(JSON.stringify(fetchedSettings))); // Deep copy for comparison
            } catch (error) {
                console.error("Failed to load settings:", error);
                const emptySettings = { apiKey: '', apiUrl: 'https://studio.gymind.app/api/provision/woocommerce', mappings: [] };
                setSettings(emptySettings);
                setInitialSettings(emptySettings);
            } finally {
                setIsLoading(false);
            }
        };

        loadSettings();
    }, []);

    const handleSettingsChange = useCallback(<K extends keyof Settings>(field: K, value: Settings[K]) => {
        setSettings(prev => (prev ? { ...prev, [field]: value } : null));
        if (field === 'apiKey' || field === 'apiUrl') {
            setApiSaveState({ status: 'idle', message: '' });
        }
    }, []);

    const handleSaveSettings = useCallback(async (settingsToSave: Settings) => {
        try {
            const response = await apiSaveSettings(settingsToSave);
            const newInitialSettings = JSON.parse(JSON.stringify(settingsToSave));
            setInitialSettings(newInitialSettings);
            setSettings(newInitialSettings); // Ensure main state is in sync
            return response;
        } catch (error) {
            console.error("Failed to save settings:", error);
            throw error; // Re-throw to be handled by caller
        }
    }, []);
    
    const handleSaveApiSettings = useCallback(async () => {
        if (!settings) return;
        setIsApiSaving(true);
        setApiSaveState({ status: 'idle', message: '' });
        try {
            const response = await handleSaveSettings(settings);

            if (response.webhook_status === 'failed') {
                setApiSaveState({
                    status: 'error',
                    message: `Settings saved, but webhook registration failed: ${response.webhook_message || 'Please check API key.'}`
                });
            } else if (response.webhook_status === 'success') {
                setApiSaveState({
                    status: 'success',
                    message: 'Changes saved and webhook registered successfully!'
                });
            } else {
                setApiSaveState({
                    status: 'success',
                    message: 'Changes saved successfully!'
                });
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
            setApiSaveState({ status: 'error', message: `Could not save settings: ${errorMessage}` });
        } finally {
            setIsApiSaving(false);
            setTimeout(() => setApiSaveState({ status: 'idle', message: '' }), 5000);
        }
    }, [settings, handleSaveSettings]);

    const handleSaveMappings = useCallback(async () => {
        if (!settings) return;
        await handleSaveSettings(settings);
    }, [settings, handleSaveSettings]);

    const handleRemoveMappingAndSave = useCallback(async (id: string) => {
        if (!settings) return;
        
        const newMappings = settings.mappings.filter(m => m.id !== id);
        const newSettings = { ...settings, mappings: newMappings };

        // Directly save the new state without a global loading indicator
        await handleSaveSettings(newSettings);
    }, [settings, handleSaveSettings]);


    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-white text-xl flex items-center">
                    <SpinnerIcon className="w-6 h-6 mr-3"/>
                    Loading Settings...
                </div>
            </div>
        );
    }

    if (!settings || !initialSettings) {
         return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-red-400 text-xl">Could not load application settings. Please refresh.</div>
            </div>
        );
    }

    const isApiDirty = settings.apiKey !== initialSettings.apiKey || settings.apiUrl !== initialSettings.apiUrl;

    return (
        <div className="space-y-8">
            <ApiSettings 
                apiKey={settings.apiKey}
                apiUrl={settings.apiUrl}
                onApiKeyChange={(value) => handleSettingsChange('apiKey', value)}
                onApiUrlChange={(value) => handleSettingsChange('apiUrl', value)}
                onSave={handleSaveApiSettings}
                isSaving={isApiSaving}
                isDirty={isApiDirty}
                saveState={apiSaveState}
            />
            <ProductMappingManager 
                mappings={settings.mappings}
                onMappingsChange={(value: ProductMapping[]) => handleSettingsChange('mappings', value)}
                apiKey={settings.apiKey}
                apiUrl={settings.apiUrl}
                onSave={handleSaveMappings}
                onRemoveAndSave={handleRemoveMappingAndSave}
            />
        </div>
    );
};

export default Settings;

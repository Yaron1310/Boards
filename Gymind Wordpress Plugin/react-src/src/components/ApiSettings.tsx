import React, { useState, useEffect } from 'react';
import { EyeIcon, EyeOffIcon, SpinnerIcon, CheckIcon } from './icons';

interface ApiSettingsProps {
    apiKey: string;
    apiUrl: string;
    onApiKeyChange: (value: string) => void;
    onApiUrlChange: (value:string) => void;
    onSave: () => Promise<void>;
    isSaving: boolean;
    isDirty: boolean;
    saveState: {
        status: 'idle' | 'success' | 'error';
        message: string;
    };
}

interface InputFieldProps {
    label: string;
    id: string;
    name?: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    type?: string;
    children?: React.ReactNode;
    autoComplete?: string;
    style?: React.CSSProperties;
    readOnly?: boolean;
    onFocus?: () => void;
    onBlur?: () => void;
}

const InputField: React.FC<InputFieldProps> = ({ label, id, name, value, onChange, type = "text", children, autoComplete, style, readOnly, onFocus, onBlur }) => (
    <div>
        <label htmlFor={id} className="block text-sm font-medium text-gray-light mb-1">
            {label}
        </label>
        <div className="relative">
            <input
                type={type}
                id={id}
                name={name}
                value={value}
                onChange={onChange}
                autoComplete={autoComplete}
                style={style}
                className="bg-gray-medium border border-gray-600 text-white sm:text-sm rounded-lg focus:ring-brand-primary focus:border-brand-primary block w-full p-2.5 pe-10"
                data-lpignore="true" 
                data-1p-ignore="true"
                readOnly={readOnly}
                onFocus={onFocus}
                onBlur={onBlur}
            />
            {children}
        </div>
    </div>
);

const ApiSettings: React.FC<ApiSettingsProps> = ({ apiKey, apiUrl, onApiKeyChange, onApiUrlChange, onSave, isSaving, isDirty, saveState }) => {
    const [showApiKey, setShowApiKey] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [isWebkit, setIsWebkit] = useState(false);
    const [isApiKeyFocused, setIsApiKeyFocused] = useState(false);

    useEffect(() => {
        // Check for Webkit text security support (Chrome, Safari, Edge)
        // This allows us to use type="text" with a mask, which prevents Chrome from
        // thinking this is a password field during AJAX saves.
        const isSupported = 'WebkitTextSecurity' in document.documentElement.style;
        setIsWebkit(isSupported);
    }, []);

    const isButtonDisabled = !isDirty || isSaving;

    const getSaveMessage = () => {
        if (saveState.message) {
            const messageClass = saveState.status === 'error' ? 'text-red-400' : 'text-green-400';
            return <span className={`${messageClass} font-medium`}>{saveState.message}</span>;
        }
        if (isSaving) {
            return <span>Saving API settings...</span>;
        }
        if (isDirty) {
            return <span>You have unsaved changes.</span>;
        }
        return <span>API settings are saved.</span>;
    };

    // Determine input type and style based on browser capabilities
    // If Webkit, use text type + security mask. Else fallback to password type.
    const apiKeyInputType = showApiKey ? 'text' : (isWebkit ? 'text' : 'password');
    // Fix: Cast to any to allow non-standard CSS property
    const apiKeyStyle: React.CSSProperties | undefined = (!showApiKey && isWebkit) ? ({ WebkitTextSecurity: 'disc' } as any) : undefined;

    return (
        <section className="bg-gray-medium/50 p-6 rounded-lg border border-gray-700 shadow-lg relative">
            <h2 className="text-lg font-semibold text-white mb-4">API Configuration</h2>
            <div className="space-y-4">
                <InputField
                    label="Gymind Academy API Key"
                    id="gymind-api-key"
                    name="gymind_api_key_setting"
                    value={apiKey}
                    onChange={(e) => onApiKeyChange(e.target.value)}
                    type={apiKeyInputType}
                    autoComplete="off"
                    style={apiKeyStyle}
                    readOnly={!isApiKeyFocused}
                    onFocus={() => setIsApiKeyFocused(true)}
                    onBlur={() => setIsApiKeyFocused(false)}
                >
                    <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute inset-y-0 end-0 flex items-center pe-3 text-gray-light hover:text-white"
                        aria-label={showApiKey ? "Hide API key" : "Show API key"}
                    >
                        {showApiKey ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                    </button>
                </InputField>

                {showAdvanced ? (
                     <InputField
                        label="Gymind API URL"
                        id="gymind-api-url"
                        name="gymind_api_url_setting"
                        value={apiUrl}
                        onChange={(e) => onApiUrlChange(e.target.value)}
                        autoComplete="off"
                    />
                ) : (
                    <div className="text-right h-5"> 
                        <button 
                            onClick={() => setShowAdvanced(true)} 
                            className="text-sm text-brand-primary hover:text-brand-secondary font-medium transition-colors"
                        >
                            Advanced Options
                        </button>
                    </div>
                )}
            </div>
            <div className="mt-6 pt-4 border-t border-gray-700 flex justify-end items-center gap-4">
                <div className="text-sm text-gray-light min-h-[20px] text-right flex-grow">
                   {getSaveMessage()}
                </div>
                <button
                    onClick={onSave}
                    disabled={isButtonDisabled}
                    className={`inline-flex items-center justify-center px-6 py-2 border border-transparent text-base font-medium rounded-md shadow-sm text-white transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-dark focus:ring-brand-primary ${
                        isButtonDisabled ? 'bg-gray-500 cursor-not-allowed opacity-60' : 'bg-brand-primary hover:bg-brand-secondary'
                    } ${isSaving ? 'bg-brand-secondary cursor-wait' : ''}`}
                >
                    {isSaving ? (
                        <>
                            <SpinnerIcon className="w-5 h-5 mr-2" />
                            Saving...
                        </>
                    ) : saveState.status === 'success' && !isDirty ? (
                        <>
                            <CheckIcon className="w-5 h-5 mr-2" />
                            Saved!
                        </>
                    ) : (
                        'Save API Settings'
                    )}
                </button>
            </div>
        </section>
    );
};

export default ApiSettings;
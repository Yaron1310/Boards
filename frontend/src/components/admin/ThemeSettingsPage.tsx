
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useData } from '../../hooks/useData';
import type { OrganizationSettings } from '../../types';
import { FiSave, FiLoader, FiAlertCircle, FiCheckCircle, FiUploadCloud } from 'react-icons/fi';

interface ThemeSettingsPageProps {
    onDirtyChange?: (isDirty: boolean) => void;
}

const THEME_FIELDS: (keyof OrganizationSettings)[] = [
    'sidebarColor',
    'enableSidebarGradient',
    'sidebarHueRotation',
    'sidebarGradientHeight',
    'sidebarGradientMaskOpacity',
    'displayNameColor',
    'sidebarLinkColor',
    'logoUrl',
];

const LOGO_MAX_RAW_SIZE = 10 * 1024 * 1024; // 10 MB — reject before processing
const LOGO_MAX_DIMENSION = 200; // px
const LOGO_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const compressLogoToPng = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(objectUrl);

            let { width, height } = img;
            if (width > LOGO_MAX_DIMENSION || height > LOGO_MAX_DIMENSION) {
                if (width >= height) {
                    height = Math.round((height / width) * LOGO_MAX_DIMENSION);
                    width = LOGO_MAX_DIMENSION;
                } else {
                    width = Math.round((width / height) * LOGO_MAX_DIMENSION);
                    height = LOGO_MAX_DIMENSION;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Canvas context unavailable'));
                return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/png'));
        };

        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Failed to load image'));
        };

        img.src = objectUrl;
    });
};

const ThemeSettingsPage: React.FC<ThemeSettingsPageProps> = ({ onDirtyChange }) => {
    const { t } = useTranslation();
    const { organizationSettings, updateOrganizationSettings, setOrganizationSettingsLocal, isLoading, dataError, clearDataError } = useData();
    const [formData, setFormData] = useState<Partial<OrganizationSettings> & { logoUpload?: string; }>({});
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [savedSettings, setSavedSettings] = useState<OrganizationSettings | null>(null);
    const [isDirty, setIsDirty] = useState(false);

    // Track the saved settings snapshot separately from the live-preview organizationSettings
    useEffect(() => {
        if (organizationSettings && !savedSettings) {
            setSavedSettings(organizationSettings);
            setFormData(organizationSettings);
        }
    }, [organizationSettings, savedSettings]);

    // Compute dirty state by comparing current form data against saved settings
    const computeIsDirty = useCallback((current: Partial<OrganizationSettings> & { logoUpload?: string }, saved: OrganizationSettings | null): boolean => {
        if (!saved) return false;
        if (current.logoUpload) return true;
        for (const field of THEME_FIELDS) {
            const currentVal = current[field];
            const savedVal = saved[field];
            if (String(currentVal ?? '') !== String(savedVal ?? '')) {
                return true;
            }
        }
        return false;
    }, []);

    useEffect(() => {
        const dirty = computeIsDirty(formData, savedSettings);
        setIsDirty(dirty);
        onDirtyChange?.(dirty);
    }, [formData, savedSettings, computeIsDirty, onDirtyChange]);

    // Browser beforeunload warning
    useEffect(() => {
        if (!isDirty) return;
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);

    useEffect(() => {
        if (dataError) {
            setFeedback({ type: 'error', text: dataError });
            clearDataError();
        }
    }, [dataError, clearDataError]);

    // Auto-dismiss feedback after 5 seconds
    useEffect(() => {
        if (feedback) {
            const timer = setTimeout(() => {
                setFeedback(null);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [feedback]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        const newValue = type === 'checkbox' ? checked : value;
        const updatedForm = {
            ...formData,
            [name]: newValue,
        };
        setFormData(updatedForm);

        // Optimistically update the context for live preview in Sidebar
        if (organizationSettings) {
            setOrganizationSettingsLocal({
                ...organizationSettings,
                ...(updatedForm as OrganizationSettings)
            });
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!LOGO_ALLOWED_TYPES.includes(file.type)) {
            setFeedback({ type: 'error', text: t('admin.themeSettings.invalidFileType') });
            e.target.value = '';
            return;
        }

        if (file.size > LOGO_MAX_RAW_SIZE) {
            setFeedback({ type: 'error', text: t('admin.themeSettings.fileTooLarge') });
            e.target.value = '';
            return;
        }

        compressLogoToPng(file)
            .then((pngDataUrl) => {
                const updatedForm = { ...formData, logoUpload: pngDataUrl, logoUrl: pngDataUrl };
                setFormData(updatedForm);

                if (organizationSettings) {
                    setOrganizationSettingsLocal({
                        ...organizationSettings,
                        logoUrl: pngDataUrl
                    });
                }
            })
            .catch(() => {
                setFeedback({ type: 'error', text: t('admin.themeSettings.failedToProcessImage') });
                e.target.value = '';
            });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFeedback(null);
        const updated = await updateOrganizationSettings(formData);
        if (updated) {
            setFeedback({ type: 'success', text: t('admin.themeSettings.savedSuccess') });
            setFormData(prev => ({...prev, logoUpload: undefined}));
            // Update saved snapshot so dirty state resets
            setSavedSettings({ ...organizationSettings, ...formData, logoUpload: undefined } as OrganizationSettings);
        } else {
            setFeedback({ type: 'error', text: dataError || t('admin.themeSettings.saveFailed') });
        }
    };

    const SaveButton: React.FC<{ className?: string }> = ({ className = '' }) => (
        <button
            type="button"
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={isLoading}
            className={`flex items-center justify-center py-2 px-6 rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 ${isDirty ? 'ring-2 ring-orange-400 ring-offset-2' : ''} ${className}`}
            aria-label={t('admin.themeSettings.saveThemeSettings')}
        >
            {isLoading ? <FiLoader className="animate-spin mr-2"/> : <FiSave className="mr-2"/>}
            {isLoading ? t('admin.themeSettings.saving') : t('admin.themeSettings.saveThemeSettings')}
        </button>
    );

    const UnsavedMessage: React.FC = () => (
        <p className="text-xs font-medium text-orange-600 bg-orange-50 border border-orange-300 rounded-md px-3 py-1.5 mt-1.5">
            {t('admin.themeSettings.unsavedChanges')}
        </p>
    );

    return (
        <div className="w-full h-full overflow-y-auto custom-scrollbar">

            {/* Main Content */}
            <div className="px-4 md:px-8 pb-8 pt-6">
                <div className="max-w-4xl mx-auto">

                        {/* Top-right Save Button */}
                        <div className="flex justify-end items-start mb-4">
                            <div className="flex flex-col items-end">
                                <SaveButton />
                                {isDirty && <UnsavedMessage />}
                                {feedback && (
                                    <div className={`mt-1.5 flex items-center text-sm ${
                                        feedback.type === 'success'
                                            ? 'text-green-600'
                                            : 'text-red-600'
                                    }`}>
                                        {feedback.type === 'success' ? <FiCheckCircle className="mr-1.5 flex-shrink-0"/> : <FiAlertCircle className="mr-1.5 flex-shrink-0"/>}
                                        {feedback.text}
                                    </div>
                                )}
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6">


                            {/* Logo Upload */}
                            <div>
                                <label htmlFor="logoUpload" className="block text-sm font-medium text-gray-700">{t('admin.themeSettings.organizationLogo')}</label>
                                <div className="mt-1 flex items-center space-x-4">
                                    {formData.logoUrl && <img src={formData.logoUrl} alt={t('admin.themeSettings.logoPreviewAlt')} className="h-12 w-12 rounded-full object-cover bg-gray-100" />}
                                    <label htmlFor="logoUpload" className="cursor-pointer inline-flex items-center px-4 py-2 text-sm bg-white text-gray-700 rounded-md border border-gray-300 hover:bg-gray-50 shadow-sm">
                                        <FiUploadCloud className="mr-2"/> {t('admin.themeSettings.uploadLogo')}
                                    </label>
                                    <input type="file" id="logoUpload" name="logoUpload" accept="image/*" onChange={handleFileChange} className="hidden"/>
                                </div>
                                <p className="text-xs text-gray-500 mt-2">{t('admin.themeSettings.logoUploadHint')}</p>
                            </div>

                            {/* Sidebar Color */}
                            <div>
                                <label htmlFor="sidebarColor" className="block text-sm font-medium text-gray-700">{t('admin.themeSettings.sidebarBackgroundColor')}</label>
                                <div className="mt-1 flex items-center space-x-3">
                                    <input
                                        type="color"
                                        id="sidebarColor"
                                        name="sidebarColor"
                                        value={formData.sidebarColor || '#000000'}
                                        onChange={handleInputChange}
                                        className="p-1 h-10 w-10 block bg-white border border-gray-300 rounded-md cursor-pointer"
                                    />
                                    <input
                                        type="text"
                                        value={formData.sidebarColor || ''}
                                        onChange={handleInputChange}
                                        name="sidebarColor"
                                        className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="#RRGGBB"
                                    />
                                </div>
                            </div>

                            {/* Sidebar Gradient Toggle */}
                            <div className="pt-2">
                                <label htmlFor="enableSidebarGradient" className="flex items-center text-sm font-medium text-gray-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        id="enableSidebarGradient"
                                        name="enableSidebarGradient"
                                        checked={formData.enableSidebarGradient ?? true}
                                        onChange={handleInputChange}
                                        className="h-5 w-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 mr-3"
                                    />
                                    {t('admin.themeSettings.enableSidebarGradient')}
                                </label>
                                <p className="text-xs text-gray-500 mt-1 ml-8">{t('admin.themeSettings.enableSidebarGradientHint')}</p>
                            </div>

                            {/* Sidebar Gradient Settings */}
                            {formData.enableSidebarGradient && (
                                <div className="ml-8 space-y-4 pt-2 border-l-2 border-gray-100 pl-4">
                                    {/* Hue Rotation */}
                                    <div>
                                        <label htmlFor="sidebarHueRotation" className="block text-sm font-medium text-gray-700 mb-2">{t('admin.themeSettings.gradientHueRotation')}</label>
                                        <div className="flex items-center space-x-4">
                                            <input
                                                type="range"
                                                id="sidebarHueRotation"
                                                name="sidebarHueRotation"
                                                min="0"
                                                max="360"
                                                value={formData.sidebarHueRotation || 270}
                                                onChange={handleInputChange}
                                                className="w-full md:w-3/4 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                            />
                                            <span className="text-sm text-gray-600 w-12 text-center">{formData.sidebarHueRotation || 270}°</span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">{t('admin.themeSettings.gradientHueRotationHint')}</p>
                                    </div>

                                    {/* Height */}
                                    <div>
                                        <label htmlFor="sidebarGradientHeight" className="block text-sm font-medium text-gray-700 mb-2">{t('admin.themeSettings.gradientHeight')}</label>
                                        <div className="flex items-center space-x-4">
                                            <input
                                                type="range"
                                                id="sidebarGradientHeight"
                                                name="sidebarGradientHeight"
                                                min="0"
                                                max="100"
                                                value={formData.sidebarGradientHeight || 85}
                                                onChange={handleInputChange}
                                                className="w-full md:w-3/4 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                            />
                                            <span className="text-sm text-gray-600 w-12 text-center">{formData.sidebarGradientHeight || 85}%</span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">{t('admin.themeSettings.gradientHeightHint')}</p>
                                    </div>

                                    {/* Mask Opacity */}
                                    <div>
                                        <label htmlFor="sidebarGradientMaskOpacity" className="block text-sm font-medium text-gray-700 mb-2">{t('admin.themeSettings.maskOpacity')}</label>
                                        <div className="flex items-center space-x-4">
                                            <input
                                                type="range"
                                                id="sidebarGradientMaskOpacity"
                                                name="sidebarGradientMaskOpacity"
                                                min="0"
                                                max="100"
                                                value={formData.sidebarGradientMaskOpacity || 40}
                                                onChange={handleInputChange}
                                                className="w-full md:w-3/4 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                            />
                                            <span className="text-sm text-gray-600 w-12 text-center">{formData.sidebarGradientMaskOpacity || 40}%</span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">{t('admin.themeSettings.maskOpacityHint')}</p>
                                    </div>
                                </div>
                            )}

                            {/* Display Name Color */}
                            <div className="pt-4 border-t">
                                <label htmlFor="displayNameColor" className="block text-sm font-medium text-gray-700">{t('admin.themeSettings.displayNameColor')}</label>
                                <div className="mt-1 flex items-center space-x-3">
                                    <input
                                        type="color"
                                        id="displayNameColor"
                                        name="displayNameColor"
                                        value={formData.displayNameColor || '#ffffff'}
                                        onChange={handleInputChange}
                                        className="p-1 h-10 w-10 block bg-white border border-gray-300 rounded-md cursor-pointer"
                                    />
                                    <input
                                        type="text"
                                        value={formData.displayNameColor || ''}
                                        onChange={handleInputChange}
                                        name="displayNameColor"
                                        className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="#RRGGBB"
                                    />
                                </div>
                            </div>

                            {/* Sidebar Link Color */}
                            <div>
                                <label htmlFor="sidebarLinkColor" className="block text-sm font-medium text-gray-700">{t('admin.themeSettings.sidebarLinkColor')}</label>
                                <div className="mt-1 flex items-center space-x-3">
                                    <input
                                        type="color"
                                        id="sidebarLinkColor"
                                        name="sidebarLinkColor"
                                        value={formData.sidebarLinkColor || '#e5e7eb'}
                                        onChange={handleInputChange}
                                        className="p-1 h-10 w-10 block bg-white border border-gray-300 rounded-md cursor-pointer"
                                    />
                                    <input
                                        type="text"
                                        value={formData.sidebarLinkColor || ''}
                                        onChange={handleInputChange}
                                        name="sidebarLinkColor"
                                        className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="#RRGGBB"
                                    />
                                </div>
                            </div>

                            <div className="pt-5">
                                <div className="flex flex-col items-end">
                                    <SaveButton className="w-full sm:w-auto" />
                                    {isDirty && <UnsavedMessage />}
                                </div>
                                {/* Inline Feedback Message */}
                                {feedback && (
                                    <div className={`mt-4 flex items-center justify-end text-sm ${
                                        feedback.type === 'success'
                                            ? 'text-green-600'
                                            : 'text-red-600'
                                    }`}>
                                        {feedback.type === 'success' ? <FiCheckCircle className="mr-1.5 flex-shrink-0"/> : <FiAlertCircle className="mr-1.5 flex-shrink-0"/>}
                                        {feedback.text}
                                    </div>
                                )}
                            </div>
                        </form>
                </div>
            </div>
        </div>
    );
};

export default ThemeSettingsPage;

import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FiXCircle, FiCopy, FiRefreshCw, FiDownload, FiLoader, FiCheckCircle, FiAlertTriangle, FiEye, FiEyeOff } from 'react-icons/fi';
import { useData } from '@/hooks/useData';
import { BACKEND_API_URL } from '@/constants';

interface BridgeSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const BridgeSettingsModal: React.FC<BridgeSettingsModalProps> = ({ isOpen, onClose }) => {
    const { t } = useTranslation();
    const { academySettings, regenerateBridgeKey } = useData();
    const [isLoading, setIsLoading] = useState(false);
    const [showRegenConfirm, setShowRegenConfirm] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [copied, setCopied] = useState(false);
    const [showKey, setShowKey] = useState(false);

    if (!isOpen) return null;

    const bridgeSecretKey = academySettings?.bridgeSecretKey ?? '';

    const handleRegenerateKey = async () => {
        setIsLoading(true);
        setFeedback(null);
        const result = await regenerateBridgeKey();
        if (result) {
            setFeedback({ type: 'success', text: t('admin.bridge.keyRegeneratedSuccess') });
        } else {
            setFeedback({ type: 'error', text: t('admin.bridge.keyRegeneratedError') });
        }
        setShowRegenConfirm(false);
        setIsLoading(false);
    };

    const handleCopyKey = async () => {
        if (!bridgeSecretKey) return;
        await navigator.clipboard.writeText(bridgeSecretKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        window.open(`${BACKEND_API_URL}/api/bridge/download`, '_blank');
    };

    return ReactDOM.createPortal(
        <div
            className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[60]"
            role="dialog"
            aria-modal="true"
            aria-label={t('admin.bridge.settingsAriaLabel')}
        >
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-4 border-b">
                    <h3 className="text-lg font-semibold text-gray-800">{t('admin.bridge.title')}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label={t('admin.bridge.closeSettings')}>
                        <FiXCircle size={20} />
                    </button>
                </div>

                <div className="p-4 space-y-5">
                    {feedback && (
                        <div className={`flex items-center gap-2 p-3 rounded-md text-sm ${feedback.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                            {feedback.type === 'success' ? <FiCheckCircle /> : <FiAlertTriangle />}
                            {feedback.text}
                        </div>
                    )}

                    {/* Security Key */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.bridge.securityKeyLabel')}</label>
                        <p className="text-xs text-gray-500 mb-2">{t('admin.bridge.securityKeyDescription')}</p>
                        <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 border border-gray-300 rounded-md px-3 py-2 text-sm font-mono text-gray-700 truncate">
                                {showKey ? bridgeSecretKey : '\u2022'.repeat(Math.min(bridgeSecretKey.length, 32))}
                            </div>
                            <button
                                onClick={() => setShowKey(!showKey)}
                                className="p-2 text-gray-500 hover:text-gray-700 border border-gray-300 rounded-md"
                                aria-label={showKey ? t('admin.bridge.hideKey') : t('admin.bridge.showKey')}
                            >
                                {showKey ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                            </button>
                            <button
                                onClick={handleCopyKey}
                                className="p-2 text-gray-500 hover:text-gray-700 border border-gray-300 rounded-md"
                                aria-label={t('admin.bridge.copyKey')}
                            >
                                {copied ? <FiCheckCircle size={16} className="text-green-600" /> : <FiCopy size={16} />}
                            </button>
                        </div>
                        <div className="mt-2">
                            {!showRegenConfirm ? (
                                <button
                                    onClick={() => setShowRegenConfirm(true)}
                                    className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1"
                                    aria-label={t('admin.bridge.regenerateKey')}
                                >
                                    <FiRefreshCw size={12} /> {t('admin.bridge.regenerateKey')}
                                </button>
                            ) : (
                                <div className="bg-red-50 p-3 rounded-md">
                                    <p className="text-xs text-red-700 mb-2">
                                        {t('admin.bridge.regenerateWarning')}
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleRegenerateKey}
                                            disabled={isLoading}
                                            className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
                                        >
                                            {isLoading ? <FiLoader className="animate-spin" size={12} /> : <FiRefreshCw size={12} />}
                                            {t('common.confirm')}
                                        </button>
                                        <button
                                            onClick={() => setShowRegenConfirm(false)}
                                            className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                                        >
                                            {t('common.cancel')}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Install Bridge Server */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.bridge.installLabel')}</label>
                        <p className="text-xs text-gray-500 mb-2">{t('admin.bridge.installDescription')}</p>
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => window.open(`${BACKEND_API_URL}/api/bridge/install/linux`, '_blank')}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
                                aria-label={t('admin.bridge.downloadLinux')}
                            >
                                <FiDownload size={16} />
                                {t('admin.bridge.downloadLinux')}
                            </button>
                            <button
                                onClick={() => window.open(`${BACKEND_API_URL}/api/bridge/install/windows`, '_blank')}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
                                aria-label={t('admin.bridge.downloadWindows')}
                            >
                                <FiDownload size={16} />
                                {t('admin.bridge.downloadWindows')}
                            </button>
                            <button
                                onClick={handleDownload}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200 transition-colors border border-gray-300"
                                aria-label={t('admin.bridge.downloadBridgeOnly')}
                            >
                                <FiDownload size={16} />
                                {t('admin.bridge.downloadBridgeOnly')}
                            </button>
                        </div>
                        <p className="text-xs text-gray-400 mt-2">{t('admin.bridge.installNote')}</p>
                    </div>

                </div>

                <div className="flex justify-end p-4 border-t">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm"
                    >
                        {t('common.close')}
                    </button>
                </div>
            </div>
        </div>,
        document.getElementById('modal-root')!
    );
};

export default BridgeSettingsModal;

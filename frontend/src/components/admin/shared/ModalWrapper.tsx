import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiXCircle } from 'react-icons/fi';

export const ModalWrapper = ({ title, onClose, children, size = 'max-w-2xl' }: { title: string; onClose: () => void; children: React.ReactNode; size?: string }) => {
    const { t } = useTranslation();
    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
            <div className={`bg-white rounded-lg shadow-xl w-full ${size} max-h-[90vh] flex flex-col`}>
                <div className="p-4 border-b flex justify-between items-center flex-shrink-0">
                    <h2 className="text-xl font-bold text-gray-800">{title}</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" aria-label={t('common.close')}><FiXCircle size={24} /></button>
                </div>
                <div className="p-6 flex-grow overflow-y-auto custom-scrollbar">
                    {children}
                </div>
            </div>
        </div>
    );
};

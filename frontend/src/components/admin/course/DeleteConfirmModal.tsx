import React from 'react';
import { useTranslation } from 'react-i18next';
import ReactDOM from 'react-dom';
import { FiAlertTriangle, FiTrash2, FiLoader } from 'react-icons/fi';

interface DeleteConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    itemType: 'course' | 'lesson';
    itemName: string;
    isLoading: boolean;
    additionalInfo?: string;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({ isOpen, onClose, onConfirm, itemType, itemName, isLoading, additionalInfo }) => {
    const { t } = useTranslation();
    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full">
                <div className="flex items-start mb-4">
                    <FiAlertTriangle className="text-red-500 h-8 w-8 mr-3 flex-shrink-0 mt-1"/>
                    <div>
                        <h3 className="text-xl font-semibold text-gray-800">{t('admin.confirmDeletion')}</h3>
                        <p className="text-sm text-gray-500">{t('admin.confirmDeleteItem', { type: itemType })}</p>
                    </div>
                </div>
                <p className="text-gray-700 bg-gray-100 p-2 rounded text-sm mb-6 truncate">"<strong>{itemName}</strong>"</p>
                {additionalInfo && 
                    <div className="bg-orange-50 p-3 rounded-md mb-6">
                        <p className="text-sm font-semibold text-orange-800">{t('common.warning')}</p>
                        <p className="text-sm text-orange-700 mt-1">{additionalInfo}</p>
                    </div>
                }
                <div className="flex justify-end space-x-3">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300" disabled={isLoading}>{t('common.cancel')}</button>
                    <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors flex items-center disabled:opacity-50" disabled={isLoading}>
                        {isLoading ? <FiLoader className="animate-spin mr-2"/> : <FiTrash2 className="mr-2"/>}
                        {t('common.delete')}
                    </button>
                </div>
            </div>
        </div>,
        document.getElementById('modal-root')!
    );
};

export default DeleteConfirmModal;

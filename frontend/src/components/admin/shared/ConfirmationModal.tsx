import React from 'react';
import { useTranslation } from 'react-i18next';
import ReactDOM from 'react-dom';
import { FiAlertTriangle, FiTrash2, FiLoader } from 'react-icons/fi';
import { ModalWrapper } from './ModalWrapper';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  dependencies?: { name: string; id: string }[];
  dependencyWarning?: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
  title,
  message,
  confirmText,
  dependencies,
  dependencyWarning,
}) => {
  const { t } = useTranslation();
  const resolvedConfirmText = confirmText ?? t('common.confirm');
  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <ModalWrapper title={title} onClose={onClose} size="max-w-lg">
      <p className="text-gray-600 mb-4">{message}</p>

      {dependencies && dependencies.length > 0 && (
        <div className="mt-4 bg-orange-50 p-4 rounded-md border border-orange-200">
          <div className="flex items-start">
            <FiAlertTriangle className="h-5 w-5 text-orange-500 mr-3 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-orange-800">{dependencyWarning || t('admin.itemInUse', { count: dependencies.length })}</h4>
              <ul className="list-disc pl-5 mt-2 text-sm text-orange-700 space-y-1 max-h-24 overflow-y-auto">
                {dependencies.map(dep => <li key={dep.id}><strong>{dep.name}</strong></li>)}
              </ul>
              <p className="text-sm text-orange-800 mt-3">
                {t('admin.archivingWontRemove')}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end space-x-3 mt-6">
        <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300" disabled={isLoading}>
          {t('common.cancel')}
        </button>
        <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center disabled:opacity-50" disabled={isLoading}>
          {isLoading ? <FiLoader className="animate-spin mr-2" /> : <FiTrash2 className="mr-2" />}
          {isLoading ? t('admin.archiving') : resolvedConfirmText}
        </button>
      </div>
    </ModalWrapper>,
    document.getElementById('modal-root')!
  );
};

export default ConfirmationModal;

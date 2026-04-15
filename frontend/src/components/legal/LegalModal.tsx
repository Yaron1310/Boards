
import React from 'react';
import { useTranslation } from 'react-i18next';
import ReactDOM from 'react-dom';
import { FiXCircle } from 'react-icons/fi';
import LegalContent from './LegalContent';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const LegalModal: React.FC<LegalModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-[9999]">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center bg-gray-50 flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-800">{t('layout.termsPrivacy')}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-200 text-gray-600 transition-colors"
            aria-label={t('common.close')}
          >
            <FiXCircle size={24} />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="p-6 sm:p-8 overflow-y-auto custom-scrollbar flex-grow">
          <LegalContent />
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex justify-end flex-shrink-0">
            <button 
                onClick={onClose}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium shadow-sm"
            >
                {t('common.close')}
            </button>
        </div>
      </div>
    </div>,
    document.getElementById('modal-root')!
  );
};

export default LegalModal;

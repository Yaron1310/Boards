import React from 'react';
import { SpinnerIcon } from './icons';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    isConfirming?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    isConfirming = false
}) => {
    if (!isOpen) {
        return null;
    }

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60" 
            aria-modal="true" 
            role="dialog"
            onClick={onClose}
        >
            <div 
                className="bg-gray-medium rounded-lg shadow-xl p-6 m-4 max-w-sm w-full border border-gray-600"
                onClick={e => e.stopPropagation()} // Prevent click inside modal from closing it
            >
                <h3 className="text-lg font-bold text-white">{title}</h3>
                <p className="mt-2 text-sm text-gray-light">{message}</p>
                <div className="mt-6 flex justify-end space-x-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isConfirming}
                        className="px-4 py-2 text-sm font-medium text-gray-extralight bg-gray-dark border border-gray-600 rounded-md hover:bg-gray-medium/70 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-medium focus:ring-gray-500 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isConfirming}
                        className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-medium focus:ring-red-500 disabled:opacity-50 disabled:cursor-wait"
                    >
                        {isConfirming && <SpinnerIcon className="w-4 h-4 mr-2" />}
                        {isConfirming ? 'Deleting...' : 'Delete'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;

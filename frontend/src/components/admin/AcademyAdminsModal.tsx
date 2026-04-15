import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ReactDOM from 'react-dom';
import { useAuth } from '../../hooks/useAuth';
import { useData } from '../../hooks/useData';
import type { User } from '../../types';
import { FiUserPlus, FiTrash2, FiAlertTriangle, FiXCircle, FiCheckCircle, FiLoader, FiShield } from 'react-icons/fi';

interface AcademyAdminsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onActionSuccess: (message: string) => void;
}

const AcademyAdminsModal: React.FC<AcademyAdminsModalProps> = ({ isOpen, onClose, onActionSuccess }) => {
    const { t } = useTranslation();
    const { user: authUser, selectedOrganization } = useAuth();
    const { users, addAcademyAdmin, removeAcademyAdmin, dataError, clearDataError } = useData();

    const [adminEmail, setAdminEmail] = useState('');
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [adminToRemove, setAdminToRemove] = useState<User | null>(null);
    
    const academyId = useMemo(() => selectedOrganization?.academyId, [selectedOrganization]);

    const currentAdmins = useMemo(() => {
        if (!academyId) return [];
        return users.filter(u => u.dbRoles?.academyAdmin?.includes(academyId));
    }, [users, academyId]);
    
    useEffect(() => {
        if (dataError) {
            setFeedback({ type: 'error', text: dataError });
            clearDataError();
        }
    }, [dataError, clearDataError]);

    useEffect(() => {
        // Clear state when modal is opened
        if (isOpen) {
            setFeedback(null);
            setAdminEmail('');
            setAdminToRemove(null);
            setIsProcessing(false);
        }
    }, [isOpen]);

    useEffect(() => {
        if (feedback) {
            const timer = setTimeout(() => {
                setFeedback(null);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [feedback]);

    if (!isOpen || !academyId) return null;

    const handleAddAdmin = async () => {
        if (!adminEmail.trim()) {
            setFeedback({ type: 'error', text: 'Please enter a valid email address.' });
            return;
        }
        setFeedback(null);
        setIsProcessing(true);
        const result = await addAcademyAdmin(academyId, adminEmail);
        setIsProcessing(true); // Keep processing true for a moment to avoid flickers
        if (result) {
            setFeedback({ type: 'success', text: result.message });
            onActionSuccess(result.message);
            setAdminEmail(''); // Clear input on success
        }
        setIsProcessing(false);
    };
    
    const handleConfirmRemove = async () => {
        if (!adminToRemove) return;
        setFeedback(null);
        setIsProcessing(true);
        const result = await removeAcademyAdmin(academyId, adminToRemove.id);
        setIsProcessing(true); // Keep processing true for a moment
        if(result) {
            setFeedback({ type: 'success', text: result.message });
            onActionSuccess(result.message);
        }
        setAdminToRemove(null);
        setIsProcessing(false);
    };

    return ReactDOM.createPortal(
        <>
            <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
                <div className="bg-white p-6 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-semibold text-gray-800 flex items-center">
                            <FiShield className="mr-2 text-purple-600"/>
                            {t('admin.manageAcademyAdmins')}
                        </h3>
                        <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200" disabled={isProcessing}>
                            <FiXCircle size={24}/>
                        </button>
                    </div>
                    
                    {feedback && (
                        <div id={feedback.type === 'error' ? 'admin-feedback-error' : undefined} role={feedback.type === 'error' ? 'alert' : 'status'} className={`p-3 my-2 rounded-md flex items-center text-sm ${feedback.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {feedback.type === 'success' ? <FiCheckCircle className="mr-2"/> : <FiAlertTriangle className="mr-2"/>}
                            {feedback.text}
                        </div>
                    )}
                    
                    <div className="flex-grow overflow-y-auto custom-scrollbar pr-2 space-y-6">
                        <div>
                            <h4 className="text-md font-semibold text-gray-700 mb-2">{t('admin.currentAdmins')}</h4>
                            {currentAdmins.length > 0 ? (
                                <ul className="space-y-2">
                                    {currentAdmins.map(admin => (
                                        <li key={admin.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                                            <div className="flex items-center">
                                                <img src={admin.profileImageUrl || '/default_user.webp'} alt={admin.name} className="h-8 w-8 rounded-full mr-3 object-cover"/>
                                                <div>
                                                    <p className="text-sm font-medium text-gray-800">{admin.name}</p>
                                                    <p className="text-xs text-gray-500">{admin.email}</p>
                                                </div>
                                            </div>
                                            <button onClick={() => setAdminToRemove(admin)} disabled={admin.id === authUser?.id} className="p-1.5 text-red-600 hover:text-red-800 rounded-full hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title={admin.id === authUser?.id ? "You cannot remove yourself" : "Remove Admin Privileges"}><FiTrash2 size={16}/></button>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-gray-500 italic">{t('admin.onlyAdmin')}</p>
                            )}
                        </div>
                        <form onSubmit={(e) => { e.preventDefault(); handleAddAdmin(); }} className="pt-6 border-t">
                            <h4 className="text-md font-semibold text-gray-700 mb-2">{t('admin.addNewAdmin')}</h4>
                            <p className="text-sm text-gray-600 mb-4">{t('admin.addAdminDesc')}</p>
                            <p className="text-xs text-gray-500 mb-3">{t('checkout.requiredFieldsNote')}</p>
                            <div>
                                <label htmlFor="adminEmail" className="block text-sm font-medium text-gray-700">{t('admin.adminEmail')} <span aria-hidden="true">*</span></label>
                                <input id="adminEmail" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" required aria-required="true" aria-describedby={feedback?.type === 'error' ? 'admin-feedback-error' : undefined} />
                            </div>
                            <div className="flex justify-end mt-4">
                                <button type="submit" className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 flex items-center disabled:opacity-50" disabled={isProcessing || !adminEmail.trim()}>
                                    {isProcessing ? <FiLoader className="animate-spin mr-2"/> : <FiUserPlus className="mr-2"/>}
                                    {isProcessing ? t('common.adding') : t('admin.addAdmin')}
                                </button>
                            </div>
                        </form>
                    </div>
                    <div className="flex justify-end space-x-3 mt-4 flex-shrink-0 pt-4 border-t">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300" disabled={isProcessing}>{t('common.close')}</button>
                    </div>
                </div>
            </div>

            {adminToRemove && (
                 <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
                    <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
                        <div className="flex items-start mb-4"><FiAlertTriangle className="text-red-500 h-8 w-8 mr-3 mt-1"/><h3 className="text-xl font-semibold">{t('admin.confirmAdminRemoval')}</h3></div>
                        <p className="text-gray-600 mb-6">{t('admin.confirmRemoveAdmin', { name: adminToRemove.name })}</p>
                        <div className="flex justify-end space-x-3">
                            <button onClick={() => setAdminToRemove(null)} className="px-4 py-2 bg-gray-200 rounded-md" disabled={isProcessing}>{t('common.cancel')}</button>
                            <button onClick={handleConfirmRemove} className="px-4 py-2 bg-red-600 text-white rounded-md flex items-center disabled:opacity-50" disabled={isProcessing}>{isProcessing ? <FiLoader className="animate-spin mr-2"/> : <FiTrash2 className="mr-2"/>}{isProcessing ? t('common.removing') : t('admin.confirmRemove')}</button>
                        </div>
                    </div>
                </div>
            )}
        </>,
        document.getElementById('modal-root')!
    );
};

export default AcademyAdminsModal;
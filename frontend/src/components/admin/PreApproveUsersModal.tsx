
import React, { useState, useMemo, ChangeEvent, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ReactDOM from 'react-dom';
import { useData } from '../../hooks/useData';
import type { Workspace, PreApprovedUser } from '../../types'; 
import { FiUserPlus, FiUploadCloud, FiFile, FiClock, FiTrash2, FiAlertTriangle, FiXCircle, FiCheckCircle as FiSuccessCircle, FiAlertCircle as FiErrorCircle, FiLoader } from 'react-icons/fi';
import readXlsxFile from 'read-excel-file';

interface PreApproveUsersModalProps {
    isOpen: boolean;
    onClose: () => void;
    organization: Workspace | null;
    maxUsers: number | null;
    currentRegularUsersCount: number;
    pendingInvitesCount: number;
}

const PreApproveUsersModal: React.FC<PreApproveUsersModalProps> = ({ isOpen, onClose, organization, maxUsers, currentRegularUsersCount, pendingInvitesCount }) => {
    const { t } = useTranslation();
    const {
        preApproveUsersInBulk,
        preApprovedUsers,
        revokePreApprovedUser,
        dataError,
        clearDataError,
        isLoading,
    } = useData(); 

    const [feedback, setFeedback] = useState<{type: 'success' | 'error', text: string} | null>(null);
    useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => {
        setFeedback(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [manualEmail, setManualEmail] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [userToRevoke, setUserToRevoke] = useState<PreApprovedUser | null>(null);
    const [isRevoking, setIsRevoking] = useState(false);
    
    const availableSlots = useMemo(() => {
        if (maxUsers === null) return Infinity;
        return Math.max(0, maxUsers - (currentRegularUsersCount + pendingInvitesCount));
    }, [maxUsers, currentRegularUsersCount, pendingInvitesCount]);


    useEffect(() => {
        if (isOpen && organization) {
            console.log('%c[DEBUG] PreApproveUsersModal rendering', 'color: purple; font-weight: bold;', { isOpen, organization });
            console.log('%c[DEBUG] PreApproveUsersModal: Full preApprovedUsers list from context:', 'color: purple;', preApprovedUsers);
        }
    }, [isOpen, organization, preApprovedUsers]);

    useEffect(() => {
        // Clear state when modal is opened or closed
        setFeedback(null);
        clearDataError();
        setUploadFile(null);
        setManualEmail('');
        setIsUploading(false);
        setUserToRevoke(null);
        setIsRevoking(false);
    }, [isOpen, clearDataError]);

    const orgPreApprovedUsers = useMemo(() => {
        if (!organization) return [];
        const filtered = preApprovedUsers.filter(paUser => paUser.organizationId === organization.id);
        console.log('%c[DEBUG] PreApproveUsersModal: Filtered list for this org:', 'color: purple;', { orgId: organization.id, count: filtered.length, data: filtered });
        return filtered;
    }, [preApprovedUsers, organization]);

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        setFeedback(null);
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.name.endsWith('.xlsx')) {
                setUploadFile(file);
            } else {
                setFeedback({ type: 'error', text: 'Invalid file type. Please upload a .xlsx file.' });
                setUploadFile(null);
            }
        }
    };

    const handleManualAdd = async () => {
        if (availableSlots <= 0 && maxUsers !== null) {
            setFeedback({ type: 'error', text: 'No available slots to invite new users.' });
            return;
        }

        if (!manualEmail.trim() || !manualEmail.includes('@')) {
            setFeedback({ type: 'error', text: 'Please enter a valid email address.' });
            return;
        }
        if (!organization?.id) return;
        
        setIsUploading(true);
        setFeedback(null);

        try {
            const result = await preApproveUsersInBulk([manualEmail.trim()], organization.id);
            if (result) {
                setFeedback({ type: 'success', text: result.message });
                setManualEmail('');
            } else {
                throw new Error(dataError || "An unknown error occurred.");
            }
        } catch (err: any) {
            setFeedback({ type: 'error', text: err.message || 'Failed to pre-approve email.' });
        } finally {
            setIsUploading(false);
        }
    };

    const handleBulkUpload = async () => {
        if (!uploadFile) {
            setFeedback({ type: 'error', text: 'Please select a file to upload.' });
            return;
        }
        if (!organization?.id) return;

        setIsUploading(true);
        setFeedback(null);

        try {
            const rows = await readXlsxFile(uploadFile);
            
            const emails = rows.map(row => row[0]).filter(cell => typeof cell === 'string' && cell.includes('@')).map(email => (email as string).trim());

            if (emails.length === 0) throw new Error("No valid emails found in the first column of the Excel sheet.");

            if (emails.length > availableSlots && maxUsers !== null) {
                throw new Error(`Your plan has ${availableSlots} available slot(s), but you are trying to invite ${emails.length} users.`);
            }

            const result = await preApproveUsersInBulk(emails, organization.id);
            if (result) {
                setFeedback({ type: 'success', text: result.message });
                setUploadFile(null);
            } else {
                throw new Error(dataError || "An unknown error occurred during upload.");
            }
        } catch (err: any) {
            setFeedback({ type: 'error', text: err.message || 'Failed to process or upload the file.' });
        } finally {
            setIsUploading(false);
        }
    };

    const handleRevokeClick = (user: PreApprovedUser) => {
        setFeedback(null);
        setUserToRevoke(user);
    };

    const handleConfirmRevoke = async () => {
        if (!userToRevoke) return;
        setIsRevoking(true);
        const success = await revokePreApprovedUser(userToRevoke.id);
        setIsRevoking(false);
        if (success) {
            setFeedback({ type: 'success', text: `Pre-approval for ${userToRevoke.email} has been revoked.` });
        } else {
            setFeedback({ type: 'error', text: dataError || `Failed to revoke pre-approval for ${userToRevoke.email}.` });
        }
        setUserToRevoke(null);
    };

    if (!isOpen || !organization) return null;

    return ReactDOM.createPortal(
        <>
            <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                    <div className="p-6 border-b flex justify-between items-center">
                        <h2 className="text-xl font-bold text-gray-800">{t('admin.preApproveUsersFor', { name: organization.name })}</h2>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><FiXCircle size={24}/></button>
                    </div>
                    <div className="p-6 flex-grow overflow-y-auto custom-scrollbar space-y-6">
                        {feedback && (
                            <div id={feedback.type === 'error' ? 'preapprove-feedback-error' : undefined} role={feedback.type === 'error' ? 'alert' : 'status'} className={`p-3 mb-4 rounded-md flex items-center text-sm ${feedback.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {feedback.type === 'success' ? <FiSuccessCircle className="mr-2"/> : <FiErrorCircle className="mr-2"/>}
                                {feedback.text}
                                <button onClick={() => setFeedback(null)} className="ml-auto text-lg font-semibold">&times;</button>
                            </div>
                        )}
                        <div className="p-4 mb-4 rounded-md bg-blue-50 border border-blue-200 text-sm space-y-2">
                             <h4 className="font-semibold text-blue-800">{t('admin.planUsage')}</h4>
                            {maxUsers === null ? (
                                <p className="text-blue-700">{t('admin.unlimitedUserSlots')}</p>
                            ) : (
                                <>
                                    <div className="flex justify-between items-center">
                                        <span>{t('admin.planLimit')}:</span>
                                        <span className="font-bold">{maxUsers} {t('admin.users')}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-gray-600">
                                        <span>- {t('admin.currentActiveUsers')}:</span>
                                        <span>{currentRegularUsersCount}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-gray-600">
                                        <span>- {t('admin.pendingInvitations')}:</span>
                                        <span>{pendingInvitesCount}</span>
                                    </div>
                                    <div className="flex justify-between items-center border-t border-blue-200 mt-2 pt-2">
                                        <span className="font-semibold text-blue-800">{t('admin.availableSlots')}:</span>
                                        <span className="font-bold text-blue-800">{availableSlots}</span>
                                    </div>
                                </>
                            )}
                        </div>

                        <div>
                            <p className="text-sm text-gray-600 mb-3">{t('admin.preApproveDesc')}</p>
                            
                            <div className="flex flex-col sm:flex-row gap-3 mb-3">
                                <label htmlFor="bulk-upload-input" className="flex-grow cursor-pointer inline-flex items-center justify-center px-4 py-2 text-sm border border-gray-300 bg-gray-50 text-gray-700 rounded-md hover:bg-gray-100">
                                    <FiFile className="mr-2"/><span>{uploadFile ? uploadFile.name : t('admin.chooseXlsxFile')}</span>
                                </label>
                                <input type="file" id="bulk-upload-input" accept=".xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFileChange} className="hidden"/>
                                <button onClick={handleBulkUpload} disabled={!uploadFile || isUploading || isLoading || (maxUsers !== null && availableSlots <= 0)} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center">
                                    {isUploading ? <FiLoader className="animate-spin mr-2"/> : <FiUploadCloud className="mr-2"/>}{isUploading ? t('common.processing') : t('admin.uploadFile')}
                                </button>
                            </div>
                            
                            <div className="relative flex items-center my-4"><div className="flex-grow border-t border-gray-300"></div><span className="flex-shrink mx-4 text-gray-500 text-sm">OR</span><div className="flex-grow border-t border-gray-300"></div></div>

                            <label htmlFor="manual-email-input" className="block text-sm font-medium text-gray-700 mb-1">{t('admin.addSingleEmail')}</label>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <input type="email" id="manual-email-input" value={manualEmail} onChange={(e) => setManualEmail(e.target.value)} placeholder="user@example.com" aria-describedby={feedback?.type === 'error' ? 'preapprove-feedback-error' : undefined} className="flex-grow px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-200" disabled={maxUsers !== null && availableSlots <= 0}/>
                                <button onClick={handleManualAdd} disabled={!manualEmail.trim() || isUploading || isLoading || (maxUsers !== null && availableSlots <= 0)} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center">
                                    {isLoading || isUploading ? <FiLoader className="animate-spin mr-2"/> : <FiUserPlus className="mr-2"/>} {t('admin.addEmail')}
                                </button>
                            </div>

                            {orgPreApprovedUsers.length > 0 && (
                                <div className="mt-6 pt-6 border-t border-gray-200">
                                    <h4 className="font-semibold text-gray-700 mb-3">{t('admin.pendingPreApprovedUsers', { count: orgPreApprovedUsers.length })}</h4>
                                    <div className="max-h-48 overflow-y-auto custom-scrollbar pr-2">
                                        <ul className="space-y-2">
                                            {orgPreApprovedUsers.map(paUser => (
                                                <li key={paUser.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                                                    <div className="text-sm text-gray-800"><p>{paUser.email}</p><p className="text-xs text-gray-500 flex items-center mt-1"><FiClock size={12} className="mr-1"/> {t('admin.addedOn')} {new Date(paUser.createdAt).toLocaleDateString()}</p></div>
                                                    <button onClick={() => handleRevokeClick(paUser)} disabled={isRevoking || isLoading} className="p-1.5 text-red-600 hover:text-red-800 rounded-full hover:bg-red-100 transition-colors" title="Revoke Pre-approval"><FiTrash2 size={16} /></button>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {userToRevoke && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full">
                        <div className="flex items-center mb-4"><FiAlertTriangle className="text-red-500 h-8 w-8 mr-3"/><h3 className="text-xl font-semibold text-gray-800">{t('admin.confirmRevoke')}</h3></div>
                        <p className="text-gray-600 mb-6">{t('admin.confirmRevokeDesc', { email: userToRevoke.email })}</p>
                        <div className="flex justify-end space-x-3">
                            <button onClick={() => setUserToRevoke(null)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300" disabled={isRevoking}>{t('common.cancel')}</button>
                            <button onClick={handleConfirmRevoke} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors flex items-center disabled:opacity-50" disabled={isRevoking}>{isRevoking && <FiLoader className="animate-spin mr-2" />}{isRevoking ? t('admin.revoking') : t('admin.revoke')}</button>
                        </div>
                    </div>
                </div>
            )}
        </>,
        document.getElementById('modal-root')!
    );
};

export default PreApproveUsersModal;

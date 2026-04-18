

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { useData } from '../../hooks/useData';
import type { Workspace, User, Workspace } from '../../types';
import { UserRole } from '../../types';
import * as apiService from '../../services/geminiService';
import { FiPlusCircle, FiEdit, FiTrash2, FiSave, FiXCircle, FiAlertTriangle, FiCheckCircle, FiAlertCircle as FiErrorCircle, FiLoader, FiShield, FiUserPlus, FiUsers, FiCpu } from 'react-icons/fi';

const TokenUsageBar: React.FC<{ used: number; limit: number | null }> = ({ used, limit }) => {
    const formatTokens = (tokens: number) => {
        if (tokens < 1000) {
            return tokens.toLocaleString();
        }
        return `${(tokens / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k`;
    };

    if (limit === null || limit === 0) {
        return <>{formatTokens(used)}</>;
    }

    const percentage = limit > 0 ? (used / limit) * 100 : 0;
    const isOverLimit = percentage > 100;

    return (
        <div className="w-full">
            <div className="flex justify-between text-xs mb-1">
                <span>{formatTokens(used)}</span>
                <span className="text-gray-500">/ {formatTokens(limit)}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                    className={`h-2 rounded-full ${isOverLimit ? 'bg-red-500' : 'bg-purple-500'}`}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                ></div>
            </div>
        </div>
    );
};

const OrganizationManagementPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { 
    workspaces,
    fetchAcademies,
    addOrganization, 
    updateOrganization, 
    deleteOrganization, 
    users,
    workspaces,
    removeOrganizationAdmin,
    organizationTokenUsage,
    isAnalyticsLoading,
    dataError, 
    clearDataError, 
  } = useData();
  
  const [isLoading, setIsLoading] = useState(false);

  const [newOrganizationName, setNewOrganizationName] = useState('');
  const [editingOrganization, setEditingOrganization] = useState<Workspace | null>(null);
  const [editOrganizationName, setEditOrganizationName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Workspace | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  useEffect(() => {
    if (feedbackMessage) {
      const timer = setTimeout(() => {
        setFeedbackMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [feedbackMessage]);
  const [showAdminModal, setShowAdminModal] = useState<Workspace | null>(null);
  const [adminEmail, setAdminEmail] = useState('');
  const [currentAdmins, setCurrentAdmins] = useState<User[]>([]);
  const [adminToRemove, setAdminToRemove] = useState<User | null>(null);


  useEffect(() => {
    if (user?.role === UserRole.SYSTEM_ADMIN) {
      fetchAcademies();
    }
  }, [user, fetchAcademies]);
  
  useEffect(() => {
    if (dataError) {
      setFeedbackMessage({ type: 'error', text: dataError });
    }
  }, [dataError]);

  useEffect(() => {
    if (showAdminModal) {
      const admins = users.filter(u => u.dbRoles?.organizationAdmin?.includes(showAdminModal.id));
      setCurrentAdmins(admins);
    } else {
      setCurrentAdmins([]);
    }
  }, [showAdminModal, users, workspaces]);

  const clearFeedback = () => {
    setFeedbackMessage(null);
    if (dataError) clearDataError();
  };

  const handleAddOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    setIsLoading(true);
    if (newOrganizationName.trim()) {
      const newOrganization = await addOrganization(newOrganizationName.trim());
      if (newOrganization) {
        setNewOrganizationName('');
        setFeedbackMessage({ type: 'success', text: t('admin.organizationManagement.organizationAddedSuccess', { name: newOrganization.name }) });
      } else if (!dataError) {
        setFeedbackMessage({ type: 'error', text: t('admin.organizationManagement.failedToAddOrganization') });
      }
    }
    setIsLoading(false);
  };

  const handleEditClick = (workspace: Workspace) => {
    clearFeedback();
    setEditingOrganization(workspace);
    setEditOrganizationName(workspace.name);
  };

  const handleSaveEdit = async () => {
    clearFeedback();
    if (editingOrganization && editOrganizationName.trim()) {
      setIsLoading(true);
      const success = await updateOrganization(editingOrganization.id, editOrganizationName.trim());
      if (success) {
        setFeedbackMessage({ type: 'success', text: t('admin.organizationManagement.organizationUpdatedSuccess', { name: editOrganizationName }) });
        setEditingOrganization(null);
        setEditOrganizationName('');
      } else if (!dataError) {
        setFeedbackMessage({ type: 'error', text: t('admin.organizationManagement.failedToUpdateOrganization') });
      }
      setIsLoading(false);
    }
  };
  
  const handleAddAdmin = async () => {
    if (!showAdminModal || !adminEmail.trim()) {
        setFeedbackMessage({ type: 'error', text: t('admin.organizationManagement.enterValidEmail') });
        return;
    }
    clearFeedback();
    setIsLoading(true);
    try {
        const result = await apiService.addOrganizationAdmin(showAdminModal.id, adminEmail);
        setFeedbackMessage({ type: 'success', text: result.message });
        setShowAdminModal(null);
        setAdminEmail('');
    } catch (err: any) {
        setFeedbackMessage({ type: 'error', text: err.message || t('admin.organizationManagement.failedToAddAdmin') });
    } finally {
        setIsLoading(false);
    }
  };

  const handleConfirmRemoveAdmin = async () => {
    if (!adminToRemove || !showAdminModal) return;
    clearFeedback();
    setIsLoading(true);
    try {
        const result = await removeOrganizationAdmin(showAdminModal.id, adminToRemove.id);
        if (result) {
            setFeedbackMessage({ type: 'success', text: result.message });
        }
        setAdminToRemove(null);
    } catch (err: any) {
        setFeedbackMessage({ type: 'error', text: err.message || t('admin.organizationManagement.failedToRemoveAdmin') });
    } finally {
        setIsLoading(false);
    }
  };


  const handleDeleteAttempt = async () => {
    if (!showDeleteConfirm) return;
    clearFeedback();
    setIsLoading(true);
    const success = await deleteOrganization(showDeleteConfirm.id);
    
    setShowDeleteConfirm(null); 

    if (success) {
      setFeedbackMessage({ type: 'success', text: t('admin.organizationManagement.organizationDeletedSuccess') });
    } else {
      if (!dataError) {
         setFeedbackMessage({ type: 'error', text: t('admin.organizationManagement.failedToDeleteOrganization') });
      }
    }
    setIsLoading(false);
  };


  if (user?.role !== UserRole.SYSTEM_ADMIN) {
    return <div className="p-6 text-red-600">{t('admin.organizationManagement.accessDenied')}</div>;
  }

  return (
    <div className="w-full h-full overflow-y-auto p-4 md:p-8 custom-scrollbar">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8 flex items-center"><FiShield className="mr-3 text-purple-600" /> {t('admin.organizationManagement.title')}</h1>

        {feedbackMessage && (
          <div className={`p-3 mb-4 rounded-md flex items-center text-sm ${feedbackMessage.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {feedbackMessage.type === 'success' ? <FiCheckCircle className="mr-2"/> : <FiErrorCircle className="mr-2"/>}
            {feedbackMessage.text}
            <button onClick={clearFeedback} className="ml-auto text-lg font-semibold" aria-label={t('admin.organizationManagement.dismissFeedback')}>&times;</button>
          </div>
        )}

        <form onSubmit={handleAddOrganization} className="mb-8 p-6 bg-white shadow-md rounded-lg">
          <h2 className="text-xl font-semibold text-gray-700 mb-4">{t('admin.organizationManagement.addNewOrganization')}</h2>
          <p className="text-xs text-gray-500 mb-3">{t('admin.organizationManagement.mandatoryFieldsNote')}</p>
          <div className="flex flex-col sm:flex-row items-end gap-4">
            <div className="flex-grow">
              <label htmlFor="newOrganizationName" className="block text-sm font-medium text-gray-700">{t('admin.organizationManagement.organizationNameLabel')}</label>
              <input
                id="newOrganizationName"
                type="text"
                value={newOrganizationName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewOrganizationName(e.target.value)}
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder={t('admin.organizationManagement.organizationNamePlaceholder')}
                required
                aria-required="true"
              />
            </div>
            <button
              type="submit"
              className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center transition-colors disabled:opacity-50"
              disabled={!newOrganizationName.trim() || isLoading}
            >
              <FiPlusCircle className="mr-2" /> {t('admin.organizationManagement.addOrganization')}
            </button>
          </div>
        </form>

        <div className="bg-white shadow-md rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-700">{t('admin.organizationManagement.existingAcademies', { count: workspaces.length })}</h2>
        </div>

        <div className="bg-white shadow-md rounded-lg overflow-x-auto custom-scrollbar">
          {workspaces.length === 0 && !isLoading ? (
            <p className="p-6 text-gray-500 text-center">{t('admin.organizationManagement.noAcademiesFound')}</p>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('admin.organizationManagement.colOrganizationName')}</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px]">{t('admin.organizationManagement.colTokensUsed')}</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('admin.organizationManagement.colId')}</th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('admin.organizationManagement.colActions')}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                  {workspaces.map(workspace => {
                    const usage = organizationTokenUsage?.[workspace.id];
                    return editingOrganization?.id === workspace.id ? (
                      <tr key={`${workspace.id}-edit`} className="bg-purple-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                              <input
                                type="text"
                                value={editOrganizationName}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditOrganizationName(e.target.value)}
                                className="flex-grow px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                                disabled={isLoading}
                              />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {isAnalyticsLoading ? <FiLoader className="animate-spin h-4 w-4 mx-auto"/> : 
                                usage ? <TokenUsageBar used={usage.used} limit={usage.limit} /> : '0'
                            }
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                            {workspace.id}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <div className="flex items-center justify-end space-x-1">
                                  <button onClick={handleSaveEdit} className="text-green-600 hover:text-green-800 p-2 rounded-full hover:bg-green-100" title={t('admin.organizationManagement.saveChanges')} aria-label={t('admin.organizationManagement.saveChanges')} disabled={isLoading}><FiSave size={18} /></button>
                                  <button onClick={() => setEditingOrganization(null)} className="text-gray-600 hover:text-gray-800 p-2 rounded-full hover:bg-gray-100" title={t('admin.organizationManagement.cancelEdit')} aria-label={t('admin.organizationManagement.cancelEdit')} disabled={isLoading}><FiXCircle size={18} /></button>
                              </div>
                          </td>
                      </tr>
                    ) : (
                      <tr key={workspace.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">{workspace.name}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {isAnalyticsLoading && !organizationTokenUsage ? <FiLoader className="animate-spin h-4 w-4"/> : 
                                usage ? <TokenUsageBar used={usage.used} limit={usage.limit} /> : '0'
                            }
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                            {workspace.id}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <div className="flex items-center justify-end space-x-1">
                                  <button onClick={() => { clearFeedback(); setShowAdminModal(workspace); }} className="text-green-600 hover:text-green-800 p-2 rounded-full hover:bg-green-100" title={t('admin.organizationManagement.manageAdmins')} aria-label={t('admin.organizationManagement.manageAdmins')} disabled={isLoading}>
                                      <FiUsers size={18} />
                                  </button>
                                  <button onClick={() => handleEditClick(workspace)} className="text-indigo-600 hover:text-indigo-800 p-2 rounded-full hover:bg-indigo-100" title={t('admin.organizationManagement.editOrganization')} aria-label={t('admin.organizationManagement.editOrganization')} disabled={isLoading}><FiEdit size={18} /></button>
                                  <button onClick={() => { clearFeedback(); setShowDeleteConfirm(workspace); }} className="text-red-600 hover:text-red-800 p-2 rounded-full hover:bg-red-100" title={t('admin.organizationManagement.deleteOrganization')} aria-label={t('admin.organizationManagement.deleteOrganization')} disabled={isLoading}><FiTrash2 size={18} /></button>
                              </div>
                          </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          )}
          {isLoading && workspaces.length === 0 && <div className="p-4 text-center"><FiLoader className="animate-spin h-6 w-6 text-purple-500 mx-auto"/></div>}
        </div>
      </div>
      
      {showAdminModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true" aria-label={t('admin.organizationManagement.manageAdminsForOrganization', { name: showAdminModal.name })}>
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
                <h3 className="text-xl font-semibold text-gray-800 mb-4 flex-shrink-0">{t('admin.organizationManagement.manageAdminsForOrganization', { name: showAdminModal.name })}</h3>

                <div className="flex-grow overflow-y-auto custom-scrollbar pr-2 space-y-6">
                    {/* Current Admins List */}
                    <div>
                        <h4 className="text-md font-semibold text-gray-700 mb-2">{t('admin.organizationManagement.currentAdmins')}</h4>
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
                                        <button onClick={() => setAdminToRemove(admin)} className="p-1.5 text-red-600 hover:text-red-800 rounded-full hover:bg-red-100 transition-colors" title={t('admin.organizationManagement.removeAdminPrivileges')} aria-label={t('admin.organizationManagement.removeAdminPrivileges')}><FiTrash2 size={16}/></button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-gray-500 italic">{t('admin.organizationManagement.noAdminsAssigned')}</p>
                        )}
                    </div>

                    {/* Add New Admin Form */}
                    <form onSubmit={(e) => { e.preventDefault(); handleAddAdmin(); }} className="pt-6 border-t">
                        <h4 className="text-md font-semibold text-gray-700 mb-2">{t('admin.organizationManagement.addNewAdmin')}</h4>
                        <p className="text-sm text-gray-600 mb-4">{t('admin.organizationManagement.addNewAdminDescription')}</p>
                        <p className="text-xs text-gray-500 mb-3">{t('admin.organizationManagement.mandatoryFieldsNote')}</p>
                        <div>
                            <label htmlFor="adminEmail" className="block text-sm font-medium text-gray-700">{t('admin.organizationManagement.adminEmailLabel')}</label>
                            <input
                                id="adminEmail"
                                type="email"
                                value={adminEmail}
                                onChange={(e) => setAdminEmail(e.target.value)}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500"
                                placeholder={t('admin.organizationManagement.adminEmailPlaceholder')}
                                required
                                aria-required="true"
                            />
                        </div>
                        <div className="flex justify-end mt-4">
                             <button type="submit" className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 flex items-center disabled:opacity-50" disabled={isLoading || !adminEmail.trim()}>
                                {isLoading ? <FiLoader className="animate-spin mr-2"/> : <FiUserPlus className="mr-2"/>}
                                {isLoading ? t('admin.organizationManagement.adding') : t('admin.organizationManagement.addAdmin')}
                            </button>
                        </div>
                    </form>
                </div>

                <div className="flex justify-end space-x-3 mt-4 flex-shrink-0 pt-4 border-t">
                    <button type="button" onClick={() => { setShowAdminModal(null); setAdminEmail(''); }} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300" disabled={isLoading}>{t('common.close')}</button>
                </div>
            </div>
        </div>
      )}

      {adminToRemove && showAdminModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true" aria-label={t('admin.organizationManagement.confirmAdminRemoval')}>
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
                <div className="flex items-start mb-4">
                    <FiAlertTriangle className="text-orange-500 h-8 w-8 mr-3 flex-shrink-0 mt-1"/>
                    <div>
                        <h3 className="text-xl font-semibold text-gray-800">{t('admin.organizationManagement.confirmAdminRemoval')}</h3>
                        <p className="text-sm text-gray-500">{t('admin.organizationManagement.confirmAdminRemovalMsg', { name: adminToRemove.name })}</p>
                    </div>
                </div>
                 <div className="bg-orange-50 p-3 rounded-md mb-6">
                    <p className="text-sm text-orange-800">
                       {t('admin.organizationManagement.adminRemovalWarning')}
                    </p>
                    <ul className="list-disc list-inside text-sm text-orange-800 mt-2 space-y-1">
                        <li>{t('admin.organizationManagement.adminRemovalDemoteNote')}</li>
                        <li>{t('admin.organizationManagement.adminRemovalDeleteNote')}</li>
                    </ul>
                </div>
                <div className="flex justify-end space-x-3">
                    <button onClick={() => setAdminToRemove(null)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md" disabled={isLoading}>{t('common.cancel')}</button>
                    <button onClick={handleConfirmRemoveAdmin} className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 flex items-center disabled:opacity-50" disabled={isLoading}>
                        {isLoading ? <FiLoader className="animate-spin mr-2"/> : <FiTrash2 className="mr-2"/>}
                        {isLoading ? t('admin.organizationManagement.removing') : t('admin.organizationManagement.confirmRemoval')}
                    </button>
                </div>
            </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true" aria-label={t('admin.organizationManagement.confirmDeletion')}>
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
            <div className="flex items-start mb-4">
                <FiAlertTriangle className="text-red-500 h-8 w-8 mr-3 flex-shrink-0 mt-1"/>
                <div>
                    <h3 className="text-xl font-semibold text-gray-800">{t('admin.organizationManagement.confirmDeletion')}</h3>
                    <p className="text-sm text-gray-500">{t('admin.organizationManagement.confirmDeleteMsg', { name: showDeleteConfirm.name })}</p>
                </div>
            </div>

            <div className="bg-red-50 p-3 rounded-md mb-6">
                <p className="text-sm text-red-700">
                   {t('admin.organizationManagement.deleteOrganizationWarning')}
                </p>
            </div>

            <div className="flex justify-end space-x-3">
              <button onClick={() => setShowDeleteConfirm(null)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors" disabled={isLoading}>{t('common.cancel')}</button>
              <button
                onClick={handleDeleteAttempt}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors flex items-center disabled:opacity-50"
                disabled={isLoading}>
                    {isLoading ? <FiLoader className="animate-spin mr-2"/> : <FiTrash2 className="mr-2"/>}
                    {isLoading ? t('admin.organizationManagement.deleting') : t('admin.organizationManagement.confirmDelete')}
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrganizationManagementPage;
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FiBriefcase, FiEdit, FiPlusCircle, FiArchive, FiSave, FiXCircle,
  FiLoader, FiUsers, FiUserPlus, FiAlertTriangle, FiCheckCircle,
  FiAlertCircle as FiErrorCircle,
} from 'react-icons/fi';
import { useAuth } from '../../hooks/useAuth';
import { useData } from '../../hooks/useData';
import { UserRole, Workspace, User } from '../../types';
import PreApproveUsersModal from '../admin/PreApproveUsersModal';
import ConfirmationModal from '../admin/shared/ConfirmationModal';
import ArchiveRestoreModal from '../admin/shared/ArchiveRestoreModal';

// --- MODAL COMPONENTS ---

const AddWorkspaceModal = ({
  isOpen, onClose, onSave, isSaving, name, setName, error,
}: any) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col">
        <div className="p-6 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-800">{t('admin.addNewWorkspace')}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" aria-label={t('common.close')}><FiXCircle size={24} /></button>
        </div>
        <div className="p-6">
          <form id="add-org-form" onSubmit={(e) => { e.preventDefault(); onSave(); }} className="space-y-4">
            {error && <div className="p-3 rounded-md text-sm bg-red-100 text-red-700"><FiErrorCircle className="inline mr-2" />{error}</div>}
            <p className="text-xs text-gray-500">{t('checkout.requiredFieldsNote')}</p>
            <div>
              <label htmlFor="modalNewOrgName" className="block text-sm font-medium text-gray-700">
                {t('admin.workspaceName')} <span aria-hidden="true">*</span>
              </label>
              <input
                type="text" id="modalNewOrgName" value={name} onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500"
                required aria-required="true" placeholder={t('admin.enterWorkspaceName')}
              />
            </div>
          </form>
        </div>
        <div className="flex justify-end space-x-3 p-6 border-t bg-gray-50 rounded-b-lg">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300" disabled={isSaving}>{t('common.cancel')}</button>
          <button type="submit" form="add-org-form" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center" disabled={isSaving || !name.trim()}>
            {isSaving ? <FiLoader className="animate-spin mr-2" /> : <FiPlusCircle className="mr-2" />} {t('admin.addWorkspace')}
          </button>
        </div>
      </div>
    </div>,
    document.getElementById('modal-root')!
  );
};

const WorkspaceModal = ({ org, editData, onClose, onSave, isSaving, error, setEditData, onManageAdmins, onPreApprove, onArchive }: any) => {
  const { t } = useTranslation();
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditData((prev: any) => ({ ...prev, [name]: value }));
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-800">{t('admin.editWorkspace', { name: org.name })}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" aria-label={t('common.close')}><FiXCircle size={24} /></button>
        </div>
        <div className="p-6 flex-grow overflow-y-auto custom-scrollbar">
          <form id="org-edit-form" onSubmit={(e) => { e.preventDefault(); onSave(); }} className="space-y-4">
            {error && <div className="p-3 rounded-md text-sm bg-red-100 text-red-700"><FiErrorCircle className="inline mr-2" />{error}</div>}
            <p className="text-xs text-gray-500">{t('checkout.requiredFieldsNote')}</p>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                {t('admin.workspaceName')} <span aria-hidden="true">*</span>
              </label>
              <input type="text" name="name" id="name" value={editData.name} onChange={handleInputChange} className="mt-1 w-full p-2 border border-gray-300 rounded-md" required aria-required="true" />
            </div>
          </form>
          <div className="pt-6 mt-6 border-t">
            <h3 className="text-md font-semibold text-gray-700">{t('admin.otherActions')}</h3>
            <div className="mt-3 flex flex-wrap gap-3">
              <button type="button" onClick={onPreApprove} className="text-sm text-cyan-600 hover:text-cyan-800 py-2 px-3 rounded-md hover:bg-cyan-50 flex items-center transition-colors border border-cyan-200"><FiUserPlus className="mr-2" /> {t('admin.preApproveUsers')}</button>
              <button type="button" onClick={onManageAdmins} className="text-sm text-green-600 hover:text-green-800 py-2 px-3 rounded-md hover:bg-green-50 flex items-center transition-colors border border-green-200"><FiUsers className="mr-2" /> {t('admin.manageAdmins')}</button>
              <button type="button" onClick={onArchive} className="text-sm text-red-600 hover:text-red-800 py-2 px-3 rounded-md hover:bg-red-50 flex items-center transition-colors border border-red-200"><FiArchive className="mr-2" /> {t('admin.archiveWorkspace')}</button>
            </div>
          </div>
        </div>
        <div className="flex justify-end space-x-3 p-6 border-t mt-auto flex-shrink-0 bg-gray-50 rounded-b-lg">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300" disabled={isSaving}>{t('common.cancel')}</button>
          <button type="submit" form="org-edit-form" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center" disabled={isSaving}>
            {isSaving ? <FiLoader className="animate-spin mr-2" /> : <FiSave className="mr-2" />} {t('common.saveChanges')}
          </button>
        </div>
      </div>
    </div>,
    document.getElementById('modal-root')!
  );
};

// --- MAIN COMPONENT ---

const WorkspaceHomePage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isOrgAdmin = user?.role === UserRole.ORGANIZATION_ADMIN;

  const {
    workspaces: allWorkspacesData,
    archivedWorkspaces,
    fetchWorkspaces,
    fetchArchivedWorkspaces,
    restoreWorkspace,
    users,
    addWorkspace,
    updateWorkspace,
    deleteWorkspace,
    confirmArchiveWorkspace,
    addWorkspaceManager,
    removeWorkspaceManager,
    dataError,
    clearDataError,
    isLoading: isDataLoading,
  } = useData();

  const workspaces = (allWorkspacesData || []).filter((w) => !w.isPersonal);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [orgToEdit, setOrgToEdit] = useState<Workspace | null>(null);
  const [editOrgData, setEditOrgData] = useState<{ name: string }>({ name: '' });
  const [archiveConfirmData, setArchiveConfirmData] = useState<{ resource: Workspace; dependencies?: any } | null>(null);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [preApproveModalOrg, setPreApproveModalOrg] = useState<Workspace | null>(null);
  const [showAdminModal, setShowAdminModal] = useState<Workspace | null>(null);
  const [adminEmail, setAdminEmail] = useState('');
  const [currentAdmins, setCurrentAdmins] = useState<User[]>([]);
  const [adminToRemove, setAdminToRemove] = useState<User | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  useEffect(() => {
    if (modalError) {
      const timer = setTimeout(() => setModalError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [modalError]);

  useEffect(() => {
    if (feedbackMessage) {
      const timer = setTimeout(() => setFeedbackMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [feedbackMessage]);

  useEffect(() => {
    if (dataError) setFeedbackMessage({ type: 'error', text: dataError });
  }, [dataError]);

  useEffect(() => {
    if (showAdminModal) {
      const admins = (users || []).filter((u) => u.dbRoles?.workspaceAdmin?.includes(showAdminModal.id));
      setCurrentAdmins(admins);
    } else {
      setCurrentAdmins([]);
    }
  }, [showAdminModal, users]);

  const clearFeedback = () => {
    setFeedbackMessage(null);
    setModalError(null);
    if (dataError) clearDataError();
  };

  const handleAddWorkspace = async () => {
    clearFeedback();
    if (!newOrgName.trim()) { setModalError('WorkHub Name is required.'); return; }
    setIsSaving(true);
    const newOrg = await addWorkspace(newOrgName.trim(), user!.orgId);
    setIsSaving(false);
    if (newOrg) {
      setNewOrgName('');
      setIsAddModalOpen(false);
      setFeedbackMessage({ type: 'success', text: `Workspace "${newOrg.name}" added successfully.` });
    } else if (!dataError) {
      setModalError('Failed to add workspace.');
    }
  };

  const handleOpenEditModal = (ws: Workspace) => {
    clearFeedback();
    setEditOrgData({ name: ws.name });
    setOrgToEdit(ws);
  };

  const handleSaveEdit = async () => {
    clearFeedback();
    if (orgToEdit && editOrgData.name.trim()) {
      setIsSaving(true);
      const success = await updateWorkspace(orgToEdit.id, { name: editOrgData.name.trim(), isPersonal: orgToEdit.isPersonal });
      setIsSaving(false);
      if (success) {
        setFeedbackMessage({ type: 'success', text: `Workspace "${editOrgData.name}" updated.` });
        setOrgToEdit(null);
      } else if (!dataError) {
        setModalError('Failed to update workspace.');
      }
    }
  };

  const handleAttemptArchive = (ws: Workspace) => {
    clearFeedback();
    setArchiveConfirmData({ resource: ws });
  };

  const handleConfirmArchive = async () => {
    if (!archiveConfirmData) return;
    clearFeedback();
    setIsSaving(true);
    const result = await deleteWorkspace(archiveConfirmData.resource.id);
    setIsSaving(false);
    if (result.isConflict) {
      setArchiveConfirmData({ resource: archiveConfirmData.resource, dependencies: result.dependencies?.users || [] });
      return;
    }
    setArchiveConfirmData(null);
  };

  const handleConfirmArchiveWithDeps = async () => {
    if (!archiveConfirmData) return;
    clearFeedback();
    setIsSaving(true);
    await confirmArchiveWorkspace(archiveConfirmData.resource.id);
    setIsSaving(false);
    setArchiveConfirmData(null);
  };

  const handleAddOrgManager = async () => {
    if (!showAdminModal || !adminEmail.trim()) {
      setFeedbackMessage({ type: 'error', text: 'Please enter a valid email address.' });
      return;
    }
    clearFeedback();
    setIsSaving(true);
    const result = await addWorkspaceManager(showAdminModal.id, adminEmail);
    setIsSaving(false);
    if (result) {
      setFeedbackMessage({ type: 'success', text: result.message });
      setShowAdminModal(null);
      setAdminEmail('');
    } else if (!dataError) {
      setFeedbackMessage({ type: 'error', text: 'Failed to add manager.' });
    }
  };

  const handleConfirmRemoveManager = async () => {
    if (!adminToRemove || !showAdminModal) return;
    clearFeedback();
    setIsSaving(true);
    const result = await removeWorkspaceManager(showAdminModal.id, adminToRemove.id);
    setIsSaving(false);
    if (result) {
      setFeedbackMessage({ type: 'success', text: result.message });
    } else if (!dataError) {
      setFeedbackMessage({ type: 'error', text: 'Failed to remove manager.' });
    }
    setAdminToRemove(null);
  };

  if (isDataLoading && workspaces.length === 0) {
    return (
      <div className="flex justify-center items-center h-64" role="status" aria-label={t('common.loading')}>
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">{t('layout.workspaces')}</h1>
        {isOrgAdmin && (
          <div className="flex gap-2">
            <button
              onClick={() => setIsArchiveModalOpen(true)}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-md shadow-sm flex items-center text-sm transition-colors"
              aria-label={t('common.viewArchived')}
            >
              <FiArchive className="mr-2" aria-hidden="true" /> {t('common.viewArchived')}
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm flex items-center text-sm transition-colors"
              aria-label={t('admin.addWorkspace')}
            >
              <FiPlusCircle className="mr-2" aria-hidden="true" /> {t('admin.addWorkspace')}
            </button>
          </div>
        )}
      </div>

      {feedbackMessage && (
        <div className={`p-3 mb-4 rounded-md flex items-center text-sm ${feedbackMessage.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`} role="alert">
          {feedbackMessage.type === 'success' ? <FiCheckCircle className="mr-2" aria-hidden="true" /> : <FiErrorCircle className="mr-2" aria-hidden="true" />}
          {feedbackMessage.text}
          <button onClick={clearFeedback} className="ml-auto text-lg font-semibold" aria-label="Dismiss">&times;</button>
        </div>
      )}

      {workspaces.length === 0 ? (
        <p className="text-gray-500">
          {isOrgAdmin ? 'No WorkHubs yet. Add one using the button above.' : 'No WorkHubs found.'}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="list" aria-label="WorkHubs">
          {workspaces.map((ws) => (
            <div key={ws.id} className="relative group" role="listitem">
              <Link
                to={`/WorkHubs/${ws.id}/boards`}
                aria-label={`Open WorkHub ${ws.name}`}
                className="flex items-center gap-4 p-5 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md hover:border-indigo-300 transition-all"
              >
                <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <FiBriefcase className="text-indigo-600" size={20} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-800 truncate">{ws.name}</p>
                  {ws.organizationName && (
                    <p className="text-xs text-gray-500 truncate">{ws.organizationName}</p>
                  )}
                </div>
              </Link>
              {isOrgAdmin && (
                <button
                  onClick={(e) => { e.preventDefault(); handleOpenEditModal(ws); }}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-white shadow-sm border border-gray-200 text-gray-500 hover:text-indigo-600 hover:border-indigo-300 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  aria-label={`Edit WorkHub ${ws.name}`}
                >
                  <FiEdit size={14} aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {isOrgAdmin && (
        <>
          <AddWorkspaceModal
            isOpen={isAddModalOpen}
            onClose={() => { setIsAddModalOpen(false); setModalError(null); }}
            onSave={handleAddWorkspace}
            isSaving={isSaving}
            name={newOrgName}
            setName={setNewOrgName}
            error={modalError}
          />

          {orgToEdit && (
            <WorkspaceModal
              org={orgToEdit}
              editData={editOrgData}
              onClose={() => setOrgToEdit(null)}
              onSave={handleSaveEdit}
              isSaving={isSaving}
              error={modalError}
              setEditData={setEditOrgData}
              onManageAdmins={() => { setOrgToEdit(null); clearFeedback(); setShowAdminModal(orgToEdit); }}
              onPreApprove={() => { setOrgToEdit(null); setPreApproveModalOrg(orgToEdit); }}
              onArchive={() => { setOrgToEdit(null); handleAttemptArchive(orgToEdit!); }}
            />
          )}

          <PreApproveUsersModal
            isOpen={!!preApproveModalOrg}
            onClose={() => setPreApproveModalOrg(null)}
            workspace={preApproveModalOrg}
          />

          {showAdminModal && ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
              <div className="bg-white p-6 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
                <h3 className="text-xl font-semibold text-gray-800 mb-4 flex-shrink-0">{t('admin.manageAdminsFor', { name: showAdminModal.name })}</h3>
                <div className="flex-grow overflow-y-auto custom-scrollbar pr-2 space-y-6">
                  <div>
                    <h4 className="text-md font-semibold text-gray-700 mb-2">{t('admin.currentAdmins')}</h4>
                    {currentAdmins.length > 0 ? (
                      <ul className="space-y-2" role="list" aria-label="Current admins">
                        {currentAdmins.map((admin) => (
                          <li key={admin.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                            <div className="flex items-center">
                              <img src={admin.profileImageUrl || '/default_user.webp'} alt={admin.name} className="h-8 w-8 rounded-full mr-3 object-cover" />
                              <div>
                                <p className="text-sm font-medium text-gray-800">{admin.name}</p>
                                <p className="text-xs text-gray-500">{admin.email}</p>
                              </div>
                            </div>
                            <button onClick={() => setAdminToRemove(admin)} className="p-1.5 text-red-600 hover:text-red-800 rounded-full hover:bg-red-100 transition-colors" aria-label={`Remove ${admin.name} as admin`}><FiArchive size={16} aria-hidden="true" /></button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-500 italic">{t('admin.noManagersAssigned')}</p>
                    )}
                  </div>
                  <form onSubmit={(e) => { e.preventDefault(); handleAddOrgManager(); }} className="pt-6 border-t">
                    <h4 className="text-md font-semibold text-gray-700 mb-2">{t('admin.addNewManager')}</h4>
                    <p className="text-sm text-gray-600 mb-4">{t('admin.addManagerDesc')}</p>
                    <p className="text-xs text-gray-500 mb-3">{t('checkout.requiredFieldsNote')}</p>
                    <div>
                      <label htmlFor="adminEmail" className="block text-sm font-medium text-gray-700">{t('admin.managerEmail')} <span aria-hidden="true">*</span></label>
                      <input id="adminEmail" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" required aria-required="true" />
                    </div>
                    <div className="flex justify-end mt-4">
                      <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center disabled:opacity-50" disabled={isSaving || !adminEmail.trim()}>
                        {isSaving ? <FiLoader className="animate-spin mr-2" aria-hidden="true" /> : <FiUserPlus className="mr-2" aria-hidden="true" />}
                        {isSaving ? t('common.adding') : t('admin.addManager')}
                      </button>
                    </div>
                  </form>
                </div>
                <div className="flex justify-end space-x-3 mt-4 flex-shrink-0 pt-4 border-t">
                  <button type="button" onClick={() => { setShowAdminModal(null); setAdminEmail(''); }} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300" disabled={isSaving}>{t('common.close')}</button>
                </div>
              </div>
            </div>,
            document.getElementById('modal-root')!
          )}

          {adminToRemove && ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
              <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
                <div className="flex items-start mb-4">
                  <FiAlertTriangle className="text-red-500 h-8 w-8 mr-3 mt-1" aria-hidden="true" />
                  <h3 className="text-xl font-semibold">{t('admin.confirmManagerRemoval')}</h3>
                </div>
                <p className="text-gray-600 mb-6">{t('admin.confirmRemoveManager', { name: adminToRemove.name })}</p>
                <div className="flex justify-end space-x-3">
                  <button onClick={() => setAdminToRemove(null)} className="px-4 py-2 bg-gray-200 rounded-md" disabled={isSaving}>{t('common.cancel')}</button>
                  <button onClick={handleConfirmRemoveManager} className="px-4 py-2 bg-red-600 text-white rounded-md flex items-center disabled:opacity-50" disabled={isSaving}>
                    {isSaving ? <FiLoader className="animate-spin mr-2" aria-hidden="true" /> : <FiArchive className="mr-2" aria-hidden="true" />}
                    {isSaving ? t('common.removing') : t('admin.confirmRemove')}
                  </button>
                </div>
              </div>
            </div>,
            document.getElementById('modal-root')!
          )}

          <ConfirmationModal
            isOpen={!!archiveConfirmData}
            onClose={() => setArchiveConfirmData(null)}
            onConfirm={archiveConfirmData?.dependencies && archiveConfirmData.dependencies.length > 0
              ? handleConfirmArchiveWithDeps
              : handleConfirmArchive}
            isLoading={isSaving}
            title="Confirm WorkHub Archive"
            message={<>Are you sure you want to archive "<strong>{archiveConfirmData?.resource.name}</strong>"?</>}
            confirmText="Confirm Archive"
            dependencies={archiveConfirmData?.dependencies}
            dependencyWarning={archiveConfirmData?.dependencies && archiveConfirmData.dependencies.length > 0
              ? `This will unassign ${archiveConfirmData.dependencies.length} user(s). Their accounts will NOT be deleted.`
              : undefined}
          />

          <ArchiveRestoreModal
            isOpen={isArchiveModalOpen}
            onClose={() => setIsArchiveModalOpen(false)}
            title="Archived Workspaces"
            items={archivedWorkspaces}
            onRestore={restoreWorkspace}
            fetchItems={fetchArchivedWorkspaces}
          />
        </>
      )}
    </div>
  );
};

export default WorkspaceHomePage;

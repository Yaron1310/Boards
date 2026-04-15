import React, { useState, useEffect, useMemo, ChangeEvent } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useData } from '../../hooks/useData';
import type { Workspace, Course, User, Plan } from '../../types';
import { UserRole } from '../../types';
import { FiPlusCircle, FiEdit, FiArchive, FiSave, FiXCircle, FiAlertTriangle, FiCheckCircle, FiBriefcase, FiAlertCircle as FiErrorCircle, FiKey, FiCpu, FiLoader, FiUsers, FiUserPlus, FiList, FiInfo, FiCreditCard, FiShare } from 'react-icons/fi';
import PreApproveUsersModal from './PreApproveUsersModal';
import TutorialSection from '../common/TutorialSection';
import ConfirmationModal from './shared/ConfirmationModal';
import ArchiveRestoreModal from './shared/ArchiveRestoreModal';
const exportToCSV = (rows: Record<string, unknown>[], filename: string) => {
    if (!rows.length) return;
    const escape = (v: unknown) => {
        const s = String(v ?? '');
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = Object.keys(rows[0]);
    const csv = [headers.map(escape).join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
};

const TokenUsageBar: React.FC<{ used: number; limit: number | null }> = ({ used, limit }) => {
    const formatTokens = (tokens: number) => {
        return tokens.toLocaleString();
    };

    if (limit === null) {
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

type OrgWithComputedData = Workspace & {
    userCount: number;
    tokensUsed: number;
    tokenLimit: number | null;
};

// --- MODAL COMPONENT ---
const AddOrganizationModal = ({
    isOpen,
    onClose,
    onSave,
    isSaving,
    plans,
    name,
    setName,
    planId,
    setPlanId,
    error
}: any) => {
    const { t } = useTranslation();
    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col">
                <div className="p-6 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-800">{t('admin.addNewOrganization')}</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><FiXCircle size={24}/></button>
                </div>
                <div className="p-6 overflow-y-auto">
                    <form id="add-org-form" onSubmit={(e) => { e.preventDefault(); onSave(); }} className="space-y-4">
                        {error && <div className="p-3 rounded-md text-sm bg-red-100 text-red-700"><FiErrorCircle className="inline mr-2"/>{error}</div>}
                        <p className="text-xs text-gray-500">{t('checkout.requiredFieldsNote')}</p>
                        <div>
                            <label htmlFor="modalNewOrgName" className="block text-sm font-medium text-gray-700">{t('admin.organizationName')} <span aria-hidden="true">*</span></label>
                            <input
                                type="text"
                                id="modalNewOrgName"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500"
                                required
                                aria-required="true"
                                placeholder={t('admin.enterOrganizationName')}
                            />
                        </div>
                        <div>
                            <label htmlFor="modalNewOrgPlan" className="block text-sm font-medium text-gray-700">{t('admin.plan')}</label>
                            <select
                                id="modalNewOrgPlan"
                                value={planId}
                                onChange={(e) => setPlanId(e.target.value)}
                                className="mt-1 w-full p-2 border border-gray-300 rounded-md bg-white shadow-sm focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">{t('admin.noPlanAssigned')}</option>
                                {plans.map((plan: Plan) => (
                                    <option key={plan.id} value={plan.id}>{plan.name}</option>
                                ))}
                            </select>
                        </div>
                    </form>
                </div>
                <div className="flex justify-end space-x-3 p-6 border-t bg-gray-50 rounded-b-lg">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300" disabled={isSaving}>{t('common.cancel')}</button>
                    <button type="submit" form="add-org-form" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center" disabled={isSaving || !name.trim()}>
                        {isSaving ? <FiLoader className="animate-spin mr-2"/> : <FiPlusCircle className="mr-2"/>} {t('admin.addOrganization')}
                    </button>
                </div>
            </div>
        </div>,
        document.getElementById('modal-root')!
    );
};

const OrganizationModal = ({ org, editData, plans, onClose, onSave, isSaving, error, setEditData, onManageAdmins, onPreApprove, onArchive }: any) => {
    const { t } = useTranslation();
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setEditData((prev: any) => ({ ...prev, [name]: value }));
    };

    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="p-6 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-800">{t('admin.editOrganization', { name: org.name })}</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><FiXCircle size={24}/></button>
                </div>
                <div className="p-6 flex-grow overflow-y-auto custom-scrollbar">
                    <form id="org-edit-form" onSubmit={(e) => { e.preventDefault(); onSave(); }} className="space-y-4">
                        {error && <div className="p-3 rounded-md text-sm bg-red-100 text-red-700"><FiErrorCircle className="inline mr-2"/>{error}</div>}
                        <p className="text-xs text-gray-500">{t('checkout.requiredFieldsNote')}</p>
                        <div>
                            <label htmlFor="name" className="block text-sm font-medium text-gray-700">{t('admin.organizationName')} <span aria-hidden="true">*</span></label>
                            <input type="text" name="name" id="name" value={editData.name} onChange={handleInputChange} className="mt-1 w-full p-2 border border-gray-300 rounded-md" required aria-required="true"/>
                        </div>
                        <div>
                            <label htmlFor="planId" className="block text-sm font-medium text-gray-700">{t('admin.plan')}</label>
                            <select name="planId" id="planId" value={editData.planId || ''} onChange={handleInputChange} className="mt-1 w-full p-2 border border-gray-300 rounded-md bg-white">
                                <option value="">{t('admin.noPlanAssigned')}</option>
                                {plans.map((plan: Plan) => (
                                    <option key={plan.id} value={plan.id}>{plan.name}</option>
                                ))}
                            </select>
                        </div>
                        
                        <div className="p-4 bg-gray-50 border border-gray-200 rounded-md">
                            <label htmlFor="subscriptionProvider" className="block text-sm font-medium text-gray-700 mb-2">{t('billing.paymentMethod')}</label>
                            <select name="subscriptionProvider" id="subscriptionProvider" value={editData.subscriptionProvider || 'manual'} onChange={handleInputChange} className="w-full p-2 border border-gray-300 rounded-md bg-white">
                                <option value="manual">{t('admin.manualDirect')}</option>
                                <option value="gymind">{t('admin.gymindPayment')}</option>
                                <option value="woocommerce">{t('admin.wordpressPlugin')}</option>
                            </select>
                            {editData.subscriptionProvider === 'gymind' && (
                                <p className="text-xs text-blue-600 mt-2">
                                    {t('admin.gymindPaymentDesc')}
                                </p>
                            )}
                        </div>

                    </form>
                    <div className="pt-6 mt-6 border-t">
                        <h3 className="text-md font-semibold text-gray-700">{t('admin.otherActions')}</h3>
                        <div className="mt-3 flex flex-wrap gap-3">
                             <button type="button" onClick={onPreApprove} className="text-sm text-cyan-600 hover:text-cyan-800 py-2 px-3 rounded-md hover:bg-cyan-50 flex items-center transition-colors disabled:opacity-50 border border-cyan-200"><FiUserPlus className="mr-2"/> {t('admin.preApproveUsers')}</button>
                             <button type="button" onClick={onManageAdmins} className="text-sm text-green-600 hover:text-green-800 py-2 px-3 rounded-md hover:bg-green-50 flex items-center transition-colors disabled:opacity-50 border border-green-200"><FiUsers className="mr-2"/> {t('admin.manageAdmins')}</button>
                             <button type="button" onClick={onArchive} className="text-sm text-red-600 hover:text-red-800 py-2 px-3 rounded-md hover:bg-red-50 flex items-center transition-colors disabled:opacity-50 border border-red-200"><FiArchive className="mr-2"/> {t('admin.archiveOrganization')}</button>
                        </div>
                    </div>
                </div>
                <div className="flex justify-end space-x-3 p-6 border-t mt-auto flex-shrink-0 bg-gray-50 rounded-b-lg">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300" disabled={isSaving}>{t('common.cancel')}</button>
                    <button type="submit" form="org-edit-form" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center" disabled={isSaving}>
                        {isSaving ? <FiLoader className="animate-spin mr-2"/> : <FiSave className="mr-2"/>} {t('common.saveChanges')}
                    </button>
                </div>
            </div>
        </div>,
        document.getElementById('modal-root')!
    );
};


const OrganizationManagementPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { 
    organizations,
    archivedOrganizations,
    fetchOrganizations,
    fetchArchivedOrganizations,
    restoreOrganization,
    plans,
    fetchPlans,
    users,
    addOrganization, 
    updateOrganization, 
    deleteOrganization,
    confirmArchiveOrganization,
    addOrganizationManager,
    removeOrganizationManager,
    orgTokenUsage,
    fetchOrgTokenUsage,
    isAnalyticsLoading,
    dataError, 
    clearDataError, 
    isLoading: isDataLoading,
    tutorialSettings
  } = useData();
  const navigate = useNavigate();

  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgPlanId, setNewOrgPlanId] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  const activePlans = useMemo(() => plans.filter((p: Plan) => p.status !== 'archived'), [plans]);

  const [orgToEdit, setOrgToEdit] = useState<OrgWithComputedData | null>(null);
  const [editOrgData, setEditOrgData] = useState<{ name: string; planId: string, subscriptionProvider: string }>({ name: '', planId: '', subscriptionProvider: 'manual' });
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  useEffect(() => {
    if (modalError) {
      const timer = setTimeout(() => {
        setModalError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [modalError]);

  const [archiveConfirmData, setArchiveConfirmData] = useState<{ resource: OrgWithComputedData; dependencies?: any } | null>(null);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  useEffect(() => {
    if (feedbackMessage) {
      const timer = setTimeout(() => {
        setFeedbackMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [feedbackMessage]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPlan, setFilterPlan] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'on', 'off'
  const [filterYear, setFilterYear] = useState<string>('');
  const [filterMonth, setFilterMonth] = useState<string>('');
  const [viewType, setViewType] = useState<'all' | 'corporate' | 'individual'>('all');
  
  const [preApproveModalOrg, setPreApproveModalOrg] = useState<Workspace | null>(null);

  // States for org manager modal
  const [showAdminModal, setShowAdminModal] = useState<Workspace | null>(null);
  const [adminEmail, setAdminEmail] = useState('');
  const [currentAdmins, setCurrentAdmins] = useState<User[]>([]);
  const [adminToRemove, setAdminToRemove] = useState<User | null>(null);

  const months = useMemo(() => Array.from({length: 12}, (_, i) => ({ value: i + 1, name: new Date(0, i).toLocaleString('default', { month: 'long' }) })), []);
  const years = useMemo(() => {
      const currentYear = new Date().getFullYear();
      return Array.from({length: 5}, (_, i) => currentYear - i);
  }, []);

  useEffect(() => {
    if (user?.role === UserRole.ACADEMY_ADMIN || user?.role === UserRole.SYSTEM_ADMIN) {
      fetchPlans();
    }
  }, [user, fetchPlans]);
  
  useEffect(() => {
    const yearNum = filterYear ? parseInt(filterYear, 10) : undefined;
    const monthNum = filterMonth ? parseInt(filterMonth, 10) : undefined;
    
    // Use a flag or ref to avoid redundant calls if needed, 
    // but the main issue is likely the dependency stability.
    fetchOrgTokenUsage(monthNum, yearNum);
  }, [filterYear, filterMonth, fetchOrgTokenUsage]);

  useEffect(() => {
    if (dataError) {
      setFeedbackMessage({ type: 'error', text: dataError });
    }
  }, [dataError]);

  useEffect(() => {
      fetchOrganizations();
  }, [fetchOrganizations]);

  useEffect(() => {
    if (showAdminModal) {
        const admins = users.filter(u => u.dbRoles?.organizationAdmin?.includes(showAdminModal.id));
        setCurrentAdmins(admins);
    } else {
        setCurrentAdmins([]);
    }
  }, [showAdminModal, users]);


   const orgsWithComputedData: OrgWithComputedData[] = useMemo(() => {
    if (!organizations || !users) return [];

    // Hide system-generated fallback orgs (isPersonal: true) from the management table
    let filteredOrgs = organizations.filter(org => !org.isPersonal);

    // Filter by view type using plan.maxUsers as the source of truth
    if (viewType === 'individual') {
        filteredOrgs = filteredOrgs.filter(org => {
            const plan = plans.find(p => p.id === org.planId);
            return plan ? plan.maxUsers === 1 : false;
        });
    } else if (viewType === 'corporate') {
        filteredOrgs = filteredOrgs.filter(org => {
            const plan = plans.find(p => p.id === org.planId);
            return !plan || plan.maxUsers !== 1;
        });
    }

    // Filter by search term
    if (searchTerm) {
        filteredOrgs = filteredOrgs.filter(org =>
            org.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }

    // Filter by plan
    if (filterPlan) {
        filteredOrgs = filteredOrgs.filter(org => org.planId === filterPlan);
    }

    // Filter by status
    if (filterStatus !== 'all') {
        filteredOrgs = filteredOrgs.filter(org => {
            const isActive = ['active', 'trialing'].includes(org.subscriptionStatus || '');
            return filterStatus === 'on' ? isActive : !isActive;
        });
    }

    return filteredOrgs.map(org => {
        const orgUsers = users.filter(u => u.organizations.some(userOrg => userOrg.id === org.id));
        const usageData = orgTokenUsage?.[org.id];
        
        return {
            ...org,
            userCount: orgUsers.length,
            tokensUsed: usageData?.used ?? 0,
            tokenLimit: usageData?.limit ?? null
        };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [organizations, users, orgTokenUsage, plans, searchTerm, filterPlan, filterStatus, viewType]);

  const dynamicTitle = useMemo(() => {
    const filters: string[] = [];
    
    if (searchTerm) {
        filters.push(`Name includes "${searchTerm}"`);
    }
    if (filterPlan) {
        const planName = plans.find(p => p.id === filterPlan)?.name;
        if (planName) filters.push(`Plan: "${planName}"`);
    }
    if (filterStatus !== 'all') {
        filters.push(`Payment Status: ${filterStatus === 'on' ? 'On' : 'Off'}`);
    }

    const count = `(${orgsWithComputedData.length})`;
    
    if (filters.length > 0) {
        return `${filters.join(', ')} ${count}`;
    }
    
    switch(viewType) {
        case 'corporate':
            return `Corporate Clients ${count}`;
        case 'individual':
            return `Individual Subscribers ${count}`;
        default:
            return `All Organizations ${count}`;
    }
  }, [searchTerm, filterPlan, filterStatus, viewType, plans, orgsWithComputedData.length]);


  const clearFeedback = () => {
    setFeedbackMessage(null);
    setModalError(null);
    if (dataError) clearDataError();
  };

  const handleAddOrganization = async () => {
    clearFeedback();
    if (newOrgName.trim()) {
      setIsSaving(true);
      // New orgs default to manual, admin can change it in edit
      const newOrg = await addOrganization(newOrgName.trim(), user!.academyId, newOrgPlanId);
      setIsSaving(true); // Keep spinner until modal closes or error shows
      if (newOrg) {
        setNewOrgName('');
        setNewOrgPlanId('');
        setIsSaving(false);
        setIsAddModalOpen(false);
        setFeedbackMessage({ type: 'success', text: `Workspace "${newOrg.name}" added successfully.` });
      } else if (!dataError) { 
        setIsSaving(false);
        setModalError('Failed to add organization.');
      } else {
        setIsSaving(false);
      }
    } else {
      setModalError('Workspace Name is required.');
    }
  };
  
  const handleRowClick = (org: OrgWithComputedData) => {
    if (org.isPersonal) {
        // Find the single user associated with this personal org
        const userInOrg = users.find(u => u.organizations.some(userOrg => userOrg.id === org.id));
        if (userInOrg) {
            navigate(`/admin/users/${userInOrg.id}`);
        } else {
            setFeedbackMessage({ type: 'error', text: 'Could not find the user for this personal workspace.' });
        }
    } else {
        handleOpenEditModal(org);
    }
  };

  const handleOpenEditModal = (org: OrgWithComputedData) => {
    clearFeedback();
    setEditOrgData({ name: org.name, planId: org.planId || '', subscriptionProvider: org.subscriptionProvider || 'manual' });
    setOrgToEdit(org);
  };
  
  const handleSaveEdit = async () => {
    clearFeedback();
    if (orgToEdit && editOrgData.name.trim()) {
      setIsSaving(true);
      const success = await updateOrganization(orgToEdit.id, { 
          name: editOrgData.name.trim(), 
          planId: editOrgData.planId,
          subscriptionProvider: editOrgData.subscriptionProvider,
          isPersonal: orgToEdit.isPersonal // Maintain the flag
      });
      setIsSaving(false);
      if (success) {
        setFeedbackMessage({ type: 'success', text: `Workspace "${editOrgData.name}" updated.` });
        setOrgToEdit(null);
      } else if (!dataError) {
        setModalError('Failed to update organization.');
      }
    }
  };

  const handleAttemptArchive = async (org: OrgWithComputedData) => {
    clearFeedback();
    setIsSaving(true);
    const result = await deleteOrganization(org.id);
    setIsSaving(false);
    if (result.isConflict) {
        setArchiveConfirmData({ resource: org, dependencies: result.dependencies.users || [] });
    } else if (dataError) {
        setFeedbackMessage({ type: 'error', text: dataError });
    } else {
        setArchiveConfirmData({ resource: org });
    }
  };

  const handleConfirmArchive = async () => {
    if (!archiveConfirmData) return;
    setIsSaving(true);
    const success = await confirmArchiveOrganization(archiveConfirmData.resource.id);
    if (success) {
        setFeedbackMessage({ type: 'success', text: 'Workspace archived successfully.' });
    }
    setIsSaving(false);
    setArchiveConfirmData(null);
  };
  
    // Org Manager Handlers
    const handleAddOrgManager = async () => {
        if (!showAdminModal || !adminEmail.trim()) {
            setFeedbackMessage({ type: 'error', text: 'Please enter a valid email address.' });
            return;
        }
        clearFeedback();
        setIsSaving(true);
        const result = await addOrganizationManager(showAdminModal.id, adminEmail);
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
        const result = await removeOrganizationManager(showAdminModal.id, adminToRemove.id);
        setIsSaving(false);
        if (result) {
            setFeedbackMessage({ type: 'success', text: result.message });
        } else if (!dataError) {
            setFeedbackMessage({ type: 'error', text: 'Failed to remove manager.' });
        }
        setAdminToRemove(null);
    };

    const handleExportToExcel = () => {
        const dataForExport = orgsWithComputedData.map(org => ({
            'Name': org.name,
            'Plan': org.planName || 'N/A',
            'Billing via': org.subscriptionProvider?.replace('woocommerce', 'WordPress') || 'Manual',
            'Payment Status': ['active', 'trialing'].includes(org.subscriptionStatus || '') ? 'On' : 'Off',
            'Users': org.userCount,
            'Tokens Used': org.tokensUsed,
            'Token Limit': org.tokenLimit === null ? 'Unlimited' : org.tokenLimit,
            'Type': org.isPersonal ? 'Individual Subscriber' : 'Corporate Client',
        }));

        exportToCSV(dataForExport, "Gymind_Organizations_Export.csv");
    };

  if (user?.role !== UserRole.ACADEMY_ADMIN && user?.role !== UserRole.SYSTEM_ADMIN) {
    return <div className="p-6 text-red-600">{t('admin.accessDenied')}</div>;
  }

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar">
      {/* Sticky Header - No bottom border for clean look */}
      <div className="sticky top-0 z-20 bg-gray-100 px-4 md:px-8 pt-4 md:pt-8 pb-4">
        <div className="max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-2">
                <h1 className="text-3xl font-bold text-gray-800 flex items-center">
                    <FiBriefcase className="mr-3 text-blue-500"/> {t('admin.manageOrganizations')}
                </h1>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <button onClick={() => setIsArchiveModalOpen(true)} className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center transition-colors text-sm w-full sm:w-auto">
                      <FiArchive className="mr-2" /> {t('common.viewArchived')}
                  </button>
                  <button
                    onClick={handleExportToExcel}
                    className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center transition-colors w-full sm:w-auto"
                    title={t('admin.exportOrganizationList')}
                  >
                    <FiShare className="mr-2" /> {t('common.export')}
                  </button>
                  <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center transition-colors w-full sm:w-auto"
                  >
                    <FiPlusCircle className="mr-2" /> {t('admin.addOrganization')}
                  </button>
                </div>
            </div>
            <TutorialSection videoUrl={tutorialSettings?.organizations?.videoUrl} />
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 md:px-8 pb-8 pt-4">
        <div className="max-w-6xl mx-auto">
            {feedbackMessage && !orgToEdit && (
            <div className={`p-3 mb-4 rounded-md flex items-center text-sm ${feedbackMessage.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {feedbackMessage.type === 'success' ? <FiCheckCircle className="mr-2"/> : <FiErrorCircle className="mr-2"/>}
                {feedbackMessage.text}
                <button onClick={clearFeedback} className="ml-auto text-lg font-semibold">&times;</button>
            </div>
            )}
            
            <div className="mb-8 p-6 bg-white shadow-md rounded-lg">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-4">
                    <div className="flex items-center gap-6">
                        <h2 className="text-xl font-semibold text-gray-700">{t('common.filters')}</h2>
                        <button
                            onClick={() => { setSearchTerm(''); setFilterPlan(''); setFilterStatus('all'); setFilterYear(''); setFilterMonth(''); setViewType('all'); }}
                            className="text-sm text-blue-600 border border-blue-600 hover:bg-blue-50 font-medium px-3 py-1 rounded-md transition-colors"
                            aria-label={t('common.resetFilters')}
                        >
                            {t('common.resetFilters')}
                        </button>
                    </div>
                    <div className="flex items-center space-x-1 bg-gray-200 p-1 rounded-lg w-full sm:w-auto">
                        <button onClick={() => setViewType('all')} className={`w-1/3 sm:w-auto px-3 py-1 text-sm font-medium rounded-md ${viewType === 'all' ? 'bg-white shadow' : 'text-gray-600'}`}>{t('common.all')}</button>
                        <button onClick={() => setViewType('corporate')} className={`w-1/3 sm:w-auto px-3 py-1 text-sm font-medium rounded-md ${viewType === 'corporate' ? 'bg-white shadow' : 'text-gray-600'}`}>{t('admin.corporateClients')}</button>
                        <button onClick={() => setViewType('individual')} className={`w-1/3 sm:w-auto px-3 py-1 text-sm font-medium rounded-md ${viewType === 'individual' ? 'bg-white shadow' : 'text-gray-600'}`}>{t('admin.individualSubscribers')}</button>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label htmlFor="org-search" className="block text-sm font-medium text-gray-700">{t('admin.searchByName')}</label>
                        <input
                            id="org-search" type="text" placeholder={t('admin.enterName')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                            className="mt-1 w-full p-2 border border-gray-300 rounded-md"
                        />
                    </div>
                    <div>
                        <label htmlFor="plan-filter" className="block text-sm font-medium text-gray-700">{t('admin.filterByPlan')}</label>
                        <select id="plan-filter" value={filterPlan} onChange={(e) => setFilterPlan(e.target.value)} className="mt-1 w-full p-2 border border-gray-300 rounded-md bg-white">
                            <option value="">{t('admin.allPlans')}</option>
                            {activePlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700">{t('admin.paymentStatus')}</label>
                        <select id="status-filter" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="mt-1 w-full p-2 border border-gray-300 rounded-md bg-white">
                            <option value="all">{t('admin.allStatuses')}</option>
                            <option value="on">{t('admin.paymentOn')}</option>
                            <option value="off">{t('admin.paymentOff')}</option>
                        </select>
                    </div>
                    <div className="md:col-span-3">
                        <label className="block text-sm font-medium text-gray-700">{t('admin.tokenUsagePeriodFilter')}</label>
                        <div className="mt-1 grid grid-cols-2 gap-4">
                            <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md bg-white text-sm">
                                <option value="">{t('common.allMonths')}</option>
                                {months.map(m => <option key={m.value} value={m.value}>{m.name}</option>)}
                            </select>
                            <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md bg-white text-sm">
                                <option value="">{t('common.allYears')}</option>
                                {years.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white shadow-md rounded-lg p-6 mb-8">
                <h2 className="text-xl font-semibold text-gray-700">
                    {dynamicTitle}
                </h2>
            </div>

            <div className="bg-white shadow-md rounded-lg overflow-x-auto custom-scrollbar">
            {orgsWithComputedData.length === 0 && !isDataLoading ? (
                <p className="p-6 text-gray-500 text-center">{t('admin.noOrganizationsFound')}</p>
            ) : (
                <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {viewType === 'all' ? t('common.name') : viewType === 'corporate' ? t('admin.organizationName') : t('admin.subscriberName')}
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('admin.plan')}</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('admin.billingVia')}</th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('admin.paymentStatus')}
                    </th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('admin.users')}</th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('admin.tokensUsed')}</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.actions')}</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {orgsWithComputedData.map(org => (
                        <tr key={org.id} onClick={() => handleRowClick(org)} className="hover:bg-gray-50 transition-colors cursor-pointer">
                            <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">{org.name}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{org.planName || 'N/A'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 capitalize">{org.subscriptionProvider?.replace('woocommerce', 'WordPress') || 'Manual'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                    ['active', 'trialing'].includes(org.subscriptionStatus || '') 
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-red-100 text-red-800'}`}>
                                    {['active', 'trialing'].includes(org.subscriptionStatus || '') ? 'On' : 'Off'}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 text-center">{org.userCount}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 text-center">
                                {isAnalyticsLoading && !orgTokenUsage ? <FiLoader className="animate-spin h-4 w-4 mx-auto"/> : <TokenUsageBar used={org.tokensUsed} limit={org.tokenLimit} />}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <div className="flex items-center justify-end space-x-1">
                                    <button onClick={(e) => { e.stopPropagation(); handleOpenEditModal(org); }} className="text-indigo-600 hover:text-indigo-800 p-2 rounded-full hover:bg-indigo-100" title="Edit" disabled={isSaving || isDataLoading}><FiEdit size={18} /></button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
                </table>
            )}
            </div>
        </div>
      </div>
      
      {orgToEdit && (
        <OrganizationModal
          org={orgToEdit}
          editData={editOrgData}
          plans={activePlans}
          onClose={() => setOrgToEdit(null)}
          onSave={handleSaveEdit}
          isSaving={isSaving}
          error={modalError}
          setEditData={setEditOrgData}
          onManageAdmins={() => { setOrgToEdit(null); clearFeedback(); setShowAdminModal(orgToEdit); }}
          onPreApprove={() => { setOrgToEdit(null); setPreApproveModalOrg(orgToEdit); }}
          onArchive={() => { setOrgToEdit(null); handleAttemptArchive(orgToEdit);}}
        />
      )}

      <PreApproveUsersModal 
        isOpen={!!preApproveModalOrg} 
        onClose={() => setPreApproveModalOrg(null)} 
        organization={preApproveModalOrg}
      />

      {showAdminModal && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
                <h3 className="text-xl font-semibold text-gray-800 mb-4 flex-shrink-0">{t('admin.manageAdminsFor', { name: showAdminModal.name })}</h3>
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
                                        <button onClick={() => setAdminToRemove(admin)} className="p-1.5 text-red-600 hover:text-red-800 rounded-full hover:bg-red-100 transition-colors" title="Remove Admin Privileges"><FiArchive size={16}/></button>
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
                            <input id="adminEmail" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" required aria-required="true"/>
                        </div>
                        <div className="flex justify-end mt-4">
                             <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center disabled:opacity-50" disabled={isSaving || !adminEmail.trim()}>
                                {isSaving ? <FiLoader className="animate-spin mr-2"/> : <FiUserPlus className="mr-2"/>}
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
                <div className="flex items-start mb-4"><FiAlertTriangle className="text-red-500 h-8 w-8 mr-3 mt-1"/><h3 className="text-xl font-semibold">{t('admin.confirmManagerRemoval')}</h3></div>
                <p className="text-gray-600 mb-6">{t('admin.confirmRemoveManager', { name: adminToRemove.name })}</p>
                <div className="flex justify-end space-x-3">
                    <button onClick={() => setAdminToRemove(null)} className="px-4 py-2 bg-gray-200 rounded-md" disabled={isSaving}>{t('common.cancel')}</button>
                    <button onClick={handleConfirmRemoveManager} className="px-4 py-2 bg-red-600 text-white rounded-md flex items-center disabled:opacity-50" disabled={isSaving}>{isSaving ? <FiLoader className="animate-spin mr-2"/> : <FiArchive className="mr-2"/>}{isSaving ? t('common.removing') : t('admin.confirmRemove')}</button>
                </div>
            </div>
        </div>,
        document.getElementById('modal-root')!
      )}

      <ConfirmationModal
        isOpen={!!archiveConfirmData}
        onClose={() => setArchiveConfirmData(null)}
        onConfirm={handleConfirmArchive}
        isLoading={isSaving}
        title="Confirm Workspace Archive"
        message={<>Are you sure you want to archive "<strong>{archiveConfirmData?.resource.name}</strong>"?</>}
        confirmText="Confirm Archive"
        dependencies={archiveConfirmData?.dependencies}
        dependencyWarning={archiveConfirmData?.dependencies && archiveConfirmData.dependencies.length > 0 ? `This will unassign ${archiveConfirmData.dependencies.length} user(s). Their accounts will NOT be deleted.` : "This action cannot be undone."}
      />

      <ArchiveRestoreModal
        isOpen={isArchiveModalOpen}
        onClose={() => setIsArchiveModalOpen(false)}
        title="Archived Organizations"
        items={archivedOrganizations}
        onRestore={restoreOrganization}
        fetchItems={fetchArchivedOrganizations}
      />

      <AddOrganizationModal
        isOpen={isAddModalOpen}
        onClose={() => { setIsAddModalOpen(false); setModalError(null); }}
        onSave={handleAddOrganization}
        isSaving={isSaving}
        plans={activePlans}
        name={newOrgName}
        setName={setNewOrgName}
        planId={newOrgPlanId}
        setPlanId={setNewOrgPlanId}
        error={modalError}
      />
    </div>
  );
};

export default OrganizationManagementPage;
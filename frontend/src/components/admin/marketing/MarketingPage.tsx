import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FiPlus, FiEdit2, FiPause, FiPlay, FiArchive, FiTrash2, FiMoreVertical, FiChevronRight, FiZap } from 'react-icons/fi';
import { NewsletterCampaign } from '../../../types';
import { fetchCampaigns, updateCampaignStatus, deleteCampaign } from '../../../services/geminiService';
import CampaignSettingsModal from './CampaignSettingsModal';
import ArchiveRestoreModal from '../shared/ArchiveRestoreModal';
import MarketingIcon from '../../common/MarketingIcon';

const RECIPIENT_LABELS: Record<NewsletterCampaign['recipientGroup'], string> = {
  all_users: 'All Users',
  organization: 'By Organization',
  course_enrolled: 'By Course Enrollment',
  course_completed: 'By Course Completion',
};

const STATUS_BADGE: Record<NewsletterCampaign['status'], string> = {
  active: 'bg-green-100 text-green-800',
  paused: 'bg-yellow-100 text-yellow-800',
  archived: 'bg-gray-100 text-gray-600',
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getScheduleLabel(c: NewsletterCampaign): string {
  if (c.frequency === 'one_time') return 'One-time (manual send)';
  const time = c.scheduledTime ?? '';
  const freqLabel = c.frequency === 'monthly'
    ? `Monthly — Day ${c.scheduledDay ?? '?'} at ${time}`
    : `${c.frequency === 'weekly' ? 'Weekly' : 'Biweekly'} — ${c.scheduledDay !== undefined ? DAY_NAMES[c.scheduledDay] ?? `Day ${c.scheduledDay}` : '?'}s at ${time}`;
  if (c.campaignType === 'trigger') {
    const triggerLabel = c.triggerType === 'course_completion' ? 'On Course Completion' : c.triggerType === 'course_enrollment' ? 'On Course Enrollment' : 'On Registration';
    return `Trigger: ${triggerLabel} — ${freqLabel}`;
  }
  return freqLabel;
}

const MarketingPage: React.FC = () => {
  const { t } = useTranslation();
  const [campaigns, setCampaigns] = useState<NewsletterCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<NewsletterCampaign | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);

  const loadCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchCampaigns();
      setCampaigns(data);
    } catch (e: any) {
      setError(e.message || t('marketing.page.failedToLoad'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadCampaigns(); }, [loadCampaigns]);

  useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openMenuId]);

  const handleStatusToggle = async (campaign: NewsletterCampaign) => {
    const nextStatus: NewsletterCampaign['status'] = campaign.status === 'active' ? 'paused' : 'active';
    try {
      await updateCampaignStatus(campaign.id, nextStatus);
      setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, status: nextStatus } : c));
    } catch (e: any) { alert(e.message || 'Failed to update status.'); }
  };

  const handleArchive = async (campaign: NewsletterCampaign) => {
    if (!window.confirm(t('marketing.page.confirmArchive', { name: campaign.name }))) return;
    try {
      await updateCampaignStatus(campaign.id, 'archived');
      setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, status: 'archived' } : c));
    } catch (e: any) { alert(e.message || t('marketing.page.failedToArchive')); }
  };

  const handleDelete = async (campaign: NewsletterCampaign) => {
    if (!window.confirm(t('marketing.page.confirmDelete', { name: campaign.name }))) return;
    try {
      await deleteCampaign(campaign.id);
      setCampaigns(prev => prev.filter(c => c.id !== campaign.id));
    } catch (e: any) { alert(e.message || t('marketing.page.failedToDelete')); }
  };

  const handleEdit = (campaign: NewsletterCampaign) => {
    setEditingCampaign(campaign);
    setShowModal(true);
  };

  const handleModalClose = () => { setShowModal(false); setEditingCampaign(null); };

  const handleModalSave = (saved: NewsletterCampaign) => {
    setCampaigns(prev => {
      const idx = prev.findIndex(c => c.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [saved, ...prev];
    });
    handleModalClose();
  };

  const handleRestore = async (id: string): Promise<boolean> => {
    try {
      await updateCampaignStatus(id, 'active');
      setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'active' } : c));
      return true;
    } catch (e: any) {
      alert(e.message || t('marketing.page.failedToRestore'));
      return false;
    }
  };

  const fetchArchivedCampaigns = useCallback(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  const archivedCampaigns = campaigns.filter(c => c.status === 'archived');
  const visibleCampaigns = campaigns.filter(c => c.status !== 'archived');

  return (
    <div className="w-full h-full overflow-y-auto bg-gray-100">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-gray-100 px-4 md:px-8 pt-4 md:pt-8 pb-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
              <MarketingIcon className="text-blue-500" />
              {t('marketing.page.title')}
            </h1>
            <div className="flex flex-col sm:flex-row gap-2 sm:shrink-0">
              <button
                onClick={() => setIsArchiveModalOpen(true)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center gap-2 transition-colors text-sm w-full sm:w-auto"
                aria-label={t('marketing.page.viewArchivedAriaLabel')}
              >
                <FiArchive size={16} aria-hidden="true" />
                {t('marketing.page.viewArchived')}
              </button>
              <button
                onClick={() => { setEditingCampaign(null); setShowModal(true); }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center gap-2 transition-colors w-full sm:w-auto"
                aria-label={t('marketing.page.createCampaignAriaLabel')}
              >
                <FiPlus size={18} aria-hidden="true" /> {t('marketing.page.createCampaign')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 md:px-8 pb-8 pt-4">
        <div className="max-w-6xl mx-auto">
          <p className="text-gray-600 mb-6">{t('marketing.page.subtitle')}</p>
              {loading && (
                <div className="flex justify-center items-center py-20" role="status" aria-label="Loading campaigns">
                  <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {!loading && error && (
                <div className="text-center py-16 text-red-600" role="alert">{error}</div>
              )}
              {!loading && !error && visibleCampaigns.length === 0 && (
                <div className="text-center py-20">
                  <FiArchive className="mx-auto text-gray-300 mb-4" size={48} aria-hidden="true" />
                  <p className="text-gray-500 text-lg">{t('marketing.page.noCampaigns')}</p>
                  <p className="text-gray-400 text-sm mt-1">{t('marketing.page.noCampaignsHint')}</p>
                </div>
              )}
              {!loading && !error && visibleCampaigns.length > 0 && (
                <ul className="space-y-4" aria-label="Campaign list">
                  {visibleCampaigns.map(campaign => (
                    <li
                      key={campaign.id}
                      className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-start justify-between gap-4"
                    >
                      <Link
                        to={`/admin/marketing/${campaign.id}`}
                        className="flex-1 min-w-0 flex items-center gap-3 group"
                        aria-label={`Open campaign ${campaign.name}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-900 text-lg truncate group-hover:text-indigo-600 transition-colors">{campaign.name}</span>
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[campaign.status]}`}
                              aria-label={`Status: ${campaign.status}`}
                            >
                              {campaign.status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 mt-1">{getScheduleLabel(campaign)}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {campaign.campaignType === 'trigger' && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700" aria-label="Trigger campaign">
                                <FiZap size={10} aria-hidden="true" /> Trigger
                              </span>
                            )}
                            <p className="text-sm text-gray-400">{campaign.campaignType === 'trigger'
                              ? (campaign.triggerType === 'course_completion' ? 'On Course Completion' : campaign.triggerType === 'course_enrollment' ? 'On Course Enrollment' : 'On Registration')
                              : RECIPIENT_LABELS[campaign.recipientGroup]}</p>
                          </div>
                        </div>
                        <FiChevronRight className="text-gray-300 group-hover:text-indigo-400 flex-shrink-0 transition-colors rtl-flip" size={20} aria-hidden="true" />
                      </Link>

                      {/* Action menu */}
                      <div className="relative flex-shrink-0">
                        <button
                          onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === campaign.id ? null : campaign.id); }}
                          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                          aria-label={`Actions for ${campaign.name}`}
                          aria-haspopup="menu"
                          aria-expanded={openMenuId === campaign.id}
                        >
                          <FiMoreVertical size={18} />
                        </button>
                        {openMenuId === campaign.id && (
                          <div
                            className="absolute right-0 top-10 bg-white border border-gray-200 rounded-lg shadow-lg z-20 w-44 py-1"
                            role="menu"
                            aria-label={`Campaign actions for ${campaign.name}`}
                          >
                            <button
                              role="menuitem"
                              onClick={() => { setOpenMenuId(null); handleEdit(campaign); }}
                              className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <FiEdit2 size={14} aria-hidden="true" /> {t('marketing.page.editSettings')}
                            </button>
                            {campaign.status !== 'archived' && (
                              <button
                                role="menuitem"
                                onClick={() => { setOpenMenuId(null); void handleStatusToggle(campaign); }}
                                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                {campaign.status === 'active'
                                  ? <><FiPause size={14} aria-hidden="true" /> {t('marketing.page.pause')}</>
                                  : <><FiPlay size={14} aria-hidden="true" /> {t('marketing.page.resume')}</>
                                }
                              </button>
                            )}
                            {campaign.status !== 'archived' && (
                              <button
                                role="menuitem"
                                onClick={() => { setOpenMenuId(null); void handleArchive(campaign); }}
                                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <FiArchive size={14} aria-hidden="true" /> {t('marketing.page.archive')}
                              </button>
                            )}
                            {campaign.status === 'archived' && (
                              <button
                                role="menuitem"
                                onClick={() => { setOpenMenuId(null); void handleStatusToggle(campaign); }}
                                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <FiPlay size={14} aria-hidden="true" /> {t('marketing.page.restore')}
                              </button>
                            )}
                            <button
                              role="menuitem"
                              onClick={() => { setOpenMenuId(null); void handleDelete(campaign); }}
                              className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                              <FiTrash2 size={14} aria-hidden="true" /> {t('marketing.page.delete')}
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
        </div>
      </div>

      {showModal && (
        <CampaignSettingsModal
          campaign={editingCampaign}
          onClose={handleModalClose}
          onSave={handleModalSave}
        />
      )}

      <ArchiveRestoreModal
        isOpen={isArchiveModalOpen}
        onClose={() => setIsArchiveModalOpen(false)}
        title={t('marketing.page.archivedCampaigns')}
        items={archivedCampaigns}
        onRestore={handleRestore}
        fetchItems={fetchArchivedCampaigns}
      />
    </div>
  );
};

export default MarketingPage;

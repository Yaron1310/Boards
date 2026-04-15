import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FiArrowLeft, FiSettings, FiPause, FiPlay, FiPlus,
  FiEdit2, FiEye, FiCopy, FiTrash2, FiSend, FiMail, FiArchive, FiCalendar,
  FiChevronUp, FiChevronDown, FiZap,
} from 'react-icons/fi';
import { NewsletterCampaign, NewsletterEdition } from '../../../types';
import {
  fetchCampaigns,
  fetchEditions,
  createEdition,
  deleteEdition,
  duplicateEdition,
  testSendEdition,
  sendEditionNow,
  updateCampaignStatus,
  reorderEdition,
} from '../../../services/geminiService';
import { useAuth } from '../../../hooks/useAuth';
import { useData } from '../../../hooks/useData';
import CampaignSettingsModal from './CampaignSettingsModal';
import EditionEditorModal from './EditionEditorModal';
import EditionPreviewModal from './EditionPreviewModal';

/** Replace personalization variables with display values for preview purposes */
function replaceVarsForDisplay(text: string, userName: string, academyName: string, orgName: string): string {
  return text
    .replace(/\{user_name\}/g, userName)
    .replace(/\{academy_name\}/g, academyName)
    .replace(/\{organization_name\}/g, orgName);
}

const STATUS_BADGE: Record<NewsletterEdition['status'], string> = {
  draft: 'bg-gray-100 text-gray-600',
  scheduled: 'bg-green-100 text-green-700',
  sending: 'bg-yellow-100 text-yellow-700',
  sent: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-700',
};

const STATUS_LABEL: Record<NewsletterEdition['status'], string> = {
  draft: 'Draft',
  scheduled: 'Final',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getCampaignInfoLabel(c: NewsletterCampaign): string {
  if (c.frequency === 'one_time') return 'One-time (manual send)';
  const time = c.scheduledTime ?? '';
  if (c.frequency === 'monthly') return `Monthly — Day ${c.scheduledDay ?? '?'} at ${time}`;
  const day = c.scheduledDay !== undefined ? DAY_NAMES[c.scheduledDay] ?? `Day ${c.scheduledDay}` : '?';
  return `${c.frequency === 'weekly' ? 'Weekly' : 'Biweekly'} — ${day}s at ${time}`;
}

const RECIPIENT_LABELS: Record<NewsletterCampaign['recipientGroup'], string> = {
  all_users: 'All Users',
  organization: 'By Organization',
  course_enrolled: 'By Course Enrollment',
  course_completed: 'By Course Completion',
};

function formatDate(d?: Date | string | null): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : (d as any).toDate?.() ?? d;
  return (date as Date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const CampaignDetailPage: React.FC = () => {
  const { t } = useTranslation();
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const { authUser } = useAuth();
  const { academySettings, courses } = useData();

  const displayName = authUser?.name || 'User';
  const displayAcademy = academySettings?.appName || 'Academy';
  const displayOrg = 'Organization';
  const replaceVars = useCallback((text: string) => replaceVarsForDisplay(text, displayName, displayAcademy, displayOrg), [displayName, displayAcademy]);

  const [campaign, setCampaign] = useState<NewsletterCampaign | null>(null);
  const [editions, setEditions] = useState<NewsletterEdition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSent, setShowSent] = useState(false);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editingEdition, setEditingEdition] = useState<NewsletterEdition | null>(null);
  const [showEditionEditor, setShowEditionEditor] = useState(false);
  const [previewEdition, setPreviewEdition] = useState<NewsletterEdition | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  const isTrigger = campaign?.campaignType === 'trigger';

  const load = useCallback(async () => {
    if (!campaignId) return;
    try {
      setLoading(true);
      setError(null);
      const [allCampaigns, editionList] = await Promise.all([
        fetchCampaigns(),
        fetchEditions(campaignId),
      ]);
      const found = allCampaigns.find(c => c.id === campaignId);
      if (!found) { setError(t('marketing.detail.campaignNotFound')); return; }
      setCampaign(found);
      setEditions(editionList);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load campaign.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => { void load(); }, [load]);

  const handleCampaignSaved = (saved: NewsletterCampaign) => {
    setCampaign(saved);
    setShowSettingsModal(false);
  };

  const handleStatusToggle = async () => {
    if (!campaign) return;
    const next: NewsletterCampaign['status'] = campaign.status === 'active' ? 'paused' : 'active';
    try {
      await updateCampaignStatus(campaign.id, next);
      setCampaign(prev => prev ? { ...prev, status: next } : prev);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to update status.';
      alert(msg);
    }
  };

  const handleEditionSaved = (saved: NewsletterEdition) => {
    setEditions(prev => {
      const idx = prev.findIndex(i => i.id === saved.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = saved; return n; }
      return [saved, ...prev];
    });
    setShowEditionEditor(false);
    setEditingEdition(null);
  };

  const handleDeleteEdition = async (edition: NewsletterEdition) => {
    if (!campaignId) return;
    if (!window.confirm(t('marketing.detail.confirmDeleteEdition', { title: edition.title || edition.subject || t('marketing.detail.untitled') }))) return;
    try {
      await deleteEdition(campaignId, edition.id);
      setEditions(prev => prev.filter(i => i.id !== edition.id));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to delete edition.';
      alert(msg);
    }
  };

  const handleDuplicate = async (edition: NewsletterEdition) => {
    if (!campaignId) return;
    try {
      const scheduledFor = isTrigger ? undefined : getNextScheduledDate();
      const copy = await duplicateEdition(campaignId, edition.id, { scheduledFor });
      setEditions(prev => [copy, ...prev]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to duplicate edition.';
      alert(msg);
    }
  };

  const handleTestSend = async (edition: NewsletterEdition) => {
    if (!campaignId) return;
    try {
      const result = await testSendEdition(campaignId, edition.id);
      alert(result.message);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to send test email.';
      alert(msg);
    }
  };

  const handleSendNow = async (edition: NewsletterEdition) => {
    if (!campaignId) return;
    if (edition.status === 'draft') {
      alert(t('marketing.detail.mustBeFinalToSend'));
      return;
    }
    if (!window.confirm(t('marketing.detail.confirmSendNow', { title: edition.title || edition.subject || t('marketing.detail.untitled') }))) return;
    setSendingId(edition.id);
    try {
      const result = await sendEditionNow(campaignId, edition.id);
      alert(t('marketing.detail.sendSuccess', { successCount: result.successCount, failCount: result.failCount, totalRecipients: result.totalRecipients }));
      setEditions(prev => prev.map(i => i.id === edition.id
        ? { ...i, status: 'sent', totalRecipients: result.totalRecipients, successCount: result.successCount, failCount: result.failCount }
        : i
      ));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to send edition.';
      alert(msg);
    } finally {
      setSendingId(null);
    }
  };

  const handleReorder = async (edition: NewsletterEdition, direction: 'up' | 'down') => {
    if (!campaignId) return;
    setReorderingId(edition.id);
    try {
      const updated = await reorderEdition(campaignId, edition.id, direction);
      setEditions(updated);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to reorder edition.';
      alert(msg);
    } finally {
      setReorderingId(null);
    }
  };

  /** Compute the next available send date based on campaign schedule and existing editions. */
  const getNextScheduledDate = (): string | undefined => {
    if (!campaign) return undefined;
    const { frequency, scheduledDay, scheduledTime } = campaign;
    if (frequency === 'one_time' || scheduledDay === undefined) return undefined;

    // Parse scheduled time (HH:mm)
    const [hours, minutes] = (scheduledTime ?? '09:00').split(':').map(Number);

    // Collect existing edition scheduled dates (as date-only strings for comparison)
    const takenDates = new Set(
      editions
        .filter(e => e.scheduledFor)
        .map(e => {
          const d = typeof e.scheduledFor === 'string'
            ? new Date(e.scheduledFor)
            : (e.scheduledFor as any).toDate?.() ?? new Date(e.scheduledFor as any);
          return (d as Date).toISOString().slice(0, 10);
        })
    );

    // Interval in weeks between editions
    const weekInterval = frequency === 'biweekly' ? 2 : frequency === 'monthly' ? 0 : 1;

    const now = new Date();
    // Start from today, find the next matching weekday (for weekly/biweekly)
    const candidate = new Date(now);
    candidate.setHours(hours, minutes, 0, 0);

    if (frequency === 'monthly') {
      // scheduledDay = day of month (1-31)
      candidate.setDate(scheduledDay);
      if (candidate <= now) {
        candidate.setMonth(candidate.getMonth() + 1);
        candidate.setDate(scheduledDay);
      }
      // Find next month without a taken date
      for (let i = 0; i < 52; i++) {
        const key = candidate.toISOString().slice(0, 10);
        if (!takenDates.has(key)) break;
        candidate.setMonth(candidate.getMonth() + 1);
        candidate.setDate(scheduledDay);
      }
    } else {
      // scheduledDay = day of week (0=Sun, 1=Mon, ..., 6=Sat)
      const diff = (scheduledDay - candidate.getDay() + 7) % 7;
      candidate.setDate(candidate.getDate() + (diff === 0 && candidate <= now ? 7 : diff));
      // Find next slot without a taken date
      for (let i = 0; i < 52; i++) {
        const key = candidate.toISOString().slice(0, 10);
        if (!takenDates.has(key)) break;
        candidate.setDate(candidate.getDate() + (weekInterval === 0 ? 7 : weekInterval * 7));
      }
    }

    return candidate.toISOString();
  };

  const handleNewEdition = async () => {
    if (!campaignId) return;
    try {
      const scheduledFor = isTrigger ? undefined : getNextScheduledDate();
      const draft = await createEdition(campaignId, { subject: '', htmlContent: '', scheduledFor });
      setEditingEdition(draft);
      setShowEditionEditor(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create edition.';
      alert(msg);
    }
  };

  // Sort editions: by order for trigger campaigns, by scheduledFor for scheduled campaigns
  const sortedEditions = [...editions].sort((a, b) => {
    if (isTrigger) {
      return (a.order ?? 0) - (b.order ?? 0);
    }
    const dateA = a.scheduledFor ? new Date(typeof a.scheduledFor === 'string' ? a.scheduledFor : (a.scheduledFor as any).toDate?.() ?? a.scheduledFor).getTime() : 0;
    const dateB = b.scheduledFor ? new Date(typeof b.scheduledFor === 'string' ? b.scheduledFor : (b.scheduledFor as any).toDate?.() ?? b.scheduledFor).getTime() : 0;
    return dateA - dateB;
  });

  const visibleEditions = sortedEditions.filter(i =>
    showSent ? (i.status === 'sent' || i.status === 'failed') : (i.status !== 'sent' && i.status !== 'failed')
  );

  // Get trigger course name for display
  const triggerCourseName = isTrigger && campaign?.triggerCourseId
    ? courses.find(c => c.id === campaign.triggerCourseId)?.name
    : undefined;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full" role="status" aria-label="Loading campaign">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-red-600" role="alert">{error || t('marketing.detail.campaignNotFound')}</p>
        <button onClick={() => navigate('/admin/marketing')} className="text-indigo-600 hover:underline">
          {t('marketing.detail.backToMarketing')}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto bg-gray-100">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-gray-100 px-4 md:px-8 pt-4 md:pt-8 pb-4">
        <div className="max-w-6xl mx-auto">
          {/* Back + title row */}
          <div className="flex items-center gap-3">
            <Link
              to="/admin/marketing"
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 transition-colors flex-shrink-0"
              aria-label={t('marketing.detail.backToMarketing')}
            >
              <FiArrowLeft size={20} className="rtl-flip" />
            </Link>
            <h1 className="text-3xl font-bold text-gray-800 flex-1 truncate">{campaign.name}</h1>
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-200 transition-colors flex-shrink-0"
              aria-label={t('marketing.detail.campaignSettingsAriaLabel')}
            >
              <FiSettings size={20} />
            </button>
            {campaign.status !== 'archived' && (
              <button
                onClick={() => void handleStatusToggle()}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors shadow-sm flex-shrink-0 ${
                  campaign.status === 'active'
                    ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                    : 'bg-green-100 text-green-800 hover:bg-green-200'
                }`}
                aria-label={campaign.status === 'active' ? t('marketing.detail.pauseCampaign') : t('marketing.detail.resumeCampaign')}
              >
                {campaign.status === 'active'
                  ? <><FiPause size={14} aria-hidden="true" /> {t('marketing.page.pause')}</>
                  : <><FiPlay size={14} aria-hidden="true" /> {t('marketing.page.resume')}</>
                }
              </button>
            )}
          </div>
          {/* Info bar */}
          <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500 pl-9">
            {isTrigger ? (
              <span className="flex items-center gap-1">
                <FiZap size={14} className="text-purple-600" aria-hidden="true" />
                <span className="font-medium text-gray-700">{t('marketing.detail.trigger')}:</span>{' '}
                {campaign.triggerType === 'course_completion'
                  ? `${t('marketing.detail.onCourseCompletion')}${triggerCourseName ? ` (${triggerCourseName})` : ''}`
                  : campaign.triggerType === 'course_enrollment'
                  ? `${t('marketing.detail.onCourseEnrollment')}${triggerCourseName ? ` (${triggerCourseName})` : ''}`
                  : t('marketing.detail.onRegistration')}
              </span>
            ) : (
              <span><span className="font-medium text-gray-700">{t('marketing.detail.recipients')}:</span> {RECIPIENT_LABELS[campaign.recipientGroup]}</span>
            )}
            <span><span className="font-medium text-gray-700">{t('marketing.detail.schedule')}:</span> {getCampaignInfoLabel(campaign)}</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
              campaign.status === 'active' ? 'bg-green-100 text-green-800'
              : campaign.status === 'paused' ? 'bg-yellow-100 text-yellow-800'
              : 'bg-gray-100 text-gray-600'
            }`}>
              {campaign.status}
            </span>
          </div>
        </div>
      </div>

      {/* Editions list */}
      <div className="px-4 md:px-8 py-6">
        <div className="max-w-6xl mx-auto">
          <div className="mt-4 flex flex-col sm:flex-row sm:justify-end gap-2 w-full mb-4">
            <button
              onClick={() => setShowSent(v => !v)}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center gap-2 transition-colors text-sm w-full sm:w-auto"
              aria-label={showSent ? t('marketing.detail.viewActiveAriaLabel') : t('marketing.detail.viewSentAriaLabel')}
            >
              <FiArchive size={16} aria-hidden="true" />
              {showSent ? t('marketing.detail.viewActive') : t('marketing.detail.viewSent')}
            </button>
            <button
              onClick={() => void handleNewEdition()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center gap-2 transition-colors w-full sm:w-auto"
              aria-label={t('marketing.detail.newEditionAriaLabel')}
            >
              <FiPlus size={18} aria-hidden="true" /> {t('marketing.detail.newEdition')}
            </button>
          </div>

          {visibleEditions.length === 0 && (
            <div className="text-center py-16">
              <FiMail className="mx-auto text-gray-300 mb-4" size={48} aria-hidden="true" />
              <p className="text-gray-500">
                {showSent ? t('marketing.detail.noSentEditions') : t('marketing.detail.noActiveEditions')}
              </p>
              {!showSent && (
                <p className="text-gray-400 text-sm mt-1">{t('marketing.detail.noEditionsHint')}</p>
              )}
            </div>
          )}

          {visibleEditions.length > 0 && (
            <ul className="space-y-3" aria-label="Editions list">
              {visibleEditions.map((edition, idx) => (
                <li
                  key={edition.id}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-start justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isTrigger && (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex-shrink-0" aria-label={`Edition number ${edition.order ?? idx + 1}`}>
                          #{edition.order ?? idx + 1}
                        </span>
                      )}
                      <span className="font-medium text-gray-900 truncate">
                        {edition.title || edition.subject ? replaceVars(edition.title || edition.subject || '') : <em className="text-gray-400">{t('marketing.detail.noTitle')}</em>}
                      </span>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[edition.status]}`}
                        aria-label={`Status: ${STATUS_LABEL[edition.status]}`}
                      >
                        {STATUS_LABEL[edition.status]}
                      </span>
                    </div>
                    {/* Send date or order info */}
                    <div className="flex flex-wrap gap-4 mt-1 text-xs text-gray-500">
                      {isTrigger ? (
                        <span className="text-gray-400">{t('marketing.detail.editionInSequence', { number: edition.order ?? idx + 1 })}</span>
                      ) : (
                        <>
                          {edition.scheduledFor && edition.status !== 'sent' && (
                            <span className="flex items-center gap-1">
                              <FiCalendar size={11} aria-hidden="true" />
                              {t('marketing.detail.sendDate')}: <span className="font-medium text-gray-700">{formatDate(edition.scheduledFor)}</span>
                            </span>
                          )}
                          {!edition.scheduledFor && edition.status === 'draft' && (
                            <span className="text-gray-400 italic">{t('marketing.detail.noSendDateSet')}</span>
                          )}
                        </>
                      )}
                      {edition.status === 'sent' && (
                        <>
                          <span className="flex items-center gap-1">
                            <FiCalendar size={11} aria-hidden="true" />
                            {t('marketing.detail.sent')}: <span className="font-medium text-gray-700">{formatDate(edition.sentAt)}</span>
                          </span>
                          <span aria-label={`${edition.successCount} of ${edition.totalRecipients} delivered`}>
                            {t('marketing.detail.deliveredCount', { successCount: edition.successCount, totalRecipients: edition.totalRecipients })}
                            {edition.failCount > 0 && ` · ${t('marketing.detail.failedCount', { failCount: edition.failCount })}`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Edition actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Reorder arrows for trigger campaigns (non-sent editions only) */}
                    {isTrigger && edition.status !== 'sent' && edition.status !== 'sending' && (
                      <>
                        <button
                          onClick={() => void handleReorder(edition, 'up')}
                          disabled={reorderingId === edition.id || idx === 0}
                          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label={`Move edition ${edition.order ?? idx + 1} up`}
                          title={t('marketing.detail.moveUp')}
                        >
                          <FiChevronUp size={16} />
                        </button>
                        <button
                          onClick={() => void handleReorder(edition, 'down')}
                          disabled={reorderingId === edition.id || idx === visibleEditions.length - 1}
                          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label={`Move edition ${edition.order ?? idx + 1} down`}
                          title={t('marketing.detail.moveDown')}
                        >
                          <FiChevronDown size={16} />
                        </button>
                      </>
                    )}
                    {(edition.status === 'draft' || edition.status === 'scheduled') && (
                      <button
                        onClick={() => { setEditingEdition(edition); setShowEditionEditor(true); }}
                        className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                        aria-label={`Edit edition: ${edition.title || edition.subject}`}
                      >
                        <FiEdit2 size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => setPreviewEdition(edition)}
                      className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                      aria-label={`Preview edition: ${edition.title || edition.subject}`}
                    >
                      <FiEye size={16} />
                    </button>
                    <button
                      onClick={() => void handleTestSend(edition)}
                      className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                      aria-label={`Send test email for: ${edition.subject}`}
                      title={t('marketing.detail.sendTestTitle')}
                    >
                      <FiMail size={16} />
                    </button>
                    {/* Send Now button — hidden for trigger campaigns */}
                    {!isTrigger && edition.status !== 'sent' && edition.status !== 'sending' && (
                      <button
                        onClick={() => void handleSendNow(edition)}
                        disabled={sendingId === edition.id}
                        className="p-2 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
                        aria-label={`Send now: ${edition.subject}`}
                        aria-busy={sendingId === edition.id}
                        title={t('marketing.detail.sendNowTitle')}
                      >
                        <FiSend size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => void handleDuplicate(edition)}
                      className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                      aria-label={`Duplicate edition: ${edition.title || edition.subject}`}
                      title={t('marketing.detail.duplicateTitle')}
                    >
                      <FiCopy size={16} />
                    </button>
                    {edition.status === 'draft' && (
                      <button
                        onClick={() => void handleDeleteEdition(edition)}
                        className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                        aria-label={`Delete edition: ${edition.title || edition.subject}`}
                      >
                        <FiTrash2 size={16} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {showSettingsModal && (
        <CampaignSettingsModal
          campaign={campaign}
          onClose={() => setShowSettingsModal(false)}
          onSave={handleCampaignSaved}
        />
      )}

      {showEditionEditor && campaignId && (
        <EditionEditorModal
          campaignId={campaignId}
          edition={editingEdition}
          onClose={() => { setShowEditionEditor(false); setEditingEdition(null); }}
          onSave={handleEditionSaved}
        />
      )}

      {previewEdition && campaignId && (
        <EditionPreviewModal
          campaignId={campaignId}
          title={previewEdition.title || previewEdition.subject}
          subtitle={previewEdition.subtitle || ''}
          mainText={previewEdition.mainText || ''}
          showLogoInHeader={previewEdition.showLogoInHeader}
          onClose={() => setPreviewEdition(null)}
        />
      )}
    </div>
  );
};

export default CampaignDetailPage;

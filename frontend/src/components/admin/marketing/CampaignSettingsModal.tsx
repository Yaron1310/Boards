import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FiX } from 'react-icons/fi';
import { NewsletterCampaign } from '../../../types';
import { createCampaign, updateCampaign } from '../../../services/geminiService';
import { useData } from '../../../hooks/useData';

interface Props {
  campaign: NewsletterCampaign | null;
  onClose: () => void;
  onSave: (saved: NewsletterCampaign) => void;
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const CampaignSettingsModal: React.FC<Props> = ({ campaign, onClose, onSave }) => {
  const { t } = useTranslation();
  const { organizations, courses } = useData();

  const [name, setName] = useState(campaign?.name ?? '');
  const [campaignType, setCampaignType] = useState<'scheduled' | 'trigger'>(
    campaign?.campaignType ?? 'scheduled'
  );
  const [triggerType, setTriggerType] = useState<'registration' | 'course_enrollment' | 'course_completion'>(
    campaign?.triggerType ?? 'registration'
  );
  const [triggerCourseId, setTriggerCourseId] = useState(campaign?.triggerCourseId ?? '');
  const [recipientGroup, setRecipientGroup] = useState<NewsletterCampaign['recipientGroup']>(
    campaign?.recipientGroup ?? 'all_users'
  );
  const [recipientFilter, setRecipientFilter] = useState(campaign?.recipientFilter ?? '');
  const [frequency, setFrequency] = useState<NewsletterCampaign['frequency']>(
    campaign?.frequency ?? 'weekly'
  );
  const [scheduledDay, setScheduledDay] = useState<number>(campaign?.scheduledDay ?? 0);
  const [scheduledTime, setScheduledTime] = useState(campaign?.scheduledTime ?? '09:00');
  const [autoCreateNextDraft, setAutoCreateNextDraft] = useState(campaign?.autoCreateNextDraft ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset filter when group changes
  useEffect(() => {
    if (recipientGroup === 'all_users') setRecipientFilter('');
  }, [recipientGroup]);

  // When switching to trigger, ensure frequency isn't one_time
  useEffect(() => {
    if (campaignType === 'trigger' && frequency === 'one_time') {
      setFrequency('weekly');
    }
  }, [campaignType, frequency]);

  const isTrigger = campaignType === 'trigger';
  const needsFilter = recipientGroup !== 'all_users';
  const needsSchedule = frequency !== 'one_time';
  const needsCourseSelect = isTrigger && (triggerType === 'course_enrollment' || triggerType === 'course_completion');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError(t('marketing.settings.errorNameRequired')); return; }
    if (needsFilter && !recipientFilter) { setError(t('marketing.settings.errorSelectOrg')); return; }
    if (isTrigger && needsCourseSelect && !triggerCourseId) { setError(t('marketing.settings.errorSelectCourse')); return; }

    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        campaignType,
        recipientGroup,
        recipientFilter: needsFilter ? recipientFilter : undefined,
        frequency,
        scheduledDay: needsSchedule ? scheduledDay : undefined,
        scheduledTime: needsSchedule ? scheduledTime : undefined,
      };

      if (isTrigger) {
        payload.triggerType = triggerType;
        payload.triggerCourseId = needsCourseSelect ? triggerCourseId : undefined;
        payload.autoCreateNextDraft = false;
      } else {
        payload.triggerType = undefined;
        payload.triggerCourseId = undefined;
        payload.autoCreateNextDraft = frequency !== 'one_time' ? autoCreateNextDraft : false;
      }

      let saved: NewsletterCampaign;
      if (campaign) {
        saved = await updateCampaign(campaign.id, payload as Partial<NewsletterCampaign>);
      } else {
        saved = await createCampaign(payload as Parameters<typeof createCampaign>[0]);
      }
      onSave(saved);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save campaign.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const filterOptions = () => {
    if (recipientGroup === 'organization') {
      return organizations.filter(o => o.status !== 'archived' && !o.isPersonal);
    }
    return [];
  };

  const filterLabel = () => {
    if (recipientGroup === 'organization') return t('marketing.settings.selectOrganization');
    return '';
  };

  const activeCourses = courses.filter(c => c.status !== 'archived');

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="campaign-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 id="campaign-modal-title" className="text-xl font-bold text-gray-900">
            {campaign ? t('marketing.settings.editCampaign') : t('marketing.settings.createCampaign')}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label={t('marketing.settings.closeDialogAriaLabel')}
          >
            <FiX size={20} />
          </button>
        </div>

        {/* Body */}
        <form id="campaign-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Campaign Name */}
          <div>
            <label htmlFor="campaign-name" className="block text-sm font-medium text-gray-700 mb-1">
              {t('marketing.settings.campaignName')} <span aria-hidden="true" className="text-red-500">*</span>
            </label>
            <input
              id="campaign-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('marketing.settings.campaignNamePlaceholder')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
              aria-required="true"
            />
          </div>

          {/* Recipients (applies to both campaign types) */}
          <fieldset>
            <legend className="block text-sm font-medium text-gray-700 mb-2">{t('marketing.settings.recipients')}</legend>
            <div className="space-y-2">
              {(
                [
                  { value: 'all_users', label: t('marketing.settings.allUsers') },
                  { value: 'organization', label: t('marketing.settings.byOrganization') },
                ] as { value: NewsletterCampaign['recipientGroup']; label: string }[]
              ).map(opt => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="recipientGroup"
                    value={opt.value}
                    checked={recipientGroup === opt.value}
                    onChange={() => setRecipientGroup(opt.value)}
                    className="text-indigo-600"
                    aria-label={opt.label}
                  />
                  <span className="text-sm text-gray-700">{opt.label}</span>
                </label>
              ))}
            </div>

            {needsFilter && (
              <div className="mt-3">
                <label htmlFor="recipient-filter" className="block text-sm font-medium text-gray-700 mb-1">
                  {filterLabel()} <span aria-hidden="true" className="text-red-500">*</span>
                </label>
                <select
                  id="recipient-filter"
                  value={recipientFilter}
                  onChange={e => setRecipientFilter(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required={needsFilter}
                  aria-required="true"
                >
                  <option value="">{t('marketing.settings.selectPlaceholder')}</option>
                  {filterOptions().map(item => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>
            )}
          </fieldset>

          {/* Campaign Type Toggle */}
          <fieldset>
            <legend className="block text-sm font-medium text-gray-700 mb-2">{t('marketing.settings.campaignType')}</legend>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden" role="radiogroup" aria-label={t('marketing.settings.campaignType')}>
              {([
                { value: 'scheduled' as const, label: t('marketing.settings.scheduled') },
                { value: 'trigger' as const, label: t('marketing.settings.triggerBased') },
              ]).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={campaignType === opt.value}
                  onClick={() => setCampaignType(opt.value)}
                  className={`flex-1 py-2 px-3 text-sm font-medium transition-colors ${
                    campaignType === opt.value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Trigger Event (for trigger campaigns) */}
          {isTrigger && (
            <fieldset>
              <legend className="block text-sm font-medium text-gray-700 mb-2">{t('marketing.settings.triggerEvent')}</legend>
              <div className="space-y-2">
                {([
                  { value: 'registration' as const, label: t('marketing.settings.onUserRegistration') },
                  { value: 'course_enrollment' as const, label: t('marketing.settings.onCourseEnrollment') },
                  { value: 'course_completion' as const, label: t('marketing.settings.onCourseCompletion') },
                ] as const).map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="triggerType"
                      value={opt.value}
                      checked={triggerType === opt.value}
                      onChange={() => setTriggerType(opt.value)}
                      className="text-indigo-600"
                      aria-label={opt.label}
                    />
                    <span className="text-sm text-gray-700">{opt.label}</span>
                  </label>
                ))}
              </div>

              {needsCourseSelect && (
                <div className="mt-3">
                  <label htmlFor="trigger-course" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('marketing.settings.selectCourse')} <span aria-hidden="true" className="text-red-500">*</span>
                  </label>
                  <select
                    id="trigger-course"
                    value={triggerCourseId}
                    onChange={e => setTriggerCourseId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                    aria-required="true"
                  >
                    <option value="">{t('marketing.settings.selectPlaceholder')}</option>
                    {activeCourses.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </fieldset>
          )}

          {/* Frequency */}
          <div>
            <label htmlFor="frequency" className="block text-sm font-medium text-gray-700 mb-1">{t('marketing.settings.frequency')}</label>
            <select
              id="frequency"
              value={frequency}
              onChange={e => setFrequency(e.target.value as NewsletterCampaign['frequency'])}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {!isTrigger && <option value="one_time">{t('marketing.settings.oneTime')}</option>}
              <option value="weekly">{t('marketing.settings.weekly')}</option>
              <option value="biweekly">{t('marketing.settings.biweekly')}</option>
              <option value="monthly">{t('marketing.settings.monthly')}</option>
            </select>
          </div>

          {/* Schedule (conditional) */}
          {needsSchedule && (
            <div className="space-y-3">
              {frequency === 'monthly' ? (
                <div>
                  <label htmlFor="scheduled-day-month" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('marketing.settings.dayOfMonth')}
                  </label>
                  <input
                    id="scheduled-day-month"
                    type="number"
                    min={1}
                    max={28}
                    value={scheduledDay}
                    onChange={e => setScheduledDay(Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    aria-label="Day of month for monthly schedule"
                  />
                </div>
              ) : (
                <div>
                  <label htmlFor="scheduled-day-week" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('marketing.settings.dayOfWeek')}
                  </label>
                  <select
                    id="scheduled-day-week"
                    value={scheduledDay}
                    onChange={e => setScheduledDay(Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    aria-label="Day of week for weekly or biweekly schedule"
                  >
                    {DAYS_OF_WEEK.map((d, i) => (
                      <option key={d} value={i}>{d}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label htmlFor="scheduled-time" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('marketing.settings.sendTime')}
                </label>
                <input
                  id="scheduled-time"
                  type="time"
                  value={scheduledTime}
                  onChange={e => setScheduledTime(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  aria-label="Scheduled send time"
                />
              </div>

              {/* Auto-create next draft toggle (scheduled campaigns only) */}
              {!isTrigger && (
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={autoCreateNextDraft}
                      onChange={e => setAutoCreateNextDraft(e.target.checked)}
                      className="sr-only"
                      aria-label="Automatically create next draft after sending"
                    />
                    <div
                      className={`w-11 h-6 rounded-full transition-colors ${autoCreateNextDraft ? 'bg-indigo-600' : 'bg-gray-300'}`}
                      aria-hidden="true"
                    />
                    <div
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${autoCreateNextDraft ? 'translate-x-5' : 'translate-x-0'}`}
                      aria-hidden="true"
                    />
                  </div>
                  <span className="text-sm text-gray-700">{t('marketing.settings.autoCreateNextDraft')}</span>
                </label>
              )}
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
              {error}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="campaign-form"
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            aria-busy={saving}
          >
            {saving ? t('marketing.settings.saving') : (campaign ? t('marketing.settings.saveChanges') : t('marketing.settings.createCampaign'))}
          </button>
        </div>
      </div>
    </div>
  );

  const modalRoot = document.getElementById('modal-root');
  return modalRoot ? ReactDOM.createPortal(modalContent, modalRoot) : modalContent;
};

export default CampaignSettingsModal;

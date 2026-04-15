import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ReactDOM from 'react-dom';
import { AcademySettings } from '../../types';
import { useData } from '../../hooks/useData';

interface AcademyProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AcademySettings | null;
}

const AcademyProfileEditModal: React.FC<AcademyProfileEditModalProps> = ({ isOpen, onClose, settings }) => {
  const { t } = useTranslation();
  const { updateAcademySettings } = useData();
  const [formData, setFormData] = useState<Partial<AcademySettings>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

    useEffect(() => {
    if (settings) {
      setFormData({
        appName: settings.appName,
        description: settings.description || '',
        contactEmail: settings.contactEmail || '',
        contactPhone: settings.contactPhone || '',
        website: settings.website || '',
        socialMedia: {
          twitter: settings.socialMedia?.twitter || '',
          linkedin: settings.socialMedia?.linkedin || '',
          facebook: settings.socialMedia?.facebook || '',
          instagram: settings.socialMedia?.instagram || '',
        },
      });
    }
  }, [settings]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSocialChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      socialMedia: {
        ...prev.socialMedia,
        [name]: value,
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setIsSaving(true);
    try {
      await updateAcademySettings(formData);
      onClose();
    } catch (error) {
      setSaveError('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
      <div className="bg-white rounded-lg shadow-xl flex flex-col max-w-2xl w-full max-h-[90vh]">
        <div className="p-6 border-b">
          <h2 className="text-2xl font-bold">{t('admin.editPublicInformation')}</h2>
        </div>
        <form id="organization-profile-form" onSubmit={handleSubmit} className="flex-grow overflow-y-auto p-6">
          {saveError && (
            <div id="organization-profile-save-error" role="alert" className="mb-4 p-3 bg-red-100 text-red-700 rounded-md border border-red-300 text-sm">
              {saveError}
            </div>
          )}
          <p className="text-xs text-gray-500 mb-4">{t('checkout.requiredFieldsNote')}</p>
          <div className="space-y-4">
            <div>
              <label htmlFor="appName" className="block text-sm font-medium text-gray-700">{t('admin.academyDisplayName')} <span aria-hidden="true">*</span></label>
              <input
                type="text"
                id="appName"
                name="appName"
                required
                aria-required="true"
                aria-describedby={saveError ? 'organization-profile-save-error' : undefined}
                className="mt-1 block w-full rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-black p-2 border border-gray-300"
                value={formData.appName || ''}
                onChange={handleChange}
              />
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700">{t('admin.descriptionMission')}</label>
              <textarea
                id="description"
                name="description"
                rows={4}
                className="mt-1 block w-full rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-black p-2 border border-gray-300"
                value={formData.description || ''}
                onChange={handleChange}
              />
            </div>
            <div>
              <label htmlFor="contactEmail" className="block text-sm font-medium text-gray-700">{t('admin.contactEmail')}</label>
              <input
                type="email"
                id="contactEmail"
                name="contactEmail"
                className="mt-1 block w-full rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-black p-2 border border-gray-300"
                value={formData.contactEmail || ''}
                onChange={handleChange}
              />
            </div>
            <div>
              <label htmlFor="contactPhone" className="block text-sm font-medium text-gray-700">{t('admin.contactPhone')}</label>
              <input
                type="text"
                id="contactPhone"
                name="contactPhone"
                className="mt-1 block w-full rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-black p-2 border border-gray-300"
                value={formData.contactPhone || ''}
                onChange={handleChange}
              />
            </div>
            <div>
              <label htmlFor="website" className="block text-sm font-medium text-gray-700">{t('admin.officialWebsite')}</label>
              <input
                type="url"
                id="website"
                name="website"
                className="mt-1 block w-full rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-black p-2 border border-gray-300"
                value={formData.website || ''}
                onChange={handleChange}
              />
            </div>

            <h3 className="text-lg font-medium pt-4 border-t mt-6">{t('admin.socialMediaLinks')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                  <label htmlFor="twitter" className="block text-sm font-medium text-gray-700">{t('admin.twitterUrl')}</label>
                  <input type="url" id="twitter" name="twitter" className="mt-1 block w-full rounded-md shadow-sm text-black p-2 border border-gray-300" value={formData.socialMedia?.twitter || ''} onChange={handleSocialChange} />
                </div>
                <div>
                  <label htmlFor="linkedin" className="block text-sm font-medium text-gray-700">{t('admin.linkedinUrl')}</label>
                  <input type="url" id="linkedin" name="linkedin" className="mt-1 block w-full rounded-md shadow-sm text-black p-2 border border-gray-300" value={formData.socialMedia?.linkedin || ''} onChange={handleSocialChange} />
                </div>
                <div>
                  <label htmlFor="facebook" className="block text-sm font-medium text-gray-700">{t('admin.facebookUrl')}</label>
                  <input type="url" id="facebook" name="facebook" className="mt-1 block w-full rounded-md shadow-sm text-black p-2 border border-gray-300" value={formData.socialMedia?.facebook || ''} onChange={handleSocialChange} />
                </div>
                <div>
                  <label htmlFor="instagram" className="block text-sm font-medium text-gray-700">{t('admin.instagramUrl')}</label>
                  <input type="url" id="instagram" name="instagram" className="mt-1 block w-full rounded-md shadow-sm text-black p-2 border border-gray-300" value={formData.socialMedia?.instagram || ''} onChange={handleSocialChange} />
                </div>
            </div>
          </div>

          </form>
        <div className="p-6 border-t flex justify-end space-x-3">
            <button type="button" onClick={onClose} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300">
              {t('common.cancel')}
            </button>
            <button type="submit" form="organization-profile-form" disabled={isSaving} className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-blue-300">
              {isSaving ? t('common.saving') : t('common.saveChanges')}
            </button>
          </div>
      </div>
    </div>,
    document.getElementById('modal-root')!
  );
};

export default AcademyProfileEditModal;

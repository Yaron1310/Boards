import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactDOM from 'react-dom';
import { FiArchive, FiRefreshCw, FiLoader } from 'react-icons/fi';
import { ModalWrapper } from '../course/billing/Shared';

interface ArchiveItem {
  id: string;
  name: string;
  updatedAt?: Date;
}

interface ArchiveRestoreModalProps<T extends ArchiveItem> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: T[];
  onRestore: (id: string) => Promise<boolean>;
  fetchItems: () => void;
}

const ArchiveRestoreModal = <T extends ArchiveItem>({
  isOpen,
  onClose,
  title,
  items,
  onRestore,
  fetchItems,
}: ArchiveRestoreModalProps<T>) => {
  const { t } = useTranslation();
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchItems();
    }
  }, [isOpen, fetchItems]);

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    await onRestore(id);
    setRestoringId(null);
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <ModalWrapper title={title} onClose={onClose} size="max-w-2xl">
      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="text-center text-gray-500 py-8">{t('admin.noArchivedItems')}</p>
        ) : (
          <div className="max-h-96 overflow-y-auto custom-scrollbar pr-2 -mr-2">
            <ul className="space-y-2">
              {items.map(item => (
                <li key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md border">
                  <div>
                    <p className="font-semibold text-gray-800">{item.name}</p>
                    {item.updatedAt && (
                        <p className="text-xs text-gray-500">{t('admin.archivedOn', { date: new Date(item.updatedAt).toLocaleDateString() })}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleRestore(item.id)}
                    disabled={!!restoringId}
                    className="flex items-center px-3 py-1.5 bg-green-100 text-green-700 rounded-md hover:bg-green-200 text-sm font-medium disabled:opacity-50"
                  >
                    {restoringId === item.id ? (
                      <FiLoader className="animate-spin mr-2" />
                    ) : (
                      <FiRefreshCw className="mr-2" />
                    )}
                    {t('common.restore')}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
       <div className="flex justify-end mt-6">
            <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300">
                {t('common.close')}
            </button>
        </div>
    </ModalWrapper>,
    document.getElementById('modal-root')!
  );
};

export default ArchiveRestoreModal;

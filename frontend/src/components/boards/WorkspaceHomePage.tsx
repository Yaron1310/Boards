import React from 'react';
import { Link } from 'react-router-dom';
import { FiBriefcase } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useWorkspacesQuery } from '../../hooks/queries/useOrganizationQueries';

const WorkspaceHomePage: React.FC = () => {
  const { t } = useTranslation();
  const { data: allWorkspaces = [], isLoading } = useWorkspacesQuery();
  const workspaces = allWorkspaces.filter((w) => !w.isPersonal);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64" role="status" aria-label={t('common.loading')}>
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">{t('layout.workspaces')}</h1>
      {workspaces.length === 0 ? (
        <p className="text-gray-500">No WorkHubs found. Create one from the admin panel.</p>
      ) : (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          role="list"
          aria-label="WorkHubs"
        >
          {workspaces.map((ws) => (
            <Link
              key={ws.id}
              to={`/WorkHubs/${ws.id}/boards`}
              role="listitem"
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
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkspaceHomePage;

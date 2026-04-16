import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { FiBriefcase } from 'react-icons/fi';

const WorkspaceHomePage: React.FC = () => {
  const { user } = useAuth();
  const workspaces = user?.workspaces ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Workspaces</h1>
      {workspaces.length === 0 ? (
        <p className="text-gray-500">You are not a member of any workspace.</p>
      ) : (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          role="list"
          aria-label="Workspaces"
        >
          {workspaces.map((ws) => (
            <Link
              key={ws.id}
              to={`/workspaces/${ws.id}/boards`}
              role="listitem"
              aria-label={`Open workspace ${ws.name}`}
              className="flex items-center gap-4 p-5 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md hover:border-indigo-300 transition-all"
            >
              <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                <FiBriefcase className="text-indigo-600" size={20} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-gray-800 truncate">{ws.name}</p>
                {ws.academyName && (
                  <p className="text-xs text-gray-500 truncate">{ws.academyName}</p>
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

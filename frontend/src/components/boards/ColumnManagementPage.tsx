import React from 'react';
import { useColumns } from '../../hooks/queries/useColumnQueries';
import { FiLoader, FiColumns } from 'react-icons/fi';

const ColumnManagementPage: React.FC = () => {
  const { data: columns = [], isLoading, error } = useColumns();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64" role="status" aria-label="Loading columns">
        <FiLoader className="animate-spin h-8 w-8 text-indigo-600" aria-hidden="true" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6" role="alert">
        <p className="text-red-600">Failed to load columns.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Column Management</h1>
        <button
          type="button"
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          aria-label="Add new column"
          onClick={() => {/* AddColumnModal — wired in Phase 7E */}}
        >
          <FiColumns size={16} aria-hidden="true" />
          Add Column
        </button>
      </div>

      {columns.length === 0 ? (
        <p className="text-gray-500">No columns defined yet.</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm" role="grid" aria-label="Column definitions">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200" role="row">
                <th className="px-4 py-3 text-left font-semibold text-gray-700" scope="col">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700" scope="col">Type</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700" scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((col) => (
                <tr key={col.id} role="row" className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-800 font-medium" role="gridcell">{col.name}</td>
                  <td className="px-4 py-3 text-gray-500 capitalize" role="gridcell">{col.type}</td>
                  <td className="px-4 py-3" role="gridcell">
                    <span className="text-xs text-gray-400">Edit / Delete — Phase 7E</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ColumnManagementPage;

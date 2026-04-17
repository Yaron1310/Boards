import React from 'react';
import { FiGrid } from 'react-icons/fi';

const DashboardPage: React.FC = () => (
  <main
    className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4"
    aria-label="Dashboard page"
  >
    <FiGrid className="w-12 h-12 text-indigo-400 mb-4" aria-hidden="true" />
    <h1 className="text-2xl font-semibold text-gray-800 mb-2">Dashboard</h1>
    <p className="text-gray-500">Analytics widgets coming in Phase 8C.</p>
  </main>
);

export default DashboardPage;

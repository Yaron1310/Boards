import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { UserRole } from '../../types';
import { debugLog } from '../../config';

interface ProtectedRouteProps {
  children: JSX.Element;
  allowedRoles: UserRole[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { user, loading, selectedOrganization } = useAuth();
  const location = useLocation();

  debugLog(`%c[ProtectedRoute] Check for path: ${location.pathname}`, 'color: #8A2BE2; font-weight: bold;');
  debugLog(`[ProtectedRoute] User Role: ${user?.role}`);
  debugLog(`[ProtectedRoute] Allowed Roles: [${allowedRoles.join(', ')}]`);


  if (loading) {
    debugLog('[ProtectedRoute] Auth is loading...');
    return <div className="flex justify-center items-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div></div>;
  }

  if (!user || !selectedOrganization) {
    debugLog('%c[ProtectedRoute] No user or selected org. Redirecting to /login.', 'color: red;');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const isAllowed = allowedRoles.includes(user.role);
  debugLog(`[ProtectedRoute] Is user role "${user.role}" in allowed roles? ${isAllowed}`);


  if (!isAllowed) {
    debugLog(`%c[ProtectedRoute] Role NOT allowed. Redirecting to /dashboard.`, 'color: red;');
    return <Navigate to="/dashboard" state={{ from: location }} replace />; 
  }

  debugLog(`%c[ProtectedRoute] Role allowed. Rendering component for path: ${location.pathname}`, 'color: green;');
  return children;
};

export default ProtectedRoute;

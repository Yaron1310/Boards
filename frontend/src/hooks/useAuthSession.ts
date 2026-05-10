import { useContext } from 'react';
import { AuthSessionContext } from '../contexts/AuthContext';

/**
 * Session-only auth hook — returns stable identity data (user, token,
 * selectedWorkspace) and session methods (logout, updateAuthUser, etc.).
 * This context value only changes on login/logout, so components using it
 * will NOT re-render when loading, authError, or contextSelectionMode change.
 */
export const useAuthSession = () => {
  const session = useContext(AuthSessionContext);
  if (!session) {
    throw new Error('useAuthSession must be used within an AuthProvider');
  }
  return session;
};

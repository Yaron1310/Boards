import { useContext } from 'react';
import { AuthSessionContext, AuthUIContext } from '../contexts/AuthContext';

/**
 * Full auth hook — returns session + UI state merged together.
 * Use this in components that need both (login page, layout, protected routes).
 * Components that only need stable identity data should use useAuthSession()
 * to avoid re-rendering on loading/authError changes.
 */
export const useAuth = () => {
  const session = useContext(AuthSessionContext);
  const ui = useContext(AuthUIContext);
  if (!session || !ui) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return { ...session, ...ui };
};

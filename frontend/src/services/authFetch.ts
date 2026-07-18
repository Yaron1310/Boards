import { BACKEND_API_URL } from '../constants';

export const AUTH_TOKEN_STORAGE_KEY = 'authJwt';
export const REFRESH_TOKEN_STORAGE_KEY = 'authRefreshToken';

const handleAuthError = () => {
  if (!(window as Window & { isLoggingOut?: boolean }).isLoggingOut) {
    window.dispatchEvent(new CustomEvent('session-expired'));
  }
};

// Deduplicates concurrent 401s during a burst of parallel requests so only
// one refresh call hits the backend; every caller awaits the same promise.
let refreshPromise: Promise<boolean> | null = null;

const performRefresh = async (): Promise<boolean> => {
  const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  if (!storedRefreshToken) return false;

  try {
    const response = await fetch(`${BACKEND_API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: storedRefreshToken }),
      credentials: 'include',
    });
    if (!response.ok) return false;

    const data = await response.json();
    if (!data.accessToken || !data.refreshToken) return false;

    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, data.accessToken);
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, data.refreshToken);
    return true;
  } catch {
    return false;
  }
};

const tryRefresh = (): Promise<boolean> => {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- callers expect the parsed response body untyped, matching the pre-existing fetchWithAuth contract across services
export const fetchWithAuth = async (url: string, options: RequestInit = {}, isRetry = false): Promise<any> => {
  const storedToken = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  const callerHeaders = (options.headers || {}) as Record<string, string>;
  const headers: Record<string, string> = {
    ...callerHeaders,
  };

  if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (storedToken && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${storedToken}`;
  }

  const response = await fetch(`${BACKEND_API_URL}${url}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401) {
    const errorData = await response.json().catch(() => ({ message: '' }));
    const serverMessage = errorData.message || '';
    const isSessionError = !serverMessage || /token|session|expired|unauthorized/i.test(serverMessage);

    if (isSessionError && !isRetry) {
      const refreshed = await tryRefresh();
      if (refreshed) {
        return fetchWithAuth(url, options, true);
      }
    }

    if (isSessionError) handleAuthError();
    const err = new Error(isSessionError ? 'Your session has expired. Please log in again.' : serverMessage) as Error & { status: number };
    err.status = 401;
    throw err;
  }
  if (response.status === 403) {
    const errorData = await response.json().catch(() => ({ message: 'You do not have permission to perform this action.' }));
    const error = new Error(errorData.message) as Error & { status: number; code?: string; orgId?: string };
    error.status = 403;
    if (errorData.code) error.code = errorData.code;
    if (errorData.orgId) error.orgId = errorData.orgId;
    throw error;
  }
  if (!response.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server-defined conflict payload shape varies by endpoint
    let errorData: { message?: string; dependencies?: any };
    try {
      errorData = await response.json();
    } catch {
      errorData = { message: `HTTP error! status: ${response.status}` };
    }
    if (response.status === 409 && errorData.dependencies) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server-defined conflict payload shape varies by endpoint
      const conflictError = new Error(errorData.message || 'Conflict with existing resources.') as Error & { isConflict: boolean; dependencies: any };
      conflictError.isConflict = true;
      conflictError.dependencies = errorData.dependencies;
      throw conflictError;
    }
    const httpErr = new Error(errorData.message || `HTTP error! status: ${response.status}`) as Error & { status: number };
    httpErr.status = response.status;
    throw httpErr;
  }
  if (response.status === 204) return null;
  return response.json();
};

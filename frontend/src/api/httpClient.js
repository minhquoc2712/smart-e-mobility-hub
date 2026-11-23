const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';

const TOKEN_KEY = 'semh_auth_token';
const USER_KEY = 'semh_auth_user';

/** Fired on window when the backend rejects our token; AuthContext listens and signs the user out. */
export const SESSION_EXPIRED_EVENT = 'semh:session-expired';

// Auth endpoints answer 401 for bad credentials; that is a login error, not an expired session.
const AUTH_ENDPOINTS = ['/auth/google', '/auth/dev-login', '/auth/login', '/auth/register'];

export function getStoredToken() {
  // Uses sessionStorage instead of localStorage so session clears automatically when browser closes (safer on shared PCs!)
  return sessionStorage.getItem(TOKEN_KEY);
}

function handleExpiredSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}

function createApiError(message, { code = 'API_ERROR', status = 0 } = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

export async function httpRequest(path, options = {}) {
  const token = getStoredToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch {
    // fetch only rejects when the request never reached the server (backend down, CORS, offline).
    throw createApiError('Cannot reach the server.', { code: 'NETWORK_ERROR' });
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok || (payload && payload.success === false)) {
    const isAuthEndpoint = AUTH_ENDPOINTS.some((endpoint) => path.startsWith(endpoint));
    if (response.status === 401 && token && !isAuthEndpoint) {
      handleExpiredSession();
    }
    throw createApiError(payload?.error?.message || `HTTP Error ${response.status}`, {
      code: payload?.error?.code || 'API_ERROR',
      status: response.status,
    });
  }

  return payload?.data !== undefined ? payload.data : payload;
}

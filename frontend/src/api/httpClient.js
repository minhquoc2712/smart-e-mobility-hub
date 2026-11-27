function resolveApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';
  if (typeof window === 'undefined') return configured;

  const currentHost = window.location.hostname;
  if (
    currentHost &&
    currentHost !== 'localhost' &&
    currentHost !== '127.0.0.1' &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(configured)
  ) {
    return configured.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)/i, `$1${currentHost}`);
  }
  return configured;
}

const API_BASE_URL = resolveApiBaseUrl();

const TOKEN_KEY = 'semh_auth_token';
const USER_KEY = 'semh_auth_user';

/** Fired on window when the backend rejects our token; AuthContext listens and signs the user out. */
export const SESSION_EXPIRED_EVENT = 'semh:session-expired';

const AUTH_ENDPOINTS = ['/auth/google', '/auth/dev-login', '/auth/login', '/auth/register'];

export function getStoredToken() {
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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';

export function getStoredToken() {
  // Uses sessionStorage instead of localStorage so session clears automatically when browser closes (safer on shared PCs!)
  return sessionStorage.getItem('semh_auth_token');
}

export async function httpRequest(path, options = {}) {
  const token = getStoredToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || (payload && payload.success === false)) {
    const message = payload?.error?.message || `HTTP Error ${response.status}`;
    const error = new Error(message);
    error.code = payload?.error?.code || 'API_ERROR';
    error.status = response.status;
    throw error;
  }

  return payload?.data !== undefined ? payload.data : payload;
}

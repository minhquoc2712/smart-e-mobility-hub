import React from 'react';

/** Turns an API error (see api/httpClient.js) into a message a user can act on. */
export function describeApiError(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (error.code === 'NETWORK_ERROR') return 'Cannot reach the server. Check that the backend is running and try again.';
  if (error.status === 403) return 'You do not have permission to view this content.';
  if (error.status === 404) return error.message || 'The requested item could not be found.';
  if (error.status >= 500) return 'The server ran into a problem. Please try again in a moment.';
  return error.message || fallback;
}

/** Shared error box with an optional "Try again" button. */
export function ErrorState({ error, title = 'Unable to load data', onRetry, inline = false }) {
  return (
    <div className={`state-view state-view--error${inline ? ' state-view--inline' : ''}`} role="alert">
      <div>
        {!inline && <strong className="state-view__title">{title}</strong>}
        <p className="state-view__message">{describeApiError(error)}</p>
      </div>
      {onRetry && (
        <button type="button" className="state-view__action" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

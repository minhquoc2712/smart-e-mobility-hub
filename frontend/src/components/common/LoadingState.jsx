import React from 'react';

/** Shared loading indicator. `inline` renders a compact version for use inside cards/tables. */
export function LoadingState({ message = 'Loading…', inline = false }) {
  return (
    <div className={`state-view state-view--loading${inline ? ' state-view--inline' : ''}`} role="status" aria-live="polite">
      <span className="state-spinner" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

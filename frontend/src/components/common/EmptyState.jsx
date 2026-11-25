import React from 'react';

/** Shared "nothing here yet" box. Pass `action` (a button/link element) to suggest a next step. */
export function EmptyState({ title = 'Nothing to show yet', message, action }) {
  return (
    <div className="state-view state-view--empty">
      <div>
        <strong className="state-view__title">{title}</strong>
        {message && <p className="state-view__message">{message}</p>}
      </div>
      {action}
    </div>
  );
}

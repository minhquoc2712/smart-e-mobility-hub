import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * Shown once after a Google sign-in that created a new account
 * (LoginPage navigates with state.accountCreated = true).
 */
export function AccountCreatedBanner() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  if (!location.state?.accountCreated) return null;

  const dismiss = () => navigate(location.pathname + location.search, { replace: true, state: {} });

  return (
    <div className="state-view state-view--success" role="status">
      <div>
        <strong className="state-view__title">Welcome{user?.fullName ? `, ${user.fullName}` : ''}!</strong>
        <p className="state-view__message">
          Your account was created with Google ({user?.email}). Next time, just sign in with the same Google account.
        </p>
      </div>
      <button type="button" className="state-view__action" onClick={dismiss}>
        Got it
      </button>
    </div>
  );
}

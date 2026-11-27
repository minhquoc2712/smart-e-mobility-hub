import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ThemeToggleButton } from '../../context/ThemeContext';
import { VnuLogo } from '../../components/common/VnuLogo';
import logo from '../../components/common/images/logo.png';
import campusBg from '../../components/common/images/vnu-campus-bg.jpg';

const DEMO_ACCOUNTS = [
  {
    label: 'Student',
    email: 'student@hcmut.edu.vn',
    roleTag: 'USER',
  },
  {
    label: 'Private EV',
    email: 'ev.owner@hcmut.edu.vn',
    roleTag: 'USER',
  },
  {
    label: 'Operator',
    email: 'operator@hcmut.edu.vn',
    roleTag: 'STAFF',
  },
  {
    label: 'Lead Staff',
    email: 'matranminhquoc000@gmail.com',
    roleTag: 'STAFF',
  },
];

const DEMO_PASS_TOKEN = 'vnu-demo-2026';

function EyeIcon({ visible }) {
  if (visible) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function LoginPage() {
  const {
    loginWithGoogleCredential,
    registerWithPassword,
    loginWithPassword,
    loginDemo,
  } = useAuth();
  const navigate = useNavigate();
  const googleButtonRef = useRef(null);

  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [filledDemoEmail, setFilledDemoEmail] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const rawClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const hasRealGoogleClientId =
    Boolean(rawClientId) && !rawClientId.startsWith('your-google-oauth-client-id');

  useEffect(() => {
    if (!hasRealGoogleClientId) return;
    const scriptId = 'google-gsi-client';
    const initializeGsi = () => {
      if (window.google?.accounts?.id && googleButtonRef.current) {
        window.google.accounts.id.initialize({
          client_id: rawClientId,
          callback: async (response) => {
            try {
              setLoading(true);
              const { user, isNewUser } = await loginWithGoogleCredential(response.credential);
              navigate(user.role === 'OPERATOR' ? '/operator/dashboard' : '/student/hubs', {
                state: { accountCreated: isNewUser },
              });
            } catch (err) {
              setError(err.message || 'Google authentication failed.');
            } finally {
              setLoading(false);
            }
          },
        });
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          type: 'standard',
          text: mode === 'register' ? 'signup_with' : 'continue_with',
          shape: 'pill',
          theme: 'outline',
          size: 'large',
          width: 320,
        });
      }
    };

    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initializeGsi;
      document.body.appendChild(script);
    } else {
      initializeGsi();
    }
  }, [hasRealGoogleClientId, rawClientId, mode, loginWithGoogleCredential, navigate]);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError('');
    setFilledDemoEmail(null);
    setPassword('');
    setConfirmPassword('');
  };

  const handleQuickFill = (acc) => {
    setMode('login');
    setError('');
    setEmail(acc.email);
    setPassword(DEMO_PASS_TOKEN);
    setFilledDemoEmail(acc.email);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const cleanEmail = email.trim().toLowerCase();

    if (mode === 'register') {
      if (!fullName.trim()) return setError('Please enter your full name.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return setError('Please enter a valid email address.');
      }
      if (password.length < 6) {
        return setError('Password must be at least 6 characters.');
      }
      if (password !== confirmPassword) {
        return setError('Passwords do not match.');
      }
      try {
        setLoading(true);
        const { user } = await registerWithPassword({
          fullName: fullName.trim(),
          email: cleanEmail,
          password,
        });
        navigate(user.role === 'OPERATOR' ? '/operator/dashboard' : '/student/hubs', {
          state: { accountCreated: true },
        });
      } catch (err) {
        setError(err.message || 'Could not create account.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!cleanEmail || !password) {
      return setError('Please enter both your email and password.');
    }

    const isSeededDemo =
      DEMO_ACCOUNTS.some((d) => d.email.toLowerCase() === cleanEmail) &&
      (password === DEMO_PASS_TOKEN || filledDemoEmail === cleanEmail);

    try {
      setLoading(true);
      if (isSeededDemo) {
        const { user } = await loginDemo(cleanEmail);
        navigate(user.role === 'OPERATOR' ? '/operator/dashboard' : '/student/hubs');
        return;
      }

      const { user } = await loginWithPassword(cleanEmail, password);
      navigate(user.role === 'OPERATOR' ? '/operator/dashboard' : '/student/hubs');
    } catch (err) {
      setError(
        err.message ||
          'Invalid email or password. Use a quick-fill campus account below or create a new account.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-portal">
      {/* Blurred VNU-HCM Campus Illustration Backdrop */}
      <div
        className="auth-portal__backdrop"
        style={{ backgroundImage: `url(${campusBg})` }}
        aria-hidden="true"
      />
      <div className="auth-portal__tint" aria-hidden="true" />

      {/* Top Bar with VNU-HCM + Group Logo & Theme Toggle */}
      <header className="auth-portal__topbar">
        <div className="brand-dual">
          <VnuLogo height={34} />
          <span className="brand-dual__divider" aria-hidden="true" />
          <div className="brand-dual__project">
            <img src={logo} alt="Smart E-Mobility Hub logo" />
            <div>
              <strong>Smart E-Mobility Hub</strong>
              <span>VNU-HCM Urban Area Network</span>
            </div>
          </div>
        </div>
        <ThemeToggleButton />
      </header>

      {/* Main Centered Auth Card */}
      <main className="auth-portal__main">
        <div className="auth-card">
          <div className="auth-card__header">
            <span className="auth-card__eyebrow">VNU-HCM ELECTRIC MOBILITY PLATFORM</span>
            <h1>{mode === 'register' ? 'Create your campus account' : 'Sign in to continue'}</h1>
            <p>
              {mode === 'register'
                ? 'Register with your email to rent electric vehicles, reserve parking, and schedule charging.'
                : 'Access real-time electric bikes, scooters, smart charging, and hub telemetry across VNU-HCM.'}
            </p>
          </div>

          {/* Mode Tabs */}
          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => switchMode('login')}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => switchMode('register')}
            >
              Create account
            </button>
          </div>

          {error && (
            <div className="auth-alert" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            {mode === 'register' && (
              <div className="auth-field">
                <label htmlFor="auth-fullname">Full name</label>
                <input
                  id="auth-fullname"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nguyen Van Minh"
                  autoComplete="name"
                  required
                />
              </div>
            )}

            <div className="auth-field">
              <label htmlFor="auth-email">Email address</label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (filledDemoEmail && e.target.value.trim().toLowerCase() !== filledDemoEmail) {
                    setFilledDemoEmail(null);
                  }
                }}
                placeholder="name@hcmut.edu.vn"
                autoComplete="email"
                required
              />
            </div>

            <div className="auth-field">
              <label htmlFor="auth-password">Password</label>
              <div className="auth-password-wrap">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'At least 6 characters' : 'Enter your password'}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  required
                />
                <button
                  type="button"
                  className="auth-eye-btn"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  <EyeIcon visible={showPassword} />
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <div className="auth-field">
                <label htmlFor="auth-confirm">Confirm password</label>
                <div className="auth-password-wrap">
                  <input
                    id="auth-confirm"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="auth-eye-btn"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    title={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    <EyeIcon visible={showConfirmPassword} />
                  </button>
                </div>
              </div>
            )}

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading
                ? mode === 'register'
                  ? 'Creating account...'
                  : 'Signing in...'
                : mode === 'register'
                ? 'Create account'
                : 'Sign in'}
            </button>
          </form>

          {hasRealGoogleClientId && (
            <div className="auth-google-real">
              <div className="auth-divider">
                <span>or continue with Google</span>
              </div>
              <div ref={googleButtonRef} className="auth-google-btn-slot" />
            </div>
          )}

          {/* Quick-Fill Campus Accounts */}
          <div className="auth-quickfill">
            <div className="auth-quickfill__head">
              <span>Quick-fill campus accounts</span>
              <small>Click to fill credentials</small>
            </div>
            <div className="auth-quickfill__grid">
              {DEMO_ACCOUNTS.map((acc) => {
                const isSelected = filledDemoEmail === acc.email && mode === 'login';
                return (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => handleQuickFill(acc)}
                    className={`auth-quickfill__chip ${isSelected ? 'is-selected' : ''}`}
                  >
                    <div className="auth-quickfill__top">
                      <strong>{acc.label}</strong>
                      <span className={`auth-role-pill ${acc.roleTag === 'STAFF' ? 'is-staff' : ''}`}>
                        {acc.roleTag}
                      </span>
                    </div>
                    <span className="auth-quickfill__email">{acc.email}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const GOOGLE_DEMO_ACCOUNTS = [
  {
    name: 'Nguyễn Văn Sinh Viên',
    email: 'student@hcmut.edu.vn',
    badge: 'Student · Rental & Parking',
    role: 'CUSTOMER',
    color: '#22c55e',
  },
  {
    name: 'Trần Thị Chủ Xe Điện',
    email: 'ev.owner@hcmut.edu.vn',
    badge: 'Private EV Owner · 59-MĐ1 123.45',
    role: 'CUSTOMER',
    color: '#0ea5e9',
  },
  {
    name: 'Mã Trần Minh Quốc',
    email: 'matranminhquoc000@gmail.com',
    badge: 'Hub Operator · Staff Console',
    role: 'STAFF',
    color: '#2b581c',
  },
  {
    name: 'Lê Điều Phối Viên',
    email: 'operator@hcmut.edu.vn',
    badge: 'Hub Operator · Staff ST-014',
    role: 'STAFF',
    color: '#7c3aed',
  },
];

function GoogleLogoSvg({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function ScooterChargerIllustration() {
  return (
    <svg
      width="230"
      height="150"
      viewBox="0 0 260 170"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ position: 'fixed', left: 48, bottom: 32, pointerEvents: 'none', zIndex: 1 }}
    >
      {/* Charging station */}
      <rect x="18" y="34" width="52" height="106" rx="8" fill="#34c759" stroke="#24532b" strokeWidth="2.5" />
      <rect x="25" y="25" width="12" height="10" rx="3" fill="#24532b" />
      <rect x="49" y="25" width="12" height="10" rx="3" fill="#24532b" />
      <rect x="27" y="54" width="34" height="12" rx="3" fill="#eff9eb" stroke="#24532b" strokeWidth="2" />
      <rect x="30" y="57" width="8" height="6" fill="#ef4444" />
      <rect x="39" y="57" width="8" height="6" fill="#f59e0b" />
      <rect x="48" y="57" width="10" height="6" fill="#22c55e" />
      <rect x="12" y="138" width="64" height="7" rx="2" fill="#24532b" />
      {/* Charging cable */}
      <path
        d="M70 96 C86 96, 82 146, 108 148 C134 150, 152 146, 170 132"
        stroke="#24532b"
        strokeWidth="2"
        fill="none"
      />
      {/* Electric scooter */}
      <circle cx="112" cy="128" r="20" fill="#ffffff" stroke="#374151" strokeWidth="6" />
      <circle cx="112" cy="128" r="5" fill="#374151" />
      <circle cx="206" cy="128" r="20" fill="#ffffff" stroke="#374151" strokeWidth="6" />
      <circle cx="206" cy="128" r="5" fill="#374151" />
      <path
        d="M102 114 L145 114 L162 128 L192 128 L178 78 L168 78"
        stroke="#24532b"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M100 112 Q122 96 146 106 L166 124 L190 124 L179 84 L188 82 L198 118"
        fill="#4ade80"
        stroke="#24532b"
        strokeWidth="2.2"
      />
      <rect x="108" y="96" width="38" height="9" rx="4.5" fill="#1f2937" />
      <line x1="173" y1="68" x2="186" y2="72" stroke="#1f2937" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Figma Welcome & Sign in Screens (with Real Google OAuth, Create Account & Interactive Account Chooser)
 */
export function LoginPage() {
  const {
    loginWithGoogleCredential,
    registerWithPassword,
    loginWithPassword,
    loginDemo,
    logout,
  } = useAuth();
  const navigate = useNavigate();
  const googleButtonRef = useRef(null);
  const googleSignupButtonRef = useRef(null);

  const [selectedRole, setSelectedRole] = useState(null); // null -> Welcome, 'CUSTOMER' | 'STAFF' -> Sign in
  const [mode, setMode] = useState('login'); // 'login' | 'register' (customers only)
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('••••••••');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Google Account Picker modal when VITE_GOOGLE_CLIENT_ID is not configured
  const [googleModalOpen, setGoogleModalOpen] = useState(false);
  const [customGoogleEmail, setCustomGoogleEmail] = useState('');

  const rawClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const hasRealGoogleClientId =
    Boolean(rawClientId) && !rawClientId.startsWith('your-google-oauth-client-id');

  useEffect(() => {
    if (!hasRealGoogleClientId || !selectedRole) return;
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
              setError(err.message || 'Google Sign-In failed');
            } finally {
              setLoading(false);
            }
          },
        });
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          type: 'icon',
          shape: 'circle',
          theme: 'outline',
          size: 'large',
        });
        if (googleSignupButtonRef.current) {
          window.google.accounts.id.renderButton(googleSignupButtonRef.current, {
            type: 'standard',
            text: 'signup_with',
            shape: 'pill',
            theme: 'outline',
            size: 'medium',
          });
        }
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
  }, [hasRealGoogleClientId, rawClientId, selectedRole, loginWithGoogleCredential, navigate]);

  const chooseRole = (role) => {
    setSelectedRole(role);
    setMode('login');
    setError('');
    setFullName('');
    setUsername(role === 'STAFF' ? 'operator@hcmut.edu.vn' : 'student@hcmut.edu.vn');
    setPassword('••••••••');
    setConfirmPassword('');
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError('');
    if (nextMode === 'register') {
      setUsername('');
      setPassword('');
      setConfirmPassword('');
    } else {
      setUsername(selectedRole === 'STAFF' ? 'operator@hcmut.edu.vn' : 'student@hcmut.edu.vn');
      setPassword('••••••••');
      setConfirmPassword('');
    }
  };

  const signInWithEmail = async (emailToUse) => {
    try {
      setError('');
      setLoading(true);
      const { user, isNewUser } = await loginDemo(emailToUse);
      setGoogleModalOpen(false);
      navigate(user.role === 'OPERATOR' ? '/operator/dashboard' : '/student/hubs', {
        state: { accountCreated: isNewUser },
      });
    } catch (err) {
      setError(err.message || 'Sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  const performSignIn = async (e) => {
    if (e) e.preventDefault();
    setError('');

    if (mode === 'register') {
      const email = username.trim();
      if (!fullName.trim()) return setError('Please enter your full name.');
      if (!email.includes('@')) return setError('Please enter a valid email address.');
      if (password.length < 6) return setError('Password must be at least 6 characters.');
      if (password !== confirmPassword) return setError('Passwords do not match.');
      try {
        setLoading(true);
        await registerWithPassword({ fullName: fullName.trim(), email, password });
        navigate('/student/hubs', { state: { accountCreated: true } });
      } catch (err) {
        setError(err.message || 'Sign-up failed');
      } finally {
        setLoading(false);
      }
      return;
    }

    const fallbackEmail =
      selectedRole === 'STAFF' ? 'operator@hcmut.edu.vn' : 'student@hcmut.edu.vn';
    const email = username.trim().includes('@') ? username.trim() : fallbackEmail;

    // If user typed a real password (not the demo mask), verify via /auth/login
    if (password && password !== '••••••••') {
      try {
        setLoading(true);
        const { user } = await loginWithPassword(email, password);
        if (selectedRole === 'STAFF' && user.role !== 'OPERATOR') {
          logout();
          setError('This is not a staff account. Staff sign in with Google using their staff email.');
          return;
        }
        navigate(user.role === 'OPERATOR' ? '/operator/dashboard' : '/student/hubs');
      } catch (err) {
        setError(err.message || 'Sign-in failed');
      } finally {
        setLoading(false);
      }
      return;
    }

    await signInWithEmail(email);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#fbfcea',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px',
        position: 'relative',
      }}
    >
      <ScooterChargerIllustration />

      {/* STEP 1: FIGMA WELCOME SCREEN */}
      {!selectedRole ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 28,
            zIndex: 2,
            maxWidth: 520,
            width: '100%',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--font-heading)',
                fontSize: 34,
                fontWeight: 600,
                lineHeight: 1.25,
                color: '#34c759',
              }}
            >
              Welcome to
              <br />
              Smart E-MOBILITY HUB
            </h1>
            <p style={{ margin: '8px 0 0', fontSize: 15, color: '#5c6e54' }}>
              VNU-HCM Campus Electric Bike, Scooter, Parking &amp; Smart Charging Network
            </p>
          </div>

          <div
            style={{
              width: '100%',
              background: '#ffffff',
              borderRadius: 20,
              padding: '36px 40px',
              boxShadow: '0 4px 20px rgba(38, 57, 35, 0.06)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 22,
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 17,
                fontWeight: 600,
                color: '#263923',
                textAlign: 'center',
              }}
            >
              To continue, please select your role
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, width: '100%' }}>
              <button
                type="button"
                onClick={() => chooseRole('CUSTOMER')}
                className="staff-pill-btn"
                style={{
                  flexDirection: 'column',
                  padding: '18px 16px',
                  minHeight: 92,
                  borderRadius: 16,
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 18, fontWeight: 700 }}>🚲 Customer</span>
                <span style={{ fontSize: 12.5, fontWeight: 400, color: '#2b581c' }}>
                  Rent EV · Parking · Charger
                </span>
              </button>

              <button
                type="button"
                onClick={() => chooseRole('STAFF')}
                className="staff-pill-btn"
                style={{
                  flexDirection: 'column',
                  padding: '18px 16px',
                  minHeight: 92,
                  borderRadius: 16,
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 18, fontWeight: 700 }}>🛠️ Staff</span>
                <span style={{ fontSize: 12.5, fontWeight: 400, color: '#2b581c' }}>
                  Monitor · Queue · Dispatch
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* STEP 2: FIGMA SIGN IN SCREEN */
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 22,
            zIndex: 2,
            maxWidth: 420,
            width: '100%',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-heading)',
              fontSize: 32,
              fontWeight: 600,
              color: '#34c759',
            }}
          >
            {selectedRole === 'STAFF' ? 'Hello Staff!!!' : 'Hello Customer!!!'}
          </h1>

          <form
            onSubmit={performSignIn}
            style={{
              width: '100%',
              background: '#ffffff',
              borderRadius: 20,
              padding: '28px 36px 32px',
              boxShadow: '0 4px 20px rgba(38, 57, 35, 0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div
              style={{
                textAlign: 'center',
                fontSize: 18,
                fontWeight: 700,
                color: '#263923',
                marginBottom: 4,
              }}
            >
              {mode === 'register' ? 'Create Account' : 'Log In'}
            </div>

            {error && (
              <div
                style={{
                  background: '#fee2e2',
                  color: '#991b1b',
                  padding: '8px 12px',
                  borderRadius: 10,
                  fontSize: 14,
                }}
              >
                {error}
              </div>
            )}

            {mode === 'register' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="signup-fullname" style={{ fontSize: 14, fontWeight: 700, color: '#263923' }}>
                  Full name:
                </label>
                <input
                  id="signup-fullname"
                  className="staff-field-green"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nguyen Van A"
                  autoComplete="name"
                />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="login-email" style={{ fontSize: 14, fontWeight: 700, color: '#263923' }}>
                Email:
              </label>
              <input
                id="login-email"
                type="email"
                className="staff-field-green"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={
                  selectedRole === 'STAFF' ? 'operator@hcmut.edu.vn' : 'student@hcmut.edu.vn'
                }
                autoComplete="email"
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="login-password" style={{ fontSize: 14, fontWeight: 700, color: '#263923' }}>
                Password:
              </label>
              <input
                id="login-password"
                type="password"
                className="staff-field-green"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              />
            </div>

            {mode === 'register' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="signup-confirm" style={{ fontSize: 14, fontWeight: 700, color: '#263923' }}>
                  Confirm password:
                </label>
                <input
                  id="signup-confirm"
                  type="password"
                  className="staff-field-green"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            )}

            {selectedRole !== 'STAFF' && (
              <div style={{ fontSize: 13.5, color: '#5c6e54', textAlign: 'center' }}>
                {mode === 'register' ? 'Already have an account? ' : "Don't have an account? "}
                <button
                  type="button"
                  onClick={() => switchMode(mode === 'register' ? 'login' : 'register')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    color: '#1b7f4c',
                    fontWeight: 700,
                    fontSize: 13.5,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  {mode === 'register' ? 'Log in' : 'Sign up'}
                </button>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 6,
              }}
            >
              <button
                type="button"
                onClick={() => setSelectedRole(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#697663',
                  fontSize: 14,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                ← Back
              </button>

              <button
                type="submit"
                disabled={loading}
                className="staff-pill-btn"
                style={{ minHeight: 42, padding: '8px 24px', fontSize: 15 }}
              >
                {loading
                  ? mode === 'register'
                    ? 'Creating account...'
                    : 'Signing in...'
                  : mode === 'register'
                  ? 'Create account'
                  : 'Continue'}
              </button>
            </div>
          </form>

          {/* Circular Google Sign-In / Sign-Up Button below card matching Figma */}
          {hasRealGoogleClientId ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div ref={googleButtonRef} />
              <span style={{ fontSize: 13, color: '#5c6e54' }}>
                New here? Create your account with Google.
              </span>
              <div ref={googleSignupButtonRef} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                onClick={() => setGoogleModalOpen(true)}
                disabled={loading}
                title="Sign in or create an account with Google"
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: '50%',
                  border: '1px solid #d1d5db',
                  background: '#ffffff',
                  boxShadow: '0 2px 10px rgba(0, 0, 0, 0.09)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <GoogleLogoSvg size={24} />
              </button>
              <span style={{ fontSize: 12.5, color: '#5c6e54' }}>
                Sign in or create account with Google
              </span>
            </div>
          )}
        </div>
      )}

      {/* GOOGLE ACCOUNT CHOOSER MODAL */}
      {googleModalOpen && (
        <div
          onClick={() => setGoogleModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(17, 24, 39, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 200,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 420,
              background: '#ffffff',
              borderRadius: 20,
              padding: '24px 26px',
              boxShadow: '0 20px 44px rgba(0,0,0,0.22)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <GoogleLogoSvg size={22} />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#4b5563' }}>
                Sign in with Google
              </span>
            </div>

            <div>
              <h3 style={{ margin: 0, fontSize: 21, fontWeight: 600, color: '#111827' }}>
                Choose an account
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#6b7280' }}>
                to continue to <strong style={{ color: '#2b581c' }}>Smart E-Mobility Hub</strong>
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {GOOGLE_DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  disabled={loading}
                  onClick={() => signInWithEmail(acc.email)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    width: '100%',
                    textAlign: 'left',
                    background:
                      (selectedRole === 'STAFF' && acc.role === 'STAFF') ||
                      (selectedRole === 'CUSTOMER' && acc.role === 'CUSTOMER')
                        ? '#f5fbf5'
                        : '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 12,
                    padding: '10px 12px',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background: acc.color,
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: 15,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {acc.name.charAt(0)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>
                      {acc.name}
                    </div>
                    <div style={{ fontSize: 12.5, color: '#4b5563' }}>{acc.email}</div>
                    <div style={{ fontSize: 11.5, color: '#2b581c', fontWeight: 600 }}>
                      {acc.badge}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (customGoogleEmail.trim()) {
                  signInWithEmail(customGoogleEmail.trim());
                }
              }}
              style={{
                display: 'flex',
                gap: 8,
                paddingTop: 8,
                borderTop: '1px solid #f3f4f6',
              }}
            >
              <input
                type="email"
                placeholder="Or enter another Google email..."
                value={customGoogleEmail}
                onChange={(e) => setCustomGoogleEmail(e.target.value)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: '1px solid #d1d5db',
                  fontSize: 13.5,
                  fontFamily: 'inherit',
                }}
              />
              <button
                type="submit"
                className="staff-pill-btn"
                style={{ minHeight: 36, padding: '6px 14px', fontSize: 13.5 }}
              >
                Sign in
              </button>
            </form>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setGoogleModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#6b7280',
                  fontSize: 13.5,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

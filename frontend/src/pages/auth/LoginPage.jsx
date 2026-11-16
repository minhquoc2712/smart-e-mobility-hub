import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

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
 * Figma Welcome & Sign in Screens (Nodes: Welcome & Sign in by Thùy Trang)
 */
export function LoginPage() {
  const { loginWithGoogleCredential, loginDemo } = useAuth();
  const navigate = useNavigate();
  const googleButtonRef = useRef(null);

  const [selectedRole, setSelectedRole] = useState(null); // null -> Welcome, 'CUSTOMER' | 'STAFF' -> Sign in
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('••••••••');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!googleClientId || !selectedRole) return;
    const scriptId = 'google-gsi-client';
    const initializeGsi = () => {
      if (window.google?.accounts?.id && googleButtonRef.current) {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (response) => {
            try {
              setLoading(true);
              const user = await loginWithGoogleCredential(response.credential);
              navigate(user.role === 'OPERATOR' ? '/operator/dashboard' : '/student/hubs');
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
  }, [googleClientId, selectedRole, loginWithGoogleCredential, navigate]);

  const chooseRole = (role) => {
    setSelectedRole(role);
    setError('');
    setUsername(role === 'STAFF' ? 'operator@hcmut.edu.vn' : 'student@hcmut.edu.vn');
  };

  const performSignIn = async (e) => {
    if (e) e.preventDefault();
    const fallbackEmail =
      selectedRole === 'STAFF' ? 'operator@hcmut.edu.vn' : 'student@hcmut.edu.vn';
    const email = username.trim().includes('@') ? username.trim() : fallbackEmail;
    try {
      setError('');
      setLoading(true);
      const user = await loginDemo(email);
      if (selectedRole === 'STAFF' || user.role === 'OPERATOR') {
        navigate('/operator/dashboard');
      } else {
        navigate('/student/hubs');
      }
    } catch (err) {
      setError(err.message || 'Sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#fbfcea',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px',
        position: 'relative',
      }}
    >
      <ScooterChargerIllustration />

      {!selectedRole ? (
        /* ================= FIGMA SCREEN 1: WELCOME ================= */
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 28,
            zIndex: 2,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--font-heading)',
                fontSize: 44,
                fontWeight: 600,
                color: '#34c759',
                lineHeight: 1.25,
              }}
            >
              Welcome to
              <br />
              Smart E-MOBILITY HUB
            </h1>
          </div>

          <div
            style={{
              background: '#ffffff',
              borderRadius: 20,
              padding: '32px 44px',
              boxShadow: '0 4px 20px rgba(38, 57, 35, 0.06)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 18,
              minWidth: 360,
            }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: '#263923',
                marginBottom: 4,
              }}
            >
              To continue, please select your role
            </div>

            <button
              type="button"
              onClick={() => chooseRole('CUSTOMER')}
              style={{
                width: 248,
                height: 50,
                borderRadius: 12,
                border: 'none',
                background: '#cdf4cf',
                color: '#182b20',
                fontSize: 16,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Customer
            </button>

            <button
              type="button"
              onClick={() => chooseRole('STAFF')}
              style={{
                width: 248,
                height: 50,
                borderRadius: 12,
                border: 'none',
                background: '#cdf4cf',
                color: '#182b20',
                fontSize: 16,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Staff
            </button>
          </div>
        </div>
      ) : (
        /* ================= FIGMA SCREEN 2: SIGN IN ================= */
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 22,
            zIndex: 2,
            width: '100%',
            maxWidth: 460,
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
              Log In
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 14, fontWeight: 700, color: '#263923' }}>User name:</label>
              <input
                className="staff-field-green"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={selectedRole === 'STAFF' ? 'operator@hcmut.edu.vn' : 'student@hcmut.edu.vn'}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 14, fontWeight: 700, color: '#263923' }}>Password:</label>
              <input
                type="password"
                className="staff-field-green"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
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
                {loading ? 'Signing in...' : 'Continue'}
              </button>
            </div>
          </form>

          {/* Circular Google Sign-In Button below card matching Figma */}
          {googleClientId ? (
            <div ref={googleButtonRef} />
          ) : (
            <button
              type="button"
              onClick={performSignIn}
              disabled={loading}
              title="Sign in with Google"
              style={{
                width: 54,
                height: 54,
                borderRadius: '50%',
                border: '1px solid #d1d5db',
                background: '#ffffff',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 48 48">
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
            </button>
          )}
        </div>
      )}
    </div>
  );
}

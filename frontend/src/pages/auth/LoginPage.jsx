import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

import logo from '../../components/common/images/logo.jpg';

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
  const location = useLocation();
  const googleButtonRef = useRef(null);

  const [selectedRole, setSelectedRole] = useState(null); // null -> Welcome, 'CUSTOMER' | 'STAFF' -> Sign in
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('••••••••');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const selectedRole = location.state?.role === 'operator' ? 'operator' : 'customer';
  const demoUsername = selectedRole === 'operator'
    ? 'operator@hcmut.edu.vn'
    : 'student@hcmut.edu.vn';

  useEffect(() => {
    if (!googleClientId) {
      setUsername(demoUsername);
      setPassword('demo123');
    }
  }, [demoUsername, googleClientId]);

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

  const handleCredentialLogin = async (event) => {
    event.preventDefault();
    const normalizedUsername = username.trim().toLowerCase();
    const role = normalizedUsername.includes('operator') || normalizedUsername.includes('staff')
      ? 'operator'
      : location.state?.role || 'customer';
    await handleQuickDemoLogin(role === 'operator' ? 'operator@hcmut.edu.vn' : 'student@hcmut.edu.vn');
  };

  const handleGoogleButtonClick = () => {
    const googleButton = googleButtonRef.current?.querySelector('[role="button"]');
    if (googleButton) {
      googleButton.click();
      return;
    }
    window.google?.accounts?.id?.prompt();
  };

  return (
    <div className="auth-page">
      <img className="auth-logo" src={logo} alt="Smart E-MOBILITY HUB logo" />
      <h2 className="auth-brand-title">Hello {selectedRole === 'operator' ? 'staff' : 'customer'}!!!</h2>
      <div className="card auth-card auth-login-card">
        <h3 className="auth-card-title">Log In</h3>
        {error && (
          <div className="auth-error">
            {error}
          </div>
        )}
        <form id="credential-login-form" className="auth-login-form" onSubmit={handleCredentialLogin}>
          <label htmlFor="username" style = {{fontFamily: 'Arbutus'}}>User name:</label>
          <input
            id="username"
            className="auth-login-input"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            disabled={loading}
          />
          <label htmlFor="password" style = {{fontFamily: 'Arbutus'}}>Password:</label>
          <input
            id="password"
            className="auth-login-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={loading}
          />
        </form>
      </div>
      <div className="auth-google-button-wrap">
        <button
          type="button"
          className="auth-google-button"
          onClick={handleGoogleButtonClick}
          disabled={loading}
          aria-label="Log in with Google"
        >
          G
        </button>
        {googleClientId && (
          <div className="auth-google-provider" ref={googleButtonRef} aria-hidden="true" />
        )}
        {!googleClientId && (
          <button
            type="button"
            className="auth-google-demo-link"
            disabled={loading}
            onClick={() => handleQuickDemoLogin('student@hcmut.edu.vn')}
          >
            Demo Google sign-in
          </button>
        )}
      </div>
      <button
        className="auth-login-submit"
        style={{ position: 'absolute', right: '24rem', top: '29rem' }}
        type="submit"
        form="credential-login-form"
        disabled={loading}
        aria-label="Confirm login"
      >
        &rarr;
      </button>
    </div>
  );
}

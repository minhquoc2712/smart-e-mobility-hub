import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

import logo from '../../components/common/images/logo.jpg';

export function LoginPage() {
  const { loginWithGoogleCredential, loginDemo } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const googleButtonRef = useRef(null);
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

  // Dynamically loads Google Identity Services ONLY when VITE_GOOGLE_CLIENT_ID is configured
  useEffect(() => {
    if (!googleClientId) return;

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
          theme: 'outline',
          size: 'large',
          width: 340,
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
  }, [googleClientId, loginWithGoogleCredential, navigate]);

  const handleQuickDemoLogin = async (email) => {
    try {
      setError('');
      setLoading(true);
      const user = await loginDemo(email);
      navigate(user.role === 'OPERATOR' ? '/operator/dashboard' : '/student/hubs');
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

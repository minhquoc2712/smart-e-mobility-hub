import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { IS_MOCK_MODE } from '../../api';

export function LoginPage() {
  const { loginWithGoogleCredential, loginDemo } = useAuth();
  const navigate = useNavigate();
  const googleButtonRef = useRef(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

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

  return (
    <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '90vh' }}>
      <div className="card" style={{ maxWidth: 460, width: '100%', padding: '2rem' }}>
        <h2 style={{ marginTop: 0, textAlign: 'center' }}>HCMUT Account Sign In</h2>
        <p style={{ color: '#556b5d', textAlign: 'center', fontSize: '0.92rem' }}>
          Sign in with Google OAuth 2.0. Operator emails are automatically routed to the Operator Console.
        </p>

        {error && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.6rem 0.8rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.88rem' }}>
            {error}
          </div>
        )}

        {googleClientId ? (
          <div style={{ display: 'flex', justifyContent: 'center', margin: '1.25rem 0' }}>
            <div ref={googleButtonRef} />
          </div>
        ) : (
          <div style={{ background: '#e6f4ea', padding: '0.75rem', borderRadius: 8, fontSize: '0.84rem', marginBottom: '1rem', color: '#182b20' }}>
            <strong>Google OAuth Ready:</strong> Set <code>VITE_GOOGLE_CLIENT_ID</code> in <code>frontend/.env</code> to render the live Google button. On shared/dev machines, use the safe quick-login roles below.
          </div>
        )}

        {(IS_MOCK_MODE || !googleClientId) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginTop: '1rem' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#556b5d', textTransform: 'uppercase' }}>
              Quick Role Sign-In (Mock / Dev Mode)
            </div>
            <button
              type="button"
              disabled={loading}
              className="btn btn-primary"
              onClick={() => handleQuickDemoLogin('student@hcmut.edu.vn')}
            >
              🎓 Sign in as Student (USER)
            </button>
            <button
              type="button"
              disabled={loading}
              className="btn btn-outline"
              onClick={() => handleQuickDemoLogin('ev.owner@hcmut.edu.vn')}
            >
              🛵 Sign in as Private EV Owner (USER)
            </button>
            <button
              type="button"
              disabled={loading}
              className="btn btn-outline"
              onClick={() => handleQuickDemoLogin('operator@hcmut.edu.vn')}
            >
              🛠️ Sign in as Hub Operator (OPERATOR)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

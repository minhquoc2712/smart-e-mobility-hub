import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { IS_MOCK_MODE } from '../../api';
import logo from '../../components/common/images/logo.jpg';

export function WelcomePage() {
  const { isAuthenticated, isOperator, loginDemo } = useAuth();
  const navigate = useNavigate();
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const handleRoleSelection = async (role) => {
    if (isAuthenticated) {
      navigate(isOperator ? '/operator/dashboard' : '/student/hubs');
      return;
    }

    if (googleClientId) {
      navigate('/login', { state: { role } });
      return;
    }

    const user = await loginDemo(role === 'operator' ? 'operator@hcmut.edu.vn' : 'student@hcmut.edu.vn');
    navigate(user.role === 'OPERATOR' ? '/operator/dashboard' : '/student/hubs');
  };

  return (
    <div className="auth-page">
      <img className="auth-logo" src={logo} alt="Smart E-MOBILITY HUB logo" />
      <h2 className="auth-brand-title">Welcome to</h2>
      <h2 className="auth-brand-title">Smart E-MOBILITY HUB</h2>
      <div className="card auth-card">
        <p className="auth-card-prompt">To continue, please select your role</p>
        <div className="auth-role-actions">
          <button type="button" className="auth-role-button" onClick={() => handleRoleSelection('customer')}>
            Customer
          </button>
          <button type="button" className="auth-role-button" onClick={() => handleRoleSelection('operator')}>
            Staff
          </button>
        </div>
      </div>
      {IS_MOCK_MODE && (
        <p className="auth-demo-note">
          Demo mode is enabled
        </p>
      )}
    </div>
  );
}

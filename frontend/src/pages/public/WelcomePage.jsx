import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export function WelcomePage() {
  const { isAuthenticated, isOperator } = useAuth();

  return (
    <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '90vh' }}>
      <div className="card" style={{ maxWidth: 540, width: '100%', textAlign: 'center', padding: '2.5rem 2rem' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🚲⚡</div>
        <p style={{ color: '#1b7f4c', fontWeight: 700, margin: 0, fontSize: '0.9rem' }}>VNU-HCM URBAN AREA</p>
        <h1 style={{ margin: '0.4rem 0 0.75rem', fontSize: '1.85rem' }}>Welcome to Smart E-Mobility Hub</h1>
        <p style={{ color: '#556b5d', marginBottom: '1.75rem' }}>
          Shared electric bicycles, scooters, smart parking slots, and coordinated charging across campuses and Metro Line 1.
        </p>

        {isAuthenticated ? (
          <Link to={isOperator ? '/operator/dashboard' : '/student/hubs'} className="btn btn-primary" style={{ width: '100%' }}>
            Continue to {isOperator ? 'Operator Console' : 'Student Hub Portal'} →
          </Link>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Link to="/login" className="btn btn-primary">
              Sign in with HCMUT / Google Account
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

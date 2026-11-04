import React from 'react';
import { Link } from 'react-router-dom';

export function UnauthorizedPage() {
  return (
    <div className="container" style={{ textAlign: 'center', paddingTop: '4rem' }}>
      <div className="card" style={{ maxWidth: 480, margin: '0 auto' }}>
        <h2>403 — Restricted Area</h2>
        <p style={{ color: '#556b5d' }}>
          Your current account does not have Operator privileges to view this screen.
        </p>
        <Link to="/student/hubs" className="btn btn-primary">
          Back to Student Portal
        </Link>
      </div>
    </div>
  );
}

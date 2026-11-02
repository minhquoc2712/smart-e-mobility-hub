import React from 'react';

export function StatCard({ label, value, subtitle, accentColor = '#1b7f4c' }) {
  return (
    <div className="card" style={{ borderLeft: `4px solid ${accentColor}` }}>
      <div style={{ fontSize: '0.84rem', color: '#556b5d', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0.25rem 0' }}>{value}</div>
      {subtitle && <div style={{ fontSize: '0.8rem', color: '#556b5d' }}>{subtitle}</div>}
    </div>
  );
}

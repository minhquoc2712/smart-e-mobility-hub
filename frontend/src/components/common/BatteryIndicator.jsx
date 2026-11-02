import React from 'react';

export function BatteryIndicator({ percent = 0, rangeKm }) {
  const barColor = percent >= 60 ? '#1b7f4c' : percent >= 30 ? '#d97706' : '#c93b3b';

  return (
    <div style={{ margin: '0.5rem 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', marginBottom: 4 }}>
        <span>Battery: <strong>{percent}%</strong></span>
        {rangeKm !== undefined && <span style={{ color: '#556b5d' }}>~{rangeKm} km</span>}
      </div>
      <div style={{ height: 8, background: '#e5ece7', borderRadius: 999, overflow: 'hidden' }}>
        <div
          style={{
            width: `${Math.min(100, Math.max(0, percent))}%`,
            height: '100%',
            background: barColor,
          }}
        />
      </div>
    </div>
  );
}

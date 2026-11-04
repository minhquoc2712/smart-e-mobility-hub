import React from 'react';

const STATUS_STYLES = {
  AVAILABLE: { background: '#dcfce7', color: '#166534' },
  ACTIVE: { background: '#dcfce7', color: '#166534' },
  CONFIRMED: { background: '#dbeafe', color: '#1e40af' },
  SCHEDULED: { background: '#dbeafe', color: '#1e40af' },
  RESERVED: { background: '#fef3c7', color: '#92400e' },
  NEAR_FULL: { background: '#fef3c7', color: '#92400e' },
  IN_USE: { background: '#e0e7ff', color: '#3730a3' },
  CHARGING: { background: '#cffafe', color: '#155e75' },
  OUT_OF_SERVICE: { background: '#fee2e2', color: '#991b1b' },
  OPEN: { background: '#fee2e2', color: '#991b1b' },
  CANCELLED: { background: '#f3f4f6', color: '#4b5563' },
  COMPLETED: { background: '#e5e7eb', color: '#374151' },
  CLOSED: { background: '#e5e7eb', color: '#374151' },
};

export function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || { background: '#f3f4f6', color: '#374151' };
  return (
    <span className="badge" style={style}>
      {status}
    </span>
  );
}

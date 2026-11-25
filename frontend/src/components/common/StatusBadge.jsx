import React from 'react';

/**
 * Shared status badge. Covers every status value defined in database/schema.sql
 * (vehicles, parking slots, charging points, reservations, charging requests,
 * incidents, dispatch orders, hubs) plus priority/severity levels.
 */
const TONES = {
  success: { background: '#dcfce7', color: '#166534' },
  info: { background: '#dbeafe', color: '#1e40af' },
  warning: { background: '#fef3c7', color: '#92400e' },
  active: { background: '#e0e7ff', color: '#3730a3' },
  charging: { background: '#cffafe', color: '#155e75' },
  danger: { background: '#fee2e2', color: '#991b1b' },
  neutral: { background: '#f3f4f6', color: '#4b5563' },
  done: { background: '#e5e7eb', color: '#374151' },
};

const STATUS_TONES = {
  // Availability
  AVAILABLE: 'success',
  FREE: 'success',
  ACTIVE: 'success',
  RESOLVED: 'success',
  // Booked / planned
  CONFIRMED: 'info',
  SCHEDULED: 'info',
  QUEUED: 'info',
  PENDING: 'warning',
  RESERVED: 'warning',
  NEAR_FULL: 'warning',
  MAINTENANCE: 'warning',
  IN_PROGRESS: 'warning',
  // In use
  IN_USE: 'active',
  OCCUPIED: 'active',
  IN_TRANSIT: 'active',
  CHARGING: 'charging',
  // Problems
  OUT_OF_SERVICE: 'danger',
  OPEN: 'danger',
  FULL: 'danger',
  FAILED: 'danger',
  // Finished
  COMPLETED: 'done',
  CLOSED: 'done',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
  // Priority / severity
  LOW: 'neutral',
  NORMAL: 'info',
  MEDIUM: 'warning',
  HIGH: 'danger',
  URGENT: 'danger',
  CRITICAL: 'danger',
};

const STATUS_LABELS = {
  OUT_OF_SERVICE: 'Out of service',
  IN_USE: 'In use',
  IN_PROGRESS: 'In progress',
  IN_TRANSIT: 'In transit',
  NEAR_FULL: 'Near full',
};

/** Human-readable label for a status code, e.g. "OUT_OF_SERVICE" -> "Out of service". */
export function statusLabel(status) {
  if (!status) return '—';
  const key = String(status).toUpperCase();
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  const text = key.replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function StatusBadge({ status, label }) {
  const key = String(status || '').toUpperCase();
  const style = TONES[STATUS_TONES[key]] || TONES.neutral;
  return (
    <span className="badge" style={style} title={key || undefined}>
      {label || statusLabel(key)}
    </span>
  );
}

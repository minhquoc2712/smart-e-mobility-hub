import React from 'react';

/**
 * Compact 3-step onboarding / operational guide banner (consistent with Hubs & Map)
 */
export function QuickGuideStrip({ steps = [], variant = 'student' }) {
  if (!steps.length) return null;
  return (
    <div
      className={`onboarding-steps-grid quick-guide-strip ${
        variant === 'operator' ? 'quick-guide-strip--operator' : ''
      }`.trim()}
      role="region"
      aria-label="Quick usage guide"
    >
      {steps.map((step, index) => (
        <div className="onboarding-step-card" key={step.title || index}>
          <span className="onboarding-step-num">
            {String(index + 1).padStart(2, '0')}
          </span>
          <div>
            <div className="onboarding-step-title">{step.title}</div>
            <div className="onboarding-step-desc">{step.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Visual 4-Stage Progress Stepper between Student & Operator:
 *   1. Requested (PENDING)
 *   2. Approved (CONFIRMED)
 *   3. Riding / Active (ACTIVE)
 *   4. Completed (COMPLETED)
 * Also renders clear terminal states for Operator Rejected, Student Declined, Cancelled, or Expired.
 */
export function LifecycleStepper({
  status = 'PENDING',
  cancellationSource = null,
  reservationType = 'VEHICLE',
}) {
  const upper = String(status || 'PENDING').toUpperCase();
  const isParking = String(reservationType || 'VEHICLE').toUpperCase() === 'PARKING';

  const stages = isParking
    ? [
        { key: 'PENDING', label: 'Requested' },
        { key: 'CONFIRMED', label: 'Approved' },
        { key: 'ACTIVE', label: 'Parked' },
        { key: 'COMPLETED', label: 'Checked out' },
      ]
    : [
        { key: 'PENDING', label: 'Requested' },
        { key: 'CONFIRMED', label: 'Approved' },
        { key: 'ACTIVE', label: 'QR Riding' },
        { key: 'COMPLETED', label: 'Returned' },
      ];

  const isTerminated = upper === 'CANCELLED' || upper === 'EXPIRED';

  const stageIndex =
    upper === 'PENDING'
      ? 0
      : upper === 'CONFIRMED'
      ? 1
      : upper === 'ACTIVE'
      ? 2
      : upper === 'COMPLETED'
      ? 3
      : 0;

  let terminatedLabel = 'Cancelled by student';
  if (upper === 'EXPIRED') terminatedLabel = 'Hold expired (15m timeout)';
  else if (cancellationSource === 'OPERATOR_REJECTED') terminatedLabel = 'Declined by operator';
  else if (cancellationSource === 'STUDENT_DECLINED') terminatedLabel = 'Declined pickup by student';

  return (
    <div className="lifecycle-stepper-wrap">
      <div className={`lifecycle-stepper ${isTerminated ? 'is-terminated' : ''}`}>
        {stages.map((st, idx) => {
          const isDone = !isTerminated && (idx < stageIndex || upper === 'COMPLETED');
          const isCurrent = !isTerminated && idx === stageIndex && upper !== 'COMPLETED';
          return (
            <React.Fragment key={st.key}>
              <div
                className={`lifecycle-step ${isDone ? 'is-done' : ''} ${
                  isCurrent ? 'is-current' : ''
                }`.trim()}
              >
                <span className="lifecycle-step__dot">
                  {isDone ? '✓' : idx + 1}
                </span>
                <span className="lifecycle-step__label">{st.label}</span>
              </div>
              {idx < stages.length - 1 && (
                <span
                  className={`lifecycle-step__bar ${
                    !isTerminated && idx < stageIndex ? 'is-filled' : ''
                  }`.trim()}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {isTerminated && (
        <div className="lifecycle-terminated-pill">
          <span>✕ {terminatedLabel}</span>
        </div>
      )}
    </div>
  );
}

export function getReadableStatusMeta(reservation) {
  const st = String(reservation?.status || 'PENDING').toUpperCase();
  const src = reservation?.cancellationSource;
  if (st === 'PENDING') {
    return { label: 'PENDING APPROVAL', tone: 'pending', hint: 'Waiting for operator approval' };
  }
  if (st === 'CONFIRMED') {
    return { label: 'APPROVED · READY', tone: 'confirmed', hint: 'Approved by operator — scan QR at hub' };
  }
  if (st === 'ACTIVE') {
    return { label: 'RIDING IN PROGRESS', tone: 'active', hint: 'Vehicle unlocked and active' };
  }
  if (st === 'COMPLETED') {
    return { label: 'COMPLETED', tone: 'completed', hint: 'Returned safely to hub' };
  }
  if (st === 'EXPIRED') {
    return { label: 'EXPIRED', tone: 'expired', hint: '15-minute pickup hold expired' };
  }
  if (src === 'OPERATOR_REJECTED') {
    return { label: 'REJECTED BY OPERATOR', tone: 'rejected', hint: reservation?.statusNote || 'Declined by hub staff' };
  }
  if (src === 'STUDENT_DECLINED') {
    return { label: 'DECLINED AT PICKUP', tone: 'cancelled', hint: 'Student declined vehicle after approval' };
  }
  return { label: 'CANCELLED', tone: 'cancelled', hint: 'Cancelled by student' };
}

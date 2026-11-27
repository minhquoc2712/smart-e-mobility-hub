import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { operatorApi, hubApi, reservationApi } from '../../api';
import { CampusHubMap } from '../../components/common/CampusHubMap';
import { QuickGuideStrip, getReadableStatusMeta } from '../../components/common/QuickGuideStrip';

const OPERATOR_GUIDE = [
  {
    title: 'Review Booking Requests',
    desc: 'Approve or reject incoming student EV & parking reservations in real time.',
  },
  {
    title: 'Inspect Live Campus Map',
    desc: 'Tap any VNU-HCM hub pin to check slot capacity, bikes, scooters, and chargers.',
  },
  {
    title: 'Balance Fleet & Chargers',
    desc: 'Click any hub row to manage parking spaces, charging queues, or vehicle dispatch.',
  },
];

function formatShortWindow(start, end) {
  if (!start) return '—';
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  if (Number.isNaN(s.getTime())) return '—';
  const datePart = s.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const sTime = s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const eTime =
    e && !Number.isNaN(e.getTime())
      ? e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      : '';
  return `${datePart} · ${sTime}${eTime ? `–${eTime}` : ''}`;
}

export function OperatorDashboardPage() {
  const [bundle, setBundle] = useState(null);
  const [geoHubs, setGeoHubs] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [bookingTab, setBookingTab] = useState('PENDING');
  const [actionBusyId, setActionBusyId] = useState(null);
  const [actionToast, setActionToast] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const loadDashboard = useCallback(async () => {
    try {
      setError('');
      const [result, rawHubs, allRes] = await Promise.all([
        operatorApi.getDashboardBundle(),
        hubApi.getHubs().catch(() => []),
        reservationApi.getAllReservations().catch(() => []),
      ]);
      setBundle(result);
      setGeoHubs(Array.isArray(rawHubs) ? rawHubs : []);
      setReservations(Array.isArray(allRes) ? allRes : []);
    } catch (err) {
      setError(err.message || 'Failed to load operator network telemetry.');
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    const timer = setInterval(loadDashboard, 10000);
    return () => clearInterval(timer);
  }, [loadDashboard]);

  const handleApprove = async (resItem) => {
    try {
      setActionBusyId(resItem.id);
      setActionToast('');
      await reservationApi.approveReservation(resItem.id);
      await loadDashboard();
      setActionToast(
        `Approved ${resItem.reservation_code || resItem.reservationCode || `#${resItem.id}`} — Student can now scan QR to unlock.`
      );
    } catch (err) {
      setActionToast(`Error: ${err.message || 'Could not approve reservation.'}`);
    } finally {
      setActionBusyId(null);
    }
  };

  const handleReject = async (resItem) => {
    try {
      setActionBusyId(resItem.id);
      setActionToast('');
      await reservationApi.rejectReservation(resItem.id, 'Declined by hub operator');
      await loadDashboard();
      setActionToast(
        `Rejected ${resItem.reservation_code || resItem.reservationCode || `#${resItem.id}`} — Held resource released back to hub.`
      );
    } catch (err) {
      setActionToast(`Error: ${err.message || 'Could not reject reservation.'}`);
    } finally {
      setActionBusyId(null);
    }
  };

  if (error) {
    return (
      <div className="staff-panel">
        <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>
        <div>
          <button type="button" className="staff-pill-btn" onClick={loadDashboard}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!bundle) {
    return (
      <>
        <h1 className="staff-page-title">Network overview</h1>
        <div className="staff-panel">
          <p style={{ color: 'var(--staff-muted)', margin: 0 }}>Loading network telemetry...</p>
        </div>
      </>
    );
  }

  const { overview, hubUtilization, openIncidents } = bundle;
  const hubs = hubUtilization?.hubs || [];
  const availableFleet = overview?.vehicleStats?.AVAILABLE ?? 0;
  const activeCharging = Math.max(
    overview?.chargingPointsInUse ?? 0,
    overview?.vehicleStats?.CHARGING ?? 0
  );

  const pendingReservations = reservations.filter(
    (r) => String(r.status || '').toUpperCase() === 'PENDING'
  );
  const activeReservations = reservations.filter((r) =>
    ['CONFIRMED', 'ACTIVE'].includes(String(r.status || '').toUpperCase())
  );
  const historyReservations = reservations
    .filter((r) =>
      ['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(String(r.status || '').toUpperCase())
    )
    .slice(0, 8);

  const displayedReservations =
    bookingTab === 'PENDING'
      ? pendingReservations
      : bookingTab === 'ACTIVE'
      ? activeReservations
      : historyReservations;

  const mapHubs = hubs.map((h) => {
    const geo = geoHubs.find((g) => Number(g.id) === Number(h.id));
    return {
      ...h,
      latitude: geo?.latitude ?? h.latitude,
      longitude: geo?.longitude ?? h.longitude,
      availableBikes: geo?.availableBikes ?? null,
      availableScooters: geo?.availableScooters ?? null,
      freeParkingSlots: h.freeSlots ?? geo?.freeParkingSlots ?? 0,
    };
  });

  const formatHubOperationalLabel = (hub) => {
    if (hub.hubStatus === 'MAINTENANCE') return 'Maintenance';
    if (hub.hubStatus === 'FULL') return 'Full';
    if (hub.vehicleStockStatus === 'Low stock') return 'Low stock';
    if (hub.hubStatus === 'NEAR_FULL') return 'Near full';
    return 'Operating';
  };

  return (
    <>
      <h1 className="staff-page-title">Network overview</h1>

      <div style={{ width: '100%', maxWidth: 1140 }}>
        <QuickGuideStrip steps={OPERATOR_GUIDE} variant="operator" />
      </div>

      <div className="staff-panel staff-panel--full" style={{ maxWidth: 1140 }}>
        {/* 4 Prominent KPI Cards with enlarged typography */}
        <div className="staff-kpi-grid staff-kpi-grid--prominent">
          <div className="staff-kpi-card" onClick={() => navigate('/operator/hub-utilization')}>
            <span className="staff-kpi-eyebrow">NETWORK NODES</span>
            <p className="staff-kpi-value">{overview?.totalHubs ?? hubs.length}</p>
            <p className="staff-kpi-label">Campus hubs</p>
          </div>
          <div className="staff-kpi-card" onClick={() => navigate('/operator/manage-parking')}>
            <span className="staff-kpi-eyebrow">READY FLEET</span>
            <p className="staff-kpi-value">{availableFleet}</p>
            <p className="staff-kpi-label">Available vehicles</p>
          </div>
          <div className="staff-kpi-card" onClick={() => navigate('/operator/vehicles-charging')}>
            <span className="staff-kpi-eyebrow">POWER SESSIONS</span>
            <p className="staff-kpi-value">{activeCharging}</p>
            <p className="staff-kpi-label">Active charging</p>
          </div>
          <div className="staff-kpi-card" onClick={() => navigate('/operator/incidents')}>
            <span className="staff-kpi-eyebrow">ALERTS &amp; QUEUE</span>
            <p className="staff-kpi-value">
              {pendingReservations.length > 0
                ? `${pendingReservations.length} / ${openIncidents}`
                : openIncidents}
            </p>
            <p className="staff-kpi-label">
              {pendingReservations.length > 0
                ? 'Pending / Incidents'
                : 'Unresolved incidents'}
            </p>
          </div>
        </div>

        {/* Live Student Booking Approval Queue (PENDING -> CONFIRMED / REJECTED) */}
        <section className="operator-approval-section">
          <div className="operator-approval-head">
            <div>
              <h2 className="staff-section-heading">
                Student booking requests &amp; live ride status
              </h2>
              <p className="operator-approval-sub">
                Approve pending requests so students can unlock via optical QR, or decline to free held vehicles.
              </p>
            </div>

            <div className="operator-approval-tabs">
              <button
                type="button"
                className={`operator-tab-btn ${bookingTab === 'PENDING' ? 'is-active' : ''}`}
                onClick={() => setBookingTab('PENDING')}
              >
                Pending ({pendingReservations.length})
              </button>
              <button
                type="button"
                className={`operator-tab-btn ${bookingTab === 'ACTIVE' ? 'is-active' : ''}`}
                onClick={() => setBookingTab('ACTIVE')}
              >
                Approved &amp; Riding ({activeReservations.length})
              </button>
              <button
                type="button"
                className={`operator-tab-btn ${bookingTab === 'HISTORY' ? 'is-active' : ''}`}
                onClick={() => setBookingTab('HISTORY')}
              >
                Recent history
              </button>
            </div>
          </div>

          {actionToast && (
            <div className="operator-approval-toast">
              <span>{actionToast}</span>
              <button type="button" onClick={() => setActionToast('')}>
                ✕
              </button>
            </div>
          )}

          {displayedReservations.length === 0 ? (
            <div className="operator-approval-empty">
              {bookingTab === 'PENDING'
                ? 'No pending student bookings awaiting approval right now.'
                : bookingTab === 'ACTIVE'
                ? 'No approved or active rides in progress.'
                : 'No completed or cancelled reservations yet.'}
            </div>
          ) : (
            <div className="operator-approval-list">
              {displayedReservations.map((item) => {
                const statusMeta = getReadableStatusMeta(item);
                const isVehicle =
                  String(item.reservation_type || item.reservationType || 'VEHICLE').toUpperCase() ===
                  'VEHICLE';
                const targetCode = isVehicle
                  ? item.vehicleCode || `EV #${item.vehicle_id || item.vehicleId}`
                  : `Slot ${item.parkingSlotCode || item.slotCode || 'Zone C'}`;
                const busy = actionBusyId === item.id;
                const st = String(item.status || '').toUpperCase();

                return (
                  <div key={item.id} className="operator-approval-card">
                    <div className="operator-approval-card__info">
                      <div className="operator-approval-card__top">
                        <span className="operator-type-tag">
                          {isVehicle ? 'EV RENTAL' : 'PARKING'}
                        </span>
                        <strong>{targetCode}</strong>
                        <span className={`status-tone-pill tone-${statusMeta.tone}`}>
                          {statusMeta.label}
                        </span>
                      </div>
                      <div className="operator-approval-card__meta">
                        <span>
                          <strong>{item.studentName || 'Campus Student'}</strong>
                          {item.studentEmail ? ` (${item.studentEmail})` : ''}
                        </span>
                        <span>·</span>
                        <span>{item.hubName || 'Campus Hub'}</span>
                        <span>·</span>
                        <span>{formatShortWindow(item.startTime || item.start_time, item.endTime || item.end_time)}</span>
                      </div>
                    </div>

                    <div className="operator-approval-card__actions">
                      {st === 'PENDING' && (
                        <>
                          <button
                            type="button"
                            className="operator-approve-btn"
                            disabled={busy}
                            onClick={() => handleApprove(item)}
                          >
                            {busy ? 'Saving...' : 'Approve'}
                          </button>
                          <button
                            type="button"
                            className="operator-reject-btn"
                            disabled={busy}
                            onClick={() => handleReject(item)}
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {st === 'CONFIRMED' && (
                        <button
                          type="button"
                          className="operator-reject-btn"
                          disabled={busy}
                          onClick={() => handleReject(item)}
                        >
                          Revoke hold
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <CampusHubMap hubs={mapHubs} mode="operator" />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h2 className="staff-section-heading">Hub telemetry summary</h2>

          <div style={{ overflowX: 'auto' }}>
            <div className="staff-list-head" style={{ marginTop: 10, minWidth: 520 }}>
              <span style={{ flex: 1.5 }}>Hub</span>
              <span style={{ flex: 0.9 }}>Available EVs</span>
              <span style={{ flex: 0.9 }}>Free parking</span>
              <span style={{ flex: 1 }}>Status</span>
            </div>

            {hubs.map((hub) => (
              <div
                key={hub.id}
                className="staff-list-row"
                onClick={() => navigate(`/operator/manage-parking?hubId=${hub.id}`)}
                style={{ cursor: 'pointer', minWidth: 520 }}
                title="Click to inspect parking lot"
              >
                <span style={{ flex: 1.5, fontWeight: 600 }}>{hub.name}</span>
                <span style={{ flex: 0.9, fontWeight: 600 }}>{hub.availableVehicles}</span>
                <span style={{ flex: 0.9 }}>{hub.freeSlots ?? 0}</span>
                <span style={{ flex: 1 }}>{formatHubOperationalLabel(hub)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

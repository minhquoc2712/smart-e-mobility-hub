import React, { useEffect, useState, useCallback } from 'react';
import { operatorApi, chargingApi } from '../../api';

const HUMAN_STATUS = {
  AVAILABLE: 'Available',
  RESERVED: 'Reserved',
  IN_USE: 'In use',
  CHARGING: 'Charging',
  OUT_OF_SERVICE: 'Maintenance',
};

const PRIORITIES = ['URGENT', 'HIGH', 'NORMAL', 'LOW'];

/**
 * Staff / Vehicle & charging status (Task 3.3a — Figma node 32:2293 & Task 4.1a Charging Queue)
 */
export function VehicleChargingStatusPage() {
  const [bundle, setBundle] = useState(null);
  const [chargingQueue, setChargingQueue] = useState([]);
  const [showChargers, setShowChargers] = useState(false);
  const [showQueue, setShowQueue] = useState(true);
  const [queueNotice, setQueueNotice] = useState('');

  const loadStatus = useCallback(async () => {
    const [data, requests] = await Promise.all([
      operatorApi.getDashboardBundle(),
      chargingApi.getChargingRequests().catch(() => []),
    ]);
    setBundle(data);
    setChargingQueue(Array.isArray(requests) ? requests : []);
  }, []);

  useEffect(() => {
    loadStatus();
    const timer = setInterval(loadStatus, 15000);
    return () => clearInterval(timer);
  }, [loadStatus]);

  const handlePriorityChange = async (requestId, nextPriority) => {
    try {
      setQueueNotice('');
      await chargingApi.updatePriority(requestId, nextPriority);
      await loadStatus();
      setQueueNotice(`Updated queue priority → ${nextPriority}.`);
    } catch (err) {
      setQueueNotice(err.message || 'Could not update priority.');
    }
  };

  const vehicles = bundle?.vehicleCharging?.vehicles || [];
  const chargingPoints = bundle?.vehicleCharging?.chargingPoints || [];
  const chargingVehiclesCount =
    bundle?.vehicleCharging?.vehicleStats?.CHARGING ??
    vehicles.filter((v) => v.status === 'CHARGING').length;

  return (
    <>
      <h1 className="staff-page-title">Vehicle &amp; charging status</h1>

      <div className="staff-panel">
        <div>
          <div className="staff-list-head">
            <span style={{ flex: 1 }}>Vehicle</span>
            <span style={{ flex: 1.3 }}>Hub</span>
            <span style={{ flex: 0.9 }}>Battery</span>
            <span style={{ flex: 1 }}>Status</span>
          </div>

          {!bundle ? (
            <p style={{ color: 'var(--staff-muted)', marginTop: 16 }}>Loading fleet status...</p>
          ) : (
            vehicles.map((v) => (
              <div key={v.id} className="staff-list-row">
                <span style={{ flex: 1 }}>{v.code}</span>
                <span style={{ flex: 1.3 }}>
                  {v.currentHubName || 'In transit'}
                  {v.parkingSlotCode ? (
                    <span style={{ color: 'var(--staff-muted)', fontSize: 14 }}>
                      {' '}
                      · {v.parkingSlotCode}
                    </span>
                  ) : null}
                </span>
                <span style={{ flex: 0.9 }}>{v.batteryLevel}%</span>
                <span style={{ flex: 1 }}>{HUMAN_STATUS[v.status] || v.status}</span>
              </div>
            ))
          )}
        </div>

        {/* Figma bottom mint summary bar (clickable to expand individual chargers) */}
        <div
          onClick={() => setShowChargers((prev) => !prev)}
          title="Click to toggle charging point details"
          style={{
            background: 'var(--staff-pill)',
            borderRadius: 14,
            padding: '18px 22px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 19,
            color: 'var(--staff-ink)',
            cursor: 'pointer',
          }}
        >
          <span>{chargingVehiclesCount} vehicles charging</span>
          <span style={{ fontSize: 14.5, color: 'var(--staff-olive)' }}>
            {showChargers ? 'Hide chargers ▲' : `View ${chargingPoints.length} chargers ▼`}
          </span>
        </div>

        {showChargers && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
              gap: 12,
            }}
          >
            {chargingPoints.map((cp) => (
              <div
                key={cp.id}
                style={{
                  background: cp.status === 'OUT_OF_SERVICE' ? '#fee2e2' : 'var(--staff-pill)',
                  borderRadius: 12,
                  padding: '12px 16px',
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--staff-forest)' }}>
                  {cp.chargerCode} · {cp.maxPowerKw} kW
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--staff-olive)', marginTop: 2 }}>
                  {cp.hubName}
                </div>
                <div style={{ fontSize: 13.5, marginTop: 4, fontWeight: 500 }}>
                  {cp.status}
                  {cp.currentVehicleCode ? ` (${cp.currentVehicleCode})` : ''}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Task 4.1a: Operator Charging Queue & Priority Control (UC15) */}
        <div
          onClick={() => setShowQueue((prev) => !prev)}
          style={{
            background: 'var(--staff-pill)',
            borderRadius: 14,
            padding: '16px 22px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 18,
            color: 'var(--staff-forest)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <span>Charging queue &amp; priority ({chargingQueue.length})</span>
          <span style={{ fontSize: 14.5, fontWeight: 400, color: 'var(--staff-olive)' }}>
            {showQueue ? 'Hide queue ▲' : 'Manage priority ▼'}
          </span>
        </div>

        {showQueue && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {queueNotice && (
              <div
                style={{
                  background: '#eff9eb',
                  color: 'var(--staff-forest)',
                  padding: '8px 14px',
                  borderRadius: 10,
                  fontSize: 14,
                }}
              >
                {queueNotice}
              </div>
            )}

            {chargingQueue.length === 0 ? (
              <p style={{ color: 'var(--staff-muted)', margin: 0 }}>
                No active or queued charging requests right now.
              </p>
            ) : (
              chargingQueue.map((req, idx) => {
                const reqCode = req.requestCode || req.request_code || `CHG-${req.id}`;
                const ownership = req.ownershipType || req.ownership_type || 'RENTAL';
                const vehLabel =
                  req.privateVehicleLabel ||
                  req.private_vehicle_label ||
                  req.vehicleCode ||
                  (req.vehicleId ? `Vehicle #${req.vehicleId}` : 'Shared EV');
                const curBatt = req.currentBatteryLevel ?? req.current_battery_level ?? 25;
                const tgtBatt = req.targetBatteryLevel ?? req.target_battery_level ?? 90;
                const hubName = req.hubName || req.hub_name || 'Campus Hub';
                const prio = req.priority || 'NORMAL';

                return (
                  <div
                    key={req.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid var(--staff-divider)',
                      borderRadius: 12,
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15.5, color: 'var(--staff-forest)' }}>
                        #{req.queuePosition ?? req.queue_position ?? idx + 1} · {reqCode} — {vehLabel}
                      </div>
                      <div style={{ fontSize: 13.5, color: 'var(--staff-muted)', marginTop: 2 }}>
                        {hubName} · {ownership} · Battery {curBatt}% → {tgtBatt}% · {req.status}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13.5, color: 'var(--staff-olive)' }}>Priority:</span>
                      <select
                        className="staff-pill-select"
                        style={{
                          padding: '6px 12px',
                          fontSize: 13.5,
                          fontWeight: 600,
                          background:
                            prio === 'URGENT'
                              ? '#fee2e2'
                              : prio === 'HIGH'
                              ? '#fff7db'
                              : '#eff9eb',
                          color:
                            prio === 'URGENT'
                              ? '#991b1b'
                              : prio === 'HIGH'
                              ? '#854d0e'
                              : 'var(--staff-forest)',
                        }}
                        value={prio}
                        onChange={(e) => handlePriorityChange(req.id, e.target.value)}
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </>
  );
}

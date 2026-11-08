import React, { useEffect, useState, useCallback } from 'react';
import { operatorApi } from '../../api';

const HUMAN_STATUS = {
  AVAILABLE: 'Available',
  RESERVED: 'Reserved',
  IN_USE: 'In use',
  CHARGING: 'Charging',
  OUT_OF_SERVICE: 'Maintenance',
};

/**
 * Staff / Vehicle & charging status (Task 3.3a — Figma node 32:2293)
 */
export function VehicleChargingStatusPage() {
  const [bundle, setBundle] = useState(null);
  const [showChargers, setShowChargers] = useState(false);

  const loadStatus = useCallback(async () => {
    const data = await operatorApi.getDashboardBundle();
    setBundle(data);
  }, []);

  useEffect(() => {
    loadStatus();
    const timer = setInterval(loadStatus, 15000);
    return () => clearInterval(timer);
  }, [loadStatus]);

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
                <span style={{ flex: 1.3 }}>{v.currentHubName || 'In transit'}</span>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
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
      </div>
    </>
  );
}

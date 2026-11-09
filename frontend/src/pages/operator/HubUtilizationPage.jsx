import React, { useEffect, useState, useCallback } from 'react';
import { operatorApi } from '../../api';

/**
 * Staff / Hub utilization (Task 3.3a — Figma node 32:2254)
 * Displays real-time capacity utilization (%) per Hub and highlights hubs nearing full (>=80%).
 */
export function HubUtilizationPage() {
  const [hubs, setHubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadUtilization = useCallback(async () => {
    try {
      setError('');
      const bundle = await operatorApi.getDashboardBundle();
      setHubs(bundle.hubUtilization?.hubs || []);
    } catch (err) {
      setError(err.message || 'Could not load hub utilization.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUtilization();
  }, [loadUtilization]);

  return (
    <>
      <h1 className="staff-page-title">Hub utilization</h1>

      <div className="staff-panel staff-panel--narrow">
        {loading ? (
          <p style={{ color: 'var(--staff-muted)', margin: 0 }}>Loading hub utilization...</p>
        ) : error ? (
          <p style={{ color: '#991b1b', margin: 0 }}>{error}</p>
        ) : (
          <>
            <div className="staff-list-head" style={{ justifyContent: 'space-between' }}>
              <span>Hub</span>
              <span>Utilization</span>
            </div>

            <div>
              {hubs.map((hub) => {
                const pct = Math.round(Number(hub.utilizationPercentage ?? 0));
                const nearFull = pct >= 80 || hub.hubStatus === 'NEAR_FULL' || hub.hubStatus === 'FULL';

                return (
                  <div
                    key={hub.id}
                    className="staff-list-row"
                    style={{ justifyContent: 'space-between' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span>{hub.name}</span>
                        {nearFull && (
                          <span className="staff-status-tag staff-status-tag--warn">
                            {hub.hubStatus === 'FULL' ? 'Full' : 'Nearing full'}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 14, color: 'var(--staff-muted)', marginTop: 4 }}>
                        {hub.occupiedSlots + hub.reservedSlots} / {hub.actualParkingSlots || hub.totalParkingSlots} parking ·{' '}
                        {hub.chargingPointsInUse} / {hub.actualChargingPoints || hub.totalChargingPoints} chargers active
                      </div>
                    </div>

                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}

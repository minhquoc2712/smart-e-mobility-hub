import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { operatorApi } from '../../api';
import { LoadingState } from '../../components/common/LoadingState';
import { ErrorState } from '../../components/common/ErrorState';
import { EmptyState } from '../../components/common/EmptyState';

/**
 * Staff / Network overview (Task 3.3a — Figma node 32:2196)
 */
export function OperatorDashboardPage() {
  const [bundle, setBundle] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const loadDashboard = useCallback(async () => {
    try {
      const result = await operatorApi.getDashboardBundle();
      setBundle(result);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    const timer = setInterval(loadDashboard, 15000);
    return () => clearInterval(timer);
  }, [loadDashboard]);

  // First load failed: nothing to show yet, so the error takes the whole page.
  if (error && !bundle) {
    return (
      <>
        <h1 className="staff-page-title">Network overview</h1>
        <ErrorState title="Unable to load network telemetry" error={error} onRetry={loadDashboard} />
      </>
    );
  }

  if (!bundle) {
    return (
      <>
        <h1 className="staff-page-title">Network overview</h1>
        <LoadingState message="Loading network telemetry…" />
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

      {/* A background refresh failed: keep showing the last data, but say it may be stale. */}
      {error && (
        <ErrorState
          inline
          error={`Latest refresh failed, showing the last loaded data. ${error.message || ''}`.trim()}
          onRetry={loadDashboard}
        />
      )}

      <div className="staff-panel">
        <div className="staff-kpi-grid">
          <div>
            <p className="staff-kpi-value">{overview?.totalHubs ?? hubs.length}</p>
            <p className="staff-kpi-label">Hubs</p>
          </div>
          <div>
            <p className="staff-kpi-value">{availableFleet}</p>
            <p className="staff-kpi-label">Available vehicles</p>
          </div>
          <div>
            <p className="staff-kpi-value">{activeCharging}</p>
            <p className="staff-kpi-label">Active charging</p>
          </div>
          <div>
            <p className="staff-kpi-value">{openIncidents}</p>
            <p className="staff-kpi-label">Unresolved incidents</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h2 className="staff-section-heading">Hub status</h2>

          <div className="staff-list-head" style={{ marginTop: 10 }}>
            <span style={{ flex: 1.4 }}>Hub</span>
            <span style={{ flex: 0.9 }}>Available</span>
            <span style={{ flex: 1 }}>Status</span>
          </div>

          {!hubs.length && (
            <EmptyState title="No hubs found" message="No mobility hubs are configured in the system yet." />
          )}

          {hubs.map((hub) => (
            <div
              key={hub.id}
              className="staff-list-row"
              onClick={() => navigate(`/operator/manage-parking?hubId=${hub.id}`)}
              style={{ cursor: 'pointer' }}
              title="Click to inspect parking lot"
            >
              <span style={{ flex: 1.4 }}>{hub.name}</span>
              <span style={{ flex: 0.9 }}>{hub.availableVehicles}</span>
              <span style={{ flex: 1 }}>{formatHubOperationalLabel(hub)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

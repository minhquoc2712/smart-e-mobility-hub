import React, { useEffect, useState } from 'react';
import { operatorApi } from '../../api';
import { StatCard } from '../../components/common/StatCard';
import { StatusBadge } from '../../components/common/StatusBadge';

/**
 * Starter Screen for Operator Network Monitoring Dashboard (Task 3.3a — Owner: Minh Quốc)
 * Implements UC10: Network overview, hub utilization, near-full hub detection.
 */
export function OperatorDashboardPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    operatorApi.getDashboard().then(setData);
  }, []);

  if (!data) return <p>Loading Operator Telemetry...</p>;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Hub Network Monitoring Dashboard (UC10)</h2>
      <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
        <StatCard label="Available Fleet" value={data.availableVehicles} subtitle={`Out of ${data.totalVehicles} total EVs`} />
        <StatCard label="Charging Now" value={data.chargingVehicles} accentColor="#2563eb" />
        <StatCard label="Out of Service" value={data.outOfServiceVehicles} accentColor="#c93b3b" />
        <StatCard label="Open Incidents" value={data.openIncidents} accentColor="#d97706" />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Hub Capacity & Utilization Overview</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Hub</th>
              <th>Zone</th>
              <th>Available EVs</th>
              <th>Free Parking</th>
              <th>Free Chargers</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(data.hubs || []).map((h) => (
              <tr key={h.id}>
                <td><strong>{h.name}</strong></td>
                <td>{h.campusZone}</td>
                <td>{h.availableBikes + h.availableScooters}</td>
                <td>{h.freeParkingSlots} / {h.totalParkingSlots}</td>
                <td>{h.availableChargingPoints} / {h.totalChargingPoints}</td>
                <td><StatusBadge status={h.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

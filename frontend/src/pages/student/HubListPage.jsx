import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { hubApi } from '../../api';
import { StatusBadge } from '../../components/common/StatusBadge';

/**
 * Starter Screen for UC01 & UC03 (Wireframe 3: Find Hub / Vehicle)
 * Owner for full Student UI expansion in Task 3.2a: Lê Minh Nhật
 */
export function HubListPage() {
  const [hubs, setHubs] = useState([]);
  const [search, setSearch] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    hubApi
      .getHubs({ search, vehicleType })
      .then((data) => {
        if (active) setHubs(data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [search, vehicleType]);

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ margin: '0 0 0.25rem' }}>Where are you? Find the nearest Mobility Hub</h2>
        <p style={{ margin: 0, color: '#556b5d' }}>Real-time vehicle, parking capacity, and charger availability across VNU-HCM.</p>
      </div>

      <div className="card" style={{ marginBottom: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ flex: '1 1 260px' }}
          placeholder="Search hub name or campus zone (e.g., HCMUT, Dormitory B, Metro)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="select"
          style={{ flex: '0 1 220px' }}
          value={vehicleType}
          onChange={(e) => setVehicleType(e.target.value)}
        >
          <option value="">All Vehicle Types</option>
          <option value="ELECTRIC_BIKE">🚲 Electric Bike</option>
          <option value="ELECTRIC_SCOOTER">🛵 Electric Scooter</option>
        </select>
      </div>

      {loading ? (
        <p>Loading Mobility Hubs...</p>
      ) : (
        <div className="grid-2">
          {hubs.map((hub) => (
            <div key={hub.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div>
                  <h3 style={{ margin: '0 0 0.2rem' }}>{hub.name}</h3>
                  <div style={{ fontSize: '0.84rem', color: '#556b5d' }}>{hub.address}</div>
                </div>
                <StatusBadge status={hub.status} />
              </div>

              <div className="grid-3" style={{ margin: '1rem 0', fontSize: '0.88rem' }}>
                <div style={{ background: '#f4f9f4', padding: '0.6rem', borderRadius: 8 }}>
                  <div>🚲 Bikes: <strong>{hub.availableBikes}</strong></div>
                  <div>🛵 Scooters: <strong>{hub.availableScooters}</strong></div>
                </div>
                <div style={{ background: '#f4f9f4', padding: '0.6rem', borderRadius: 8 }}>
                  <div>🅿️ Free Parking</div>
                  <strong>{hub.freeParkingSlots} / {hub.totalParkingSlots}</strong>
                </div>
                <div style={{ background: '#f4f9f4', padding: '0.6rem', borderRadius: 8 }}>
                  <div>🔌 Chargers Ready</div>
                  <strong>{hub.availableChargingPoints} / {hub.totalChargingPoints}</strong>
                </div>
              </div>

              <Link to={`/student/hubs/${hub.id}`} className="btn btn-primary" style={{ width: '100%' }}>
                View Hub Info & Vehicles →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

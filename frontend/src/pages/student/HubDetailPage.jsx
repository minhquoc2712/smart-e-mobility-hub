import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { hubApi, reservationApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { StatusBadge } from '../../components/common/StatusBadge';
import { BatteryIndicator } from '../../components/common/BatteryIndicator';

/**
 * Starter Screen for Wireframes 4, 5, 6 (Hub Info + Vehicle Availability & Quick Reserve)
 * Owner for Task 3.2a expansion: Lê Minh Nhật
 */
export function HubDetailPage() {
  const { hubId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [hub, setHub] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    hubApi.getHubById(hubId).then(setHub).catch((err) => setMessage(err.message));
  }, [hubId]);

  const handleQuickReserve = async (vehicle) => {
    try {
      const now = new Date();
      const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      await reservationApi.reserveVehicle({
        userId: user.id,
        hubId: hub.id,
        vehicleId: vehicle.id,
        startTime: now.toISOString(),
        endTime: twoHoursLater.toISOString(),
      });
      navigate('/student/reservations');
    } catch (err) {
      setMessage(err.message);
    }
  };

  if (!hub) return <p>Loading Hub details...</p>;

  return (
    <div>
      <Link to="/student/hubs" style={{ color: '#1b7f4c', fontWeight: 600, fontSize: '0.9rem' }}>
        ← Back to all Hubs
      </Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0.75rem 0 1.25rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>{hub.name}</h2>
          <p style={{ margin: '0.2rem 0 0', color: '#556b5d' }}>{hub.address}</p>
        </div>
        <Link to="/student/charging" className="btn btn-outline">
          🔌 Book Charger / Parking
        </Link>
      </div>

      {message && <p style={{ color: '#c93b3b' }}>{message}</p>}

      <h3>Vehicles at this Hub</h3>
      <div className="grid-3">
        {(hub.vehicles || []).map((v) => (
          <div key={v.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{v.code}</strong>
              <StatusBadge status={v.status} />
            </div>
            <div style={{ fontSize: '0.86rem', color: '#556b5d', marginTop: 4 }}>
              {v.type === 'ELECTRIC_BIKE' ? '🚲 Electric Bike' : '🛵 Electric Scooter'} · {v.model}
            </div>
            <BatteryIndicator percent={v.batteryLevel} rangeKm={v.estimatedRangeKm} />
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '0.5rem' }}
              disabled={v.status !== 'AVAILABLE'}
              onClick={() => handleQuickReserve(v)}
            >
              {v.status === 'AVAILABLE' ? 'Reserve Vehicle' : v.status}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

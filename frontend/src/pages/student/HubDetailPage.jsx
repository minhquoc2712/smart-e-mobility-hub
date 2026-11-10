import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { hubApi, vehicleApi } from '../../api';
import vehicleImage from '../../components/common/images/vehicle.jpg';

const VEHICLE_FILTERS = [
  { value: 'ELECTRIC_BIKE', label: 'Electric bike' },
  { value: 'ELECTRIC_SCOOTER', label: 'Electric scooter' },
];

function getVehicleTypeLabel(type) {
  return type === 'ELECTRIC_BIKE' ? 'Electric bike' : 'Electric scooter';
}

export function HubDetailPage() {
  const { hubId } = useParams();
  const navigate = useNavigate();
  const [hub, setHub] = useState(null);
  const [vehicleType, setVehicleType] = useState('ELECTRIC_BIKE');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage('');
    Promise.all([
      hubApi.getHubById(hubId),
      vehicleApi.getVehicles({ hubId }),
    ])
      .then(([data, vehicles]) => {
        if (active) setHub({ ...data, vehicles });
      })
      .catch((error) => {
        if (active) setMessage(error.message || 'Unable to load vehicles for this hub.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [hubId]);

  const vehicles = useMemo(
    () => (hub?.vehicles || []).filter((vehicle) => vehicle.type === vehicleType),
    [hub, vehicleType],
  );

  const handleReserve = (vehicle) => {
    setMessage('');
    navigate('/student/reservations', {
      state: {
        vehicle,
        hub: { id: hub.id, name: hub.name, campusZone: hub.campusZone },
      },
    });
  };

  return (
    <div className="vehicle-availability-page">
      <header className="vehicle-availability-heading">
        <h1>Vehicle availability &amp; battery</h1>
        <p>{hub?.name || 'Mobility hub'} · Check available vehicles and battery levels before you ride.</p>
      </header>

      <div className="vehicle-filter-actions" role="group" aria-label="Filter by vehicle type">
        {VEHICLE_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={vehicleType === filter.value ? 'active' : ''}
            aria-pressed={vehicleType === filter.value}
            onClick={() => setVehicleType(filter.value)}
          >
            {filter.label} {vehicleType === filter.value && <span aria-hidden="true">✓</span>}
          </button>
        ))}
      </div>

      {message && <p className="vehicle-availability-error" role="alert">{message}</p>}

      {loading ? (
        <p>Loading available vehicles...</p>
      ) : (
        <>
          <div className="vehicle-availability-grid">
            {vehicles.map((vehicle) => {
              const isAvailable = vehicle.status === 'AVAILABLE';
              const battery = Math.min(100, Math.max(0, Number(vehicle.batteryLevel) || 0));
              return (
                <article className="vehicle-availability-card" key={vehicle.id}>
                  <h2>{vehicle.code}</h2>
                  <div className="vehicle-availability-image">
                    <img src={vehicleImage} alt={getVehicleTypeLabel(vehicle.type)} />
                  </div>
                  <div className="vehicle-battery">
                    <div className="vehicle-battery-label">
                      <span>Battery level</span>
                      <strong>{battery}%</strong>
                    </div>
                    <div
                      className="vehicle-battery-track"
                      role="meter"
                      aria-label={`${vehicle.code} battery`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={battery}
                    >
                      <span style={{ width: `${battery}%` }} />
                    </div>
                  </div>
                  <p className="vehicle-range-label">
                    {vehicle.estimatedRangeKm} km estimated range
                  </p>
                  <button
                    type="button"
                    className="vehicle-reserve-button"
                    disabled={!isAvailable}
                    onClick={() => handleReserve(vehicle)}
                  >
                    {isAvailable ? 'Reserve vehicle' : vehicle.status.replaceAll('_', ' ')}
                  </button>
                </article>
              );
            })}
          </div>
          {!vehicles.length && (
            <p className="vehicle-availability-empty">
              No {getVehicleTypeLabel(vehicleType).toLowerCase()}s are listed at this hub.
            </p>
          )}
        </>
      )}

      <Link className="vehicle-availability-back" to={`/student/hubs/${hubId}/info`}>
        ← Back to hub information
      </Link>
    </div>
  );
}

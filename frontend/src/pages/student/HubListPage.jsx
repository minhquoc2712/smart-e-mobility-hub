import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { hubApi } from '../../api';

/**
 * Starter Screen for UC01 & UC03 (Wireframe 3: Find Hub / Vehicle)
 * Owner for full Student UI expansion in Task 3.2a: Lê Minh Nhật
 */
export function HubListPage() {
  const [hubs, setHubs] = useState([]);
  const [search, setSearch] = useState('');
  const [vehicleType, setVehicleType] = useState('ELECTRIC_BIKE');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    hubApi
      .getHubs({ search, vehicleType })
      .then((data) => {
        if (active) setHubs(data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'Unable to load mobility hubs.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [search, vehicleType]);

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Location services are not supported by this browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => setSearch(''),
      () => setError('Unable to access your current location.'),
      { enableHighAccuracy: true },
    );
  };

  return (
    <div className="find-hub-page">
      <div className="find-hub-heading">
        <h1>Where are you? We’ll find the nearest hub.</h1>
        <p>Search your location and choose a vehicle to see nearby hubs.</p>
      </div>

      <div className="hub-location-search">
        <span className="hub-location-search-icon" aria-hidden="true">⌕</span>
        <input
          aria-label="Search location"
          placeholder="Campus main gate"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" onClick={useCurrentLocation}>Use my location</button>
      </div>

      <div className="vehicle-type-filter">
        <span>Choose vehicle</span>
        <div>
          <button
            type="button"
            className={vehicleType === 'ELECTRIC_BIKE' ? 'active' : ''}
            onClick={() => setVehicleType('ELECTRIC_BIKE')}
          >
            Electric bike {vehicleType === 'ELECTRIC_BIKE' && '✓'}
          </button>
          <button
            type="button"
            className={vehicleType === 'ELECTRIC_SCOOTER' ? 'active' : ''}
            onClick={() => setVehicleType('ELECTRIC_SCOOTER')}
          >
            Electric scooter {vehicleType === 'ELECTRIC_SCOOTER' && '✓'}
          </button>
        </div>
      </div>

      {error && <div className="find-hub-error">{error}</div>}

      <h2 className="nearby-hubs-title">Available hub nearby</h2>
      {loading ? (
        <p>Loading Mobility Hubs...</p>
      ) : (
        <div className="nearby-hub-list">
          {hubs.map((hub) => (
            <article key={hub.id} className="nearby-hub-row">
              <div className="nearby-hub-info">
                <h3>{hub.name}</h3>
                <p>{hub.campusZone}</p>
              </div>
              <div className="nearby-hub-availability">
                <span>
                  {hub.availableBikes} electric {hub.availableBikes === 1 ? 'bike' : 'bikes'} · {hub.availableScooters} electric {hub.availableScooters === 1 ? 'scooter' : 'scooters'}
                </span>
              </div>
              <Link to={`/student/hubs/${hub.id}/info`} className="view-vehicles-button">
                View hub
              </Link>
            </article>
          ))}
          {!hubs.length && <p className="find-hub-empty">No hubs match this search and vehicle type.</p>}
        </div>
      )}
    </div>
  );
}

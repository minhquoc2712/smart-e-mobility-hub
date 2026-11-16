import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { hubApi } from '../../api';

export function HubListPage() {
  const [hubs, setHubs] = useState([]);
  const [search, setSearch] = useState('');
  const [vehicleType, setVehicleType] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    hubApi
      .getHubs({ search, vehicleType: vehicleType === 'ALL' ? '' : vehicleType })
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
      setSearch('');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => setSearch(''),
      () => setSearch(''),
      { enableHighAccuracy: true }
    );
  };

  return (
    <div className="find-hub-page">
      <div className="find-hub-heading">
        <h1>Where are you? We’ll find the nearest hub.</h1>
        <p>Search your campus zone and choose a vehicle, parking spot, or charger in seconds.</p>
      </div>

      {/* Beginner-friendly 3-step onboarding strip matching Figma mint palette */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
          marginBottom: 20,
        }}
      >
        {[
          {
            step: '1',
            title: 'Select a Campus Hub',
            desc: 'Check live bikes, scooters, free parking & chargers below.',
          },
          {
            step: '2',
            title: 'Reserve in 1 Click',
            desc: 'Hold a vehicle for 15 mins, or lock a parking/charging time window.',
          },
          {
            step: '3',
            title: 'Scan QR & Ride / Return',
            desc: 'Unlock at the Hub rack and return to any Hub with free slots.',
          },
        ].map((item) => (
          <div
            key={item.step}
            style={{
              background: '#eff9eb',
              border: '1px solid #d4edd6',
              borderRadius: 14,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: '#cdf4cf',
                color: '#2b581c',
                fontWeight: 700,
                fontSize: 14,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {item.step}
            </span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14.5, color: '#1f3b24' }}>{item.title}</div>
              <div style={{ fontSize: 12.5, color: '#556b5d', marginTop: 2 }}>{item.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="hub-location-search">
        <span className="hub-location-search-icon" aria-hidden="true">
          ⌕
        </span>
        <input
          aria-label="Search location"
          placeholder="Search hub name or campus zone (e.g. HCMUT, Central Library, Dormitory B, Metro)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" onClick={useCurrentLocation}>
          {search ? 'Clear filter' : 'Use my location'}
        </button>
      </div>

      <div className="vehicle-type-filter">
        <span>Choose vehicle</span>
        <div>
          <button
            type="button"
            className={vehicleType === 'ALL' ? 'active' : ''}
            onClick={() => setVehicleType('ALL')}
          >
            All hubs {vehicleType === 'ALL' && '✓'}
          </button>
          <button
            type="button"
            className={vehicleType === 'ELECTRIC_BIKE' ? 'active' : ''}
            onClick={() => setVehicleType('ELECTRIC_BIKE')}
          >
            🚲 Electric bike {vehicleType === 'ELECTRIC_BIKE' && '✓'}
          </button>
          <button
            type="button"
            className={vehicleType === 'ELECTRIC_SCOOTER' ? 'active' : ''}
            onClick={() => setVehicleType('ELECTRIC_SCOOTER')}
          >
            🛴 Electric scooter {vehicleType === 'ELECTRIC_SCOOTER' && '✓'}
          </button>
        </div>
      </div>

      {error && <div className="find-hub-error">{error}</div>}

      <h2 className="nearby-hubs-title">Available hubs nearby ({hubs.length})</h2>
      {loading ? (
        <p>Loading Mobility Hubs...</p>
      ) : (
        <div className="nearby-hub-list">
          {hubs.map((hub) => {
            const status = String(hub.status || 'ACTIVE').toUpperCase();
            return (
              <article key={hub.id} className="nearby-hub-row">
                <div className="nearby-hub-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0 }}>{hub.name}</h3>
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        padding: '2px 9px',
                        borderRadius: 999,
                        background: status === 'NEAR_FULL' ? '#fef3c7' : '#dcfce7',
                        color: status === 'NEAR_FULL' ? '#92400e' : '#166534',
                      }}
                    >
                      {status.replace('_', ' ')}
                    </span>
                  </div>
                  <p style={{ marginTop: 4 }}>
                    {hub.campusZone} {hub.address ? `· ${hub.address}` : ''}
                  </p>
                </div>

                <div
                  className="nearby-hub-availability"
                  style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
                >
                  <span style={pillBadgeStyle}>🚲 {hub.availableBikes} bikes</span>
                  <span style={pillBadgeStyle}>🛴 {hub.availableScooters} scooters</span>
                  <span style={pillBadgeStyle}>🅿️ {hub.freeParkingSlots ?? 0} free parking</span>
                  <span style={pillBadgeStyle}>
                    ⚡ {hub.availableChargingPoints ?? 0} free chargers
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <Link
                    to={`/student/hubs/${hub.id}/vehicles`}
                    className="view-vehicles-button"
                    style={{ background: '#cdf4cf', color: '#1f3b24', fontWeight: 700 }}
                  >
                    Rent vehicle
                  </Link>
                  <Link to={`/student/hubs/${hub.id}/info`} className="view-vehicles-button">
                    Hub services →
                  </Link>
                </div>
              </article>
            );
          })}
          {!hubs.length && (
            <p className="find-hub-empty">No hubs match this search and vehicle filter.</p>
          )}
        </div>
      )}
    </div>
  );
}

const pillBadgeStyle = {
  background: '#ffffff',
  border: '1px solid #d7ead7',
  borderRadius: 999,
  padding: '4px 10px',
  fontSize: 13,
  fontWeight: 600,
  color: '#1f3b24',
};

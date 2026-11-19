import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { hubApi } from '../../api';

/**
 * Highlights matched query substring inside suggestion text
 */
function HighlightMatch({ text = '', query = '' }) {
  const q = query.trim();
  if (!q || !text) return <>{text}</>;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = String(text).split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark
            key={i}
            style={{
              background: '#cdf4cf',
              color: '#18381d',
              fontWeight: 700,
              borderRadius: 4,
              padding: '0 2px',
            }}
          >
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
}

export function HubListPage() {
  const navigate = useNavigate();
  const [hubs, setHubs] = useState([]);
  const [search, setSearch] = useState('');
  const [vehicleType, setVehicleType] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // AJAX Live Autocomplete state
  const [suggestions, setSuggestions] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchBoxRef = useRef(null);

  // Close suggestion dropdown when clicking outside
  useEffect(() => {
    const handleOutside = (e) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // AJAX Live Search for Hub List (debounced + AbortController)
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError('');
      hubApi
        .getHubs(
          { search: search.trim(), vehicleType: vehicleType === 'ALL' ? '' : vehicleType },
          { signal: controller.signal }
        )
        .then((data) => {
          setHubs(data);
        })
        .catch((reqErr) => {
          if (reqErr.name === 'AbortError') return;
          setError(reqErr.message || 'Unable to load mobility hubs.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 150);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, vehicleType]);

  // AJAX Live Autocomplete Suggestions as user types (even 1 character like "a")
  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setSuggestions([]);
      setSuggestLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    setSuggestLoading(true);
    const timer = setTimeout(() => {
      hubApi
        .getSuggestions(q, controller.signal)
        .then((items) => {
          setSuggestions(Array.isArray(items) ? items : []);
          setActiveIndex(-1);
        })
        .catch((err) => {
          if (err.name !== 'AbortError') setSuggestions([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSuggestLoading(false);
        });
    }, 120);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  const handleSelectSuggestion = (item) => {
    setDropdownOpen(false);
    if (item.kind === 'VEHICLE') {
      navigate(`/student/hubs/${item.hubId}/vehicles`);
      return;
    }
    setSearch(item.searchValue || item.title);
  };

  const handleKeyDown = (e) => {
    if (!dropdownOpen || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleSelectSuggestion(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setDropdownOpen(false);
    }
  };

  const useCurrentLocation = () => {
    setDropdownOpen(false);
    if (search) {
      setSearch('');
      return;
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        () => setSearch(''),
        () => setSearch(''),
        { enableHighAccuracy: true }
      );
    }
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

      {/* AJAX Live Search Box + Instant Autocomplete Dropdown */}
      <div ref={searchBoxRef} style={{ position: 'relative' }}>
        <div className="hub-location-search">
          <span className="hub-location-search-icon" aria-hidden="true">
            ⌕
          </span>
          <input
            aria-label="Search location"
            autoComplete="off"
            placeholder="Type any letter to search hubs, zones, or vehicle codes (e.g. a, b, Metro, EB-102)..."
            value={search}
            onFocus={() => {
              if (search.trim()) setDropdownOpen(true);
            }}
            onChange={(e) => {
              setSearch(e.target.value);
              setDropdownOpen(Boolean(e.target.value.trim()));
            }}
            onKeyDown={handleKeyDown}
          />
          {suggestLoading && (
            <span style={{ fontSize: 12.5, color: '#5c6e54', whiteSpace: 'nowrap', marginRight: 8 }}>
              Searching...
            </span>
          )}
          <button type="button" onClick={useCurrentLocation}>
            {search ? 'Clear filter' : 'Use my location'}
          </button>
        </div>

        {dropdownOpen && search.trim() && (
          <div
            role="listbox"
            aria-label="Search suggestions"
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              right: 0,
              background: '#ffffff',
              borderRadius: 14,
              border: '1.5px solid #bde5bf',
              boxShadow: '0 14px 32px rgba(24, 43, 32, 0.16)',
              padding: 8,
              zIndex: 80,
              maxHeight: 360,
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                padding: '4px 10px 6px',
                fontSize: 11.5,
                fontWeight: 700,
                color: '#5c6e54',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>Live AJAX suggestions for &ldquo;{search.trim()}&rdquo;</span>
              <span>{suggestions.length} found</span>
            </div>

            {suggestions.length === 0 && !suggestLoading ? (
              <div style={{ padding: '12px 10px', fontSize: 14, color: '#6b7280' }}>
                No matching hubs, campus zones, or available vehicles found.
              </div>
            ) : (
              suggestions.map((item, idx) => {
                const isActive = idx === activeIndex;
                const status = String(item.status || 'ACTIVE').toUpperCase();
                return (
                  <div
                    key={item.id}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => handleSelectSuggestion(item)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '10px 12px',
                      borderRadius: 10,
                      cursor: 'pointer',
                      background: isActive ? '#eff9eb' : 'transparent',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          background: item.kind === 'VEHICLE' ? '#e0f2fe' : '#eff9eb',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 17,
                          flexShrink: 0,
                        }}
                      >
                        {item.kind === 'VEHICLE'
                          ? item.vehicleType === 'ELECTRIC_SCOOTER'
                            ? '🛴'
                            : '🚲'
                          : '🏢'}
                      </span>
                      <div>
                        <div
                          style={{
                            fontSize: 14.5,
                            fontWeight: 600,
                            color: '#1f3b24',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            flexWrap: 'wrap',
                          }}
                        >
                          <span>
                            <HighlightMatch text={item.title} query={search} />
                          </span>
                          {item.kind === 'HUB' && (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '1px 7px',
                                borderRadius: 999,
                                background:
                                  status === 'FULL'
                                    ? '#fee2e2'
                                    : status === 'NEAR_FULL'
                                    ? '#fef3c7'
                                    : '#dcfce7',
                                color:
                                  status === 'FULL'
                                    ? '#991b1b'
                                    : status === 'NEAR_FULL'
                                    ? '#92400e'
                                    : '#166534',
                              }}
                            >
                              {status.replace('_', ' ')}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12.5, color: '#556b5d', marginTop: 1 }}>
                          <HighlightMatch text={item.subtitle} query={search} />
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: '#2b581c',
                          background: '#f5fbf5',
                          border: '1px solid #d7ead7',
                          padding: '3px 9px',
                          borderRadius: 999,
                        }}
                      >
                        {item.meta}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDropdownOpen(false);
                          navigate(
                            item.kind === 'VEHICLE'
                              ? `/student/hubs/${item.hubId}/vehicles`
                              : `/student/hubs/${item.hubId}/info`
                          );
                        }}
                        style={{
                          background: '#cdf4cf',
                          color: '#1f3b24',
                          border: 'none',
                          borderRadius: 8,
                          padding: '5px 10px',
                          fontSize: 12.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {item.kind === 'VEHICLE' ? 'Rent →' : 'Open →'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
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

      <h2 className="nearby-hubs-title">
        {search.trim()
          ? `Matching hubs for "${search.trim()}" (${hubs.length})`
          : `Available hubs nearby (${hubs.length})`}
      </h2>
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
                    <h3 style={{ margin: 0 }}>
                      <HighlightMatch text={hub.name} query={search} />
                    </h3>
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        padding: '2px 9px',
                        borderRadius: 999,
                        background:
                          status === 'FULL'
                            ? '#fee2e2'
                            : status === 'NEAR_FULL'
                            ? '#fef3c7'
                            : '#dcfce7',
                        color:
                          status === 'FULL'
                            ? '#991b1b'
                            : status === 'NEAR_FULL'
                            ? '#92400e'
                            : '#166534',
                      }}
                    >
                      {status.replace('_', ' ')}
                    </span>
                  </div>
                  <p style={{ marginTop: 4 }}>
                    <HighlightMatch
                      text={`${hub.campusZone}${hub.address ? ` · ${hub.address}` : ''}`}
                      query={search}
                    />
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
            <p className="find-hub-empty">No hubs match &ldquo;{search}&rdquo; and vehicle filter.</p>
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

import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { hubApi } from '../../api';
import { CampusHubMap } from '../../components/common/CampusHubMap';

function HighlightMatch({ text = '', query = '' }) {
  const q = query.trim();
  if (!q || !text) return <>{text}</>;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = String(text).split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="search-highlight">
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
  const [selectedHubId, setSelectedHubId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [suggestions, setSuggestions] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchBoxRef = useRef(null);

  useEffect(() => {
    const handleOutside = (e) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

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
    if (item.hubId) setSelectedHubId(item.hubId);
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
      setSelectedHubId(null);
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
        <h1>VNU-HCM Mobility Hub Network</h1>
        <p>Explore live hub locations on the campus map, inspect slot capacity, and reserve in seconds.</p>
      </div>

      {/* 3-step Futuristic Onboarding Strip */}
      <div className="onboarding-steps-grid">
        {[
          {
            step: '01',
            title: 'Locate a Campus Hub',
            desc: 'Tap any hub pin on the map or search below for live availability.',
          },
          {
            step: '02',
            title: 'Reserve Instantly',
            desc: 'Hold an electric bike or scooter for 15 minutes, or lock parking/charging slots.',
          },
          {
            step: '03',
            title: 'Scan QR & Ride',
            desc: 'Unlock via optical QR scan at the rack and return to any VNU-HCM hub.',
          },
        ].map((item) => (
          <div key={item.step} className="onboarding-step-card">
            <span className="onboarding-step-num">{item.step}</span>
            <div>
              <div className="onboarding-step-title">{item.title}</div>
              <div className="onboarding-step-desc">{item.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Interactive VNU-HCM Campus Map */}
      <CampusHubMap
        hubs={hubs}
        mode="student"
        selectedHubId={selectedHubId}
        onSelectHub={(h) => setSelectedHubId(h?.id || null)}
      />

      {/* AJAX Live Search Box + Instant Autocomplete Dropdown */}
      <div ref={searchBoxRef} className="hub-search-wrap">
        <div className="hub-location-search">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="hub-location-search-svg"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            aria-label="Search location"
            autoComplete="off"
            placeholder="Search hubs, campus zones, or vehicle codes (e.g. Metro, Library, EB-102)..."
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
          {suggestLoading && <span className="hub-search-loading">Searching...</span>}
          <button type="button" onClick={useCurrentLocation}>
            {search ? 'Clear' : 'Reset view'}
          </button>
        </div>

        {dropdownOpen && search.trim() && (
          <div role="listbox" aria-label="Search suggestions" className="hub-suggestions-popover">
            <div className="hub-suggestions-head">
              <span>Live matches for &ldquo;{search.trim()}&rdquo;</span>
              <span>{suggestions.length} found</span>
            </div>

            {suggestions.length === 0 && !suggestLoading ? (
              <div className="hub-suggestions-empty">
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
                    className={`hub-suggestion-row ${isActive ? 'is-active' : ''}`}
                  >
                    <div className="hub-suggestion-main">
                      <span className={`hub-suggestion-tag ${item.kind === 'VEHICLE' ? 'is-ev' : 'is-hub'}`}>
                        {item.kind === 'VEHICLE' ? 'EV' : 'HUB'}
                      </span>
                      <div>
                        <div className="hub-suggestion-title">
                          <span>
                            <HighlightMatch text={item.title} query={search} />
                          </span>
                          {item.kind === 'HUB' && (
                            <span className={`hub-status-pill status-${status.toLowerCase()}`}>
                              {status.replace('_', ' ')}
                            </span>
                          )}
                        </div>
                        <div className="hub-suggestion-sub">
                          <HighlightMatch text={item.subtitle} query={search} />
                        </div>
                      </div>
                    </div>

                    <div className="hub-suggestion-right">
                      <span className="hub-suggestion-meta">{item.meta}</span>
                      <button
                        type="button"
                        className="hub-suggestion-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDropdownOpen(false);
                          navigate(
                            item.kind === 'VEHICLE'
                              ? `/student/hubs/${item.hubId}/vehicles`
                              : `/student/hubs/${item.hubId}/info`
                          );
                        }}
                      >
                        {item.kind === 'VEHICLE' ? 'Rent' : 'Open'}
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
        <span>Filter fleet</span>
        <div className="vehicle-type-filter__group">
          <button
            type="button"
            className={vehicleType === 'ALL' ? 'active' : ''}
            onClick={() => setVehicleType('ALL')}
          >
            All hubs
          </button>
          <button
            type="button"
            className={vehicleType === 'ELECTRIC_BIKE' ? 'active' : ''}
            onClick={() => setVehicleType('ELECTRIC_BIKE')}
          >
            Electric bike
          </button>
          <button
            type="button"
            className={vehicleType === 'ELECTRIC_SCOOTER' ? 'active' : ''}
            onClick={() => setVehicleType('ELECTRIC_SCOOTER')}
          >
            Electric scooter
          </button>
        </div>
      </div>

      {error && <div className="find-hub-error">{error}</div>}

      <h2 className="nearby-hubs-title">
        {search.trim()
          ? `Matching hubs for "${search.trim()}" (${hubs.length})`
          : `Campus hubs (${hubs.length})`}
      </h2>
      {loading ? (
        <p className="muted-loading">Loading mobility hubs...</p>
      ) : (
        <div className="nearby-hub-list">
          {hubs.map((hub) => {
            const status = String(hub.status || 'ACTIVE').toUpperCase();
            const isSelected = Number(selectedHubId) === Number(hub.id);
            return (
              <article
                key={hub.id}
                className={`nearby-hub-row ${isSelected ? 'is-selected' : ''}`}
                onClick={() => setSelectedHubId(hub.id)}
              >
                <div className="nearby-hub-info">
                  <div className="nearby-hub-title-row">
                    <h3>
                      <HighlightMatch text={hub.name} query={search} />
                    </h3>
                    <span className={`hub-status-pill status-${status.toLowerCase()}`}>
                      {status.replace('_', ' ')}
                    </span>
                  </div>
                  <p>
                    <HighlightMatch
                      text={`${hub.campusZone}${hub.address ? ` · ${hub.address}` : ''}`}
                      query={search}
                    />
                  </p>
                </div>

                <div className="nearby-hub-availability">
                  <span className="metric-pill">
                    <strong>{hub.availableBikes}</strong> bikes
                  </span>
                  <span className="metric-pill">
                    <strong>{hub.availableScooters}</strong> scooters
                  </span>
                  <span className="metric-pill">
                    <strong>{hub.freeParkingSlots ?? 0}</strong> free parking
                  </span>
                  <span className="metric-pill">
                    <strong>{hub.availableChargingPoints ?? 0}</strong> free chargers
                  </span>
                </div>

                <div className="nearby-hub-actions" onClick={(e) => e.stopPropagation()}>
                  <Link
                    to={`/student/hubs/${hub.id}/vehicles`}
                    className="view-vehicles-button view-vehicles-button--primary"
                  >
                    Rent vehicle
                  </Link>
                  <Link to={`/student/hubs/${hub.id}/info`} className="view-vehicles-button">
                    Hub services
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

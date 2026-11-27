import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '../../context/ThemeContext';

const VNU_CENTER = [10.8754, 106.8005];
const DEFAULT_ZOOM = 14;

// High-speed global Fastly Edge CDN tiles (CARTO Voyager for Light Mode, Dark Matter for Dark Mode)
// with automatic fallback to OpenStreetMap if any individual tile request drops on mobile Wi-Fi/4G.
const LIGHT_TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

const FALLBACK_COORDS = {
  'HUB-BK-GATE1': [10.88052, 106.80531],
  'HUB-CENTRAL': [10.87018, 106.80312],
  'HUB-DORM-B': [10.88391, 106.78245],
  'HUB-METRO-VNU': [10.86624, 106.8129],
};

function getCoords(hub, idx = 0) {
  const lat = Number(hub.latitude);
  const lng = Number(hub.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
    return [lat, lng];
  }
  if (hub.code && FALLBACK_COORDS[hub.code]) return FALLBACK_COORDS[hub.code];
  const keys = Object.values(FALLBACK_COORDS);
  return keys[idx % keys.length];
}

function getHubTone(status) {
  const st = String(status || 'ACTIVE').toUpperCase();
  if (st === 'FULL' || st === 'MAINTENANCE') {
    return {
      dot: '#ef4444',
      ring: 'rgba(239, 68, 68, 0.28)',
      label: st === 'MAINTENANCE' ? 'Maintenance' : 'Full',
    };
  }
  if (st === 'NEAR_FULL') {
    return { dot: '#f59e0b', ring: 'rgba(245, 158, 11, 0.28)', label: 'Near full' };
  }
  return { dot: '#10b981', ring: 'rgba(16, 185, 129, 0.28)', label: 'Active' };
}

function attachTileFallback(tileLayer) {
  tileLayer.on('tileerror', (event) => {
    const img = event?.tile;
    const coords = event?.coords;
    if (!img || !coords) return;
    const attempt = Number(img.dataset.retryCount || '0');
    if (attempt === 0) {
      img.dataset.retryCount = '1';
      setTimeout(() => {
        img.src = `https://tile.openstreetmap.org/${coords.z}/${coords.x}/${coords.y}.png`;
      }, 250);
    } else if (attempt === 1) {
      img.dataset.retryCount = '2';
      setTimeout(() => {
        img.src = `https://a.tile.openstreetmap.fr/hot/${coords.z}/${coords.x}/${coords.y}.png`;
      }, 600);
    }
  });
}

/**
 * Interactive Leaflet + Multi-CDN OpenStreetMap view of all VNU-HCM Mobility Hubs.
 * Clicking any hub dot displays live available bikes, scooters, free parking spaces, and chargers.
 */
export function CampusHubMap({
  hubs = [],
  mode = 'student',
  selectedHubId: controlledHubId,
  onSelectHub,
}) {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markersLayerRef = useRef(null);
  const [activeHubId, setActiveHubId] = useState(controlledHubId || null);

  const normalizedHubs = useMemo(() => {
    return (hubs || []).map((h, idx) => {
      const [lat, lng] = getCoords(h, idx);
      const status = h.status || h.hubStatus || 'ACTIVE';
      const bikes = h.availableBikes ?? null;
      const scooters = h.availableScooters ?? null;
      const totalAvailVehicles =
        h.availableVehicles ?? Number(bikes || 0) + Number(scooters || 0);
      const freeParking = h.freeParkingSlots ?? h.freeSlots ?? 0;
      const freeChargers = h.availableChargingPoints ?? 0;
      return {
        ...h,
        lat,
        lng,
        normalizedStatus: String(status).toUpperCase(),
        bikes,
        scooters,
        totalAvailVehicles,
        freeParking,
        freeChargers,
      };
    });
  }, [hubs]);

  useEffect(() => {
    if (controlledHubId !== undefined) {
      setActiveHubId(controlledHubId);
    }
  }, [controlledHubId]);

  const activeHub = useMemo(
    () => normalizedHubs.find((h) => Number(h.id) === Number(activeHubId)) || null,
    [normalizedHubs, activeHubId]
  );

  // Initialize Leaflet map once + ResizeObserver so container changes never leave blank grey tiles
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return undefined;

    const map = L.map(mapContainerRef.current, {
      center: VNU_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      scrollWheelZoom: true,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const initialTileLayer = L.tileLayer(isDark ? DARK_TILE_URL : LIGHT_TILE_URL, {
      attribution: '&copy; OpenStreetMap &copy; CARTO · VNU-HCM Urban Area',
      subdomains: 'abcd',
      maxZoom: 19,
      keepBuffer: 4,
      updateWhenIdle: false,
    }).addTo(map);
    attachTileFallback(initialTileLayer);

    const layerGroup = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    tileLayerRef.current = initialTileLayer;
    markersLayerRef.current = layerGroup;

    const invalidate = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize({ pan: false });
      }
    };

    const t1 = setTimeout(invalidate, 150);
    const t2 = setTimeout(invalidate, 500);

    let observer = null;
    if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
      observer = new ResizeObserver(() => invalidate());
      observer.observe(mapContainerRef.current);
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (observer) observer.disconnect();
      map.remove();
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  // Dynamically switch between native Light & Dark CDN tiles when theme changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    const nextLayer = L.tileLayer(isDark ? DARK_TILE_URL : LIGHT_TILE_URL, {
      attribution: '&copy; OpenStreetMap &copy; CARTO · VNU-HCM Urban Area',
      subdomains: 'abcd',
      maxZoom: 19,
      keepBuffer: 4,
      updateWhenIdle: false,
    }).addTo(map);
    attachTileFallback(nextLayer);
    tileLayerRef.current = nextLayer;
  }, [isDark]);

  // Render interactive Hub markers whenever hubs or activeHubId change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    normalizedHubs.forEach((hub) => {
      const isSelected = Number(hub.id) === Number(activeHubId);
      const tone = getHubTone(hub.normalizedStatus);
      const shortName = String(hub.name || 'Hub').replace(/\s+Hub$/i, '');

      const icon = L.divIcon({
        className: 'semh-map-marker-wrapper',
        html: `
          <div class="semh-map-pin ${isSelected ? 'is-selected' : ''}" style="--pin-color:${tone.dot};--pin-ring:${tone.ring}">
            <div class="semh-map-pin__chip">
              <span class="semh-map-pin__title">${shortName}</span>
              <span class="semh-map-pin__meta">${hub.totalAvailVehicles} EV · ${hub.freeParking} slot</span>
            </div>
            <div class="semh-map-pin__dot">
              <span class="semh-map-pin__pulse"></span>
              <span class="semh-map-pin__core"></span>
            </div>
          </div>
        `,
        iconSize: [140, 56],
        iconAnchor: [70, 48],
      });

      const marker = L.marker([hub.lat, hub.lng], { icon });
      marker.on('click', () => {
        setActiveHubId(hub.id);
        if (onSelectHub) onSelectHub(hub);
        map.flyTo([hub.lat, hub.lng], 15, { duration: 0.65 });
      });
      marker.addTo(layer);
    });
  }, [normalizedHubs, activeHubId, onSelectHub]);

  const handleFocusHub = (hub) => {
    const map = mapInstanceRef.current;
    if (!hub) {
      setActiveHubId(null);
      if (map) map.flyTo(VNU_CENTER, DEFAULT_ZOOM, { duration: 0.6 });
      return;
    }
    setActiveHubId(hub.id);
    if (onSelectHub) onSelectHub(hub);
    if (map) map.flyTo([hub.lat, hub.lng], 15, { duration: 0.65 });
  };

  return (
    <section className="campus-map-shell" aria-label="VNU-HCM Interactive Mobility Hub Map">
      {/* Top Quick-Jump Bar */}
      <div className="campus-map-toolbar">
        <div className="campus-map-toolbar__title">
          <span className="live-pulse-dot" />
          <strong>VNU-HCM Live Hub Map</strong>
          <span className="campus-map-toolbar__hint">
            Tap any hub marker to inspect real-time capacity
          </span>
        </div>

        <div className="campus-map-chips" role="tablist" aria-label="Focus campus hub">
          <button
            type="button"
            className={`campus-map-chip ${activeHubId == null ? 'active' : ''}`}
            onClick={() => handleFocusHub(null)}
          >
            Overview ({normalizedHubs.length})
          </button>
          {normalizedHubs.map((h) => (
            <button
              key={h.id}
              type="button"
              className={`campus-map-chip ${Number(activeHubId) === Number(h.id) ? 'active' : ''}`}
              onClick={() => handleFocusHub(h)}
            >
              {String(h.name).replace(/\s+Hub$/i, '')}
            </button>
          ))}
        </div>
      </div>

      {/* Map Viewport + Floating Selected Hub Card */}
      <div className="campus-map-stage">
        <div ref={mapContainerRef} className="campus-map-canvas" />

        {/* Status Legend */}
        <div className="campus-map-legend">
          <span><i style={{ background: '#10b981' }} /> Active</span>
          <span><i style={{ background: '#f59e0b' }} /> Near full</span>
          <span><i style={{ background: '#ef4444' }} /> Full / Maint.</span>
        </div>

        {/* Floating Live Hub Inspector when user clicks a Hub dot */}
        {activeHub && (
          <aside className="campus-map-card" aria-live="polite">
            <div className="campus-map-card__head">
              <div>
                <span className="campus-map-card__zone">
                  {activeHub.campusZone || 'VNU-HCM Urban Area'}
                </span>
                <h3>{activeHub.name}</h3>
              </div>
              <button
                type="button"
                className="campus-map-card__close"
                onClick={() => setActiveHubId(null)}
                aria-label="Close hub card"
              >
                ×
              </button>
            </div>

            {activeHub.address && (
              <p className="campus-map-card__address">{activeHub.address}</p>
            )}

            <div className="campus-map-card__metrics">
              {activeHub.bikes !== null ? (
                <>
                  <div className="campus-map-metric">
                    <span>E-Bikes</span>
                    <strong>{activeHub.bikes} ready</strong>
                  </div>
                  <div className="campus-map-metric">
                    <span>E-Scooters</span>
                    <strong>{activeHub.scooters} ready</strong>
                  </div>
                </>
              ) : (
                <div className="campus-map-metric">
                  <span>Available EVs</span>
                  <strong>{activeHub.totalAvailVehicles} ready</strong>
                </div>
              )}
              <div className="campus-map-metric">
                <span>Free parking</span>
                <strong className={activeHub.freeParking === 0 ? 'text-danger' : ''}>
                  {activeHub.freeParking} slots
                </strong>
              </div>
              <div className="campus-map-metric">
                <span>Free chargers</span>
                <strong>{activeHub.freeChargers} ports</strong>
              </div>
            </div>

            <div className="campus-map-card__actions">
              {mode === 'operator' ? (
                <>
                  <button
                    type="button"
                    className="campus-map-btn campus-map-btn--primary"
                    onClick={() => navigate(`/operator/manage-parking?hubId=${activeHub.id}`)}
                  >
                    Manage Parking
                  </button>
                  <button
                    type="button"
                    className="campus-map-btn"
                    onClick={() => navigate('/operator/vehicles-charging')}
                  >
                    Charging Queue
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="campus-map-btn campus-map-btn--primary"
                    onClick={() => navigate(`/student/hubs/${activeHub.id}/vehicles`)}
                  >
                    Rent Vehicle
                  </button>
                  <button
                    type="button"
                    className="campus-map-btn"
                    onClick={() => navigate(`/student/hubs/${activeHub.id}/parking`)}
                  >
                    Book Parking
                  </button>
                  <button
                    type="button"
                    className="campus-map-btn"
                    onClick={() => navigate(`/student/hubs/${activeHub.id}/info`)}
                  >
                    Services
                  </button>
                </>
              )}
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const VNU_CENTER = [10.8754, 106.8005];
const DEFAULT_ZOOM = 14;

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
    return { dot: '#ef4444', ring: 'rgba(239, 68, 68, 0.28)', label: st === 'MAINTENANCE' ? 'Maintenance' : 'Full' };
  }
  if (st === 'NEAR_FULL') {
    return { dot: '#f59e0b', ring: 'rgba(245, 158, 11, 0.28)', label: 'Near full' };
  }
  return { dot: '#10b981', ring: 'rgba(16, 185, 129, 0.28)', label: 'Active' };
}

/**
 * Interactive Leaflet + OpenStreetMap view of all VNU-HCM Mobility Hubs.
 * Clicking any hub dot displays live available bikes, scooters, free parking spaces, and chargers.
 */
export function CampusHubMap({ hubs = [], mode = 'student', selectedHubId: controlledHubId, onSelectHub }) {
  const navigate = useNavigate();
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const [activeHubId, setActiveHubId] = useState(controlledHubId || null);

  const normalizedHubs = useMemo(() => {
    return (hubs || []).map((h, idx) => {
      const [lat, lng] = getCoords(h, idx);
      const status = h.status || h.hubStatus || 'ACTIVE';
      const bikes = h.availableBikes ?? null;
      const scooters = h.availableScooters ?? null;
      const totalAvailVehicles =
        h.availableVehicles ?? (Number(bikes || 0) + Number(scooters || 0));
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

  // Initialize Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return undefined;

    const map = L.map(mapContainerRef.current, {
      center: VNU_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      scrollWheelZoom: true,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors · VNU-HCM Urban Area',
      maxZoom: 19,
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    markersLayerRef.current = layerGroup;

    // Ensure proper tile sizing on mobile/flex layouts
    const resizeTimer = setTimeout(() => map.invalidateSize(), 200);

    return () => {
      clearTimeout(resizeTimer);
      map.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

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
          <span className="campus-map-toolbar__hint">Tap any hub marker to inspect real-time capacity</span>
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
                <span className="campus-map-card__zone">{activeHub.campusZone || 'VNU-HCM Urban Area'}</span>
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

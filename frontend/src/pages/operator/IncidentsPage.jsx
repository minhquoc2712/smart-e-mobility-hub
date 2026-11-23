import React, { useEffect, useState, useCallback } from 'react';
import { operatorApi } from '../../api';
import { LoadingState } from '../../components/common/LoadingState';
import { ErrorState, describeApiError } from '../../components/common/ErrorState';
import { EmptyState } from '../../components/common/EmptyState';
import { StatusBadge } from '../../components/common/StatusBadge';

const STATUS_LABELS = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

/**
 * Staff / Incidents (Task 3.3a — Figma node 32:2340)
 * Implements UC11 (Record operational incident) & UC12 (Assign & resolve incident after repair).
 */
export function IncidentsPage() {
  const [incidents, setIncidents] = useState([]);
  const [bundle, setBundle] = useState(null);
  const [filterMode, setFilterMode] = useState('UNRESOLVED');
  const [reportOpen, setReportOpen] = useState(false);
  const [resolvingId, setResolvingId] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState('Repaired & verified by maintenance staff.');

  // Form state for UC11
  const [hubId, setHubId] = useState(1);
  const [targetType, setTargetType] = useState('CHARGING_POINT');
  const [targetEntityId, setTargetEntityId] = useState('');
  const [severity, setSeverity] = useState('HIGH');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setLoadError(null);
      const [incList, dashBundle] = await Promise.all([
        operatorApi.getIncidents(),
        operatorApi.getDashboardBundle(),
      ]);
      setIncidents(incList || []);
      setBundle(dashBundle);
      setLoaded(true);
    } catch (err) {
      setLoadError(err);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const hubs = bundle?.hubUtilization?.hubs || [];
  const vehiclesAtHub = (bundle?.vehicleCharging?.vehicles || []).filter(
    (v) => v.currentHubId === Number(hubId)
  );
  const chargersAtHub = (bundle?.vehicleCharging?.chargingPoints || []).filter(
    (c) => c.hubId === Number(hubId)
  );
  const slotsAtHub = (bundle?.manageParking?.parkingSlots || []).filter(
    (s) => s.hubId === Number(hubId)
  );

  const unresolvedCount = incidents.filter((i) => i.status !== 'CLOSED').length;
  const visibleIncidents =
    filterMode === 'UNRESOLVED'
      ? incidents.filter((i) => i.status !== 'CLOSED')
      : incidents;

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      setError('');
      const payload = {
        hubId: Number(hubId),
        targetType,
        severity,
        title: title.trim(),
        description: description.trim() || 'Reported from Operator Staff Console.',
      };
      if (targetType === 'VEHICLE' && targetEntityId) payload.vehicleId = Number(targetEntityId);
      if (targetType === 'CHARGING_POINT' && targetEntityId) {
        payload.chargingPointId = Number(targetEntityId);
      }
      if (targetType === 'PARKING_SLOT' && targetEntityId) {
        payload.parkingSlotId = Number(targetEntityId);
      }
      await operatorApi.createIncident(payload);
      setTitle('');
      setDescription('');
      setTargetEntityId('');
      setReportOpen(false);
      await refresh();
    } catch (err) {
      setError(describeApiError(err, 'Failed to record incident.'));
    }
  };

  const handleAssign = async (id) => {
    try {
      setError('');
      await operatorApi.assignIncident(id);
      await refresh();
    } catch (err) {
      setError(describeApiError(err, 'Could not assign staff to this incident.'));
    }
  };

  const handleConfirmResolve = async (id) => {
    try {
      setError('');
      await operatorApi.closeIncident(id, resolutionNotes.trim() || 'Repaired and verified.');
      setResolvingId(null);
      setResolutionNotes('Repaired & verified by maintenance staff.');
      await refresh();
    } catch (err) {
      setError(describeApiError(err, 'Could not resolve incident.'));
    }
  };

  return (
    <>
      <h1 className="staff-page-title">Incidents</h1>

      <div className="staff-panel staff-panel--wide">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 20, color: 'var(--staff-muted)' }}>
            {unresolvedCount} unresolved incident{unresolvedCount === 1 ? '' : 's'}
          </span>

          <button
            type="button"
            className="staff-pill-btn staff-pill-btn--soft"
            style={{ minHeight: 40, padding: '6px 16px', fontSize: 15 }}
            onClick={() => setReportOpen((prev) => !prev)}
          >
            {reportOpen ? 'Cancel' : '+ Report incident'}
          </button>
        </div>

        {loadError && (
          <ErrorState
            title="Unable to load incident records"
            error={loadError}
            onRetry={refresh}
            inline={loaded}
          />
        )}
        {error && <ErrorState inline error={error} />}

        {/* UC11 Record Incident Form */}
        {reportOpen && (
          <form
            onSubmit={handleCreate}
            style={{
              background: 'var(--staff-pill)',
              borderRadius: 16,
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 18, color: 'var(--staff-forest)' }}>
              Log operational incident (UC11)
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13.5, color: 'var(--staff-olive)', marginBottom: 4 }}>Hub</div>
                <select
                  className="staff-pill-select"
                  style={{ background: '#fff', width: '100%' }}
                  value={hubId}
                  onChange={(e) => {
                    setHubId(Number(e.target.value));
                    setTargetEntityId('');
                  }}
                >
                  {hubs.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ fontSize: 13.5, color: 'var(--staff-olive)', marginBottom: 4 }}>Affected target</div>
                <select
                  className="staff-pill-select"
                  style={{ background: '#fff', width: '100%' }}
                  value={targetType}
                  onChange={(e) => {
                    setTargetType(e.target.value);
                    setTargetEntityId('');
                  }}
                >
                  <option value="CHARGING_POINT">Charging point</option>
                  <option value="VEHICLE">Vehicle</option>
                  <option value="PARKING_SLOT">Parking slot</option>
                  <option value="HUB">Entire hub</option>
                </select>
              </div>

              {targetType !== 'HUB' && (
                <div>
                  <div style={{ fontSize: 13.5, color: 'var(--staff-olive)', marginBottom: 4 }}>
                    Specific {targetType.toLowerCase().replace('_', ' ')}
                  </div>
                  <select
                    className="staff-pill-select"
                    style={{ background: '#fff', width: '100%' }}
                    value={targetEntityId}
                    onChange={(e) => setTargetEntityId(e.target.value)}
                  >
                    <option value="">Select unit (optional)</option>
                    {targetType === 'VEHICLE' &&
                      vehiclesAtHub.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.code} ({v.status})
                        </option>
                      ))}
                    {targetType === 'CHARGING_POINT' &&
                      chargersAtHub.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.chargerCode} ({c.status})
                        </option>
                      ))}
                    {targetType === 'PARKING_SLOT' &&
                      slotsAtHub.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.slotCode} ({s.status})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div>
                <div style={{ fontSize: 13.5, color: 'var(--staff-olive)', marginBottom: 4 }}>Severity</div>
                <select
                  className="staff-pill-select"
                  style={{ background: '#fff', width: '100%' }}
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
            </div>

            <input
              className="staff-pill-input"
              style={{ background: '#fff', width: '100%' }}
              placeholder="Incident summary (e.g., Charger CT-C02 offline or Vehicle EB-309 brake fault)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />

            <input
              className="staff-pill-input"
              style={{ background: '#fff', width: '100%' }}
              placeholder="Inspection details / error notes"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <div>
              <button type="submit" className="staff-pill-btn">
                Submit incident report
              </button>
            </div>
          </form>
        )}

        {/* Incident List matching Figma node 32:2363 */}
        <div>
          {!loaded ? (
            !loadError && <LoadingState message="Loading incident records…" />
          ) : visibleIncidents.length === 0 ? (
            <EmptyState
              title="No incidents in this view"
              message="All hub equipment is operating normally."
            />
          ) : (
            visibleIncidents.map((inc) => (
              <div key={inc.id} style={{ borderBottom: '1px solid var(--staff-divider)' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 24,
                    minHeight: 86,
                    padding: '16px 0',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ fontSize: 17, color: 'var(--staff-muted)', marginBottom: 6 }}>
                      {inc.incidentCode}
                    </div>
                    <div style={{ fontSize: 20, color: 'var(--staff-ink)' }}>
                      {inc.hubName} · {inc.title}
                    </div>
                  </div>

                  <div style={{ width: 140, fontSize: 19, color: 'var(--staff-ink)' }}>
                    <StatusBadge status={inc.status} label={STATUS_LABELS[inc.status]} />
                  </div>

                  <div style={{ width: 165, display: 'flex', justifyContent: 'flex-end' }}>
                    {inc.status === 'OPEN' && (
                      <button
                        type="button"
                        className="staff-pill-btn"
                        style={{ width: 160, height: 52 }}
                        onClick={() => handleAssign(inc.id)}
                      >
                        Assign staff
                      </button>
                    )}
                    {inc.status === 'IN_PROGRESS' && (
                      <button
                        type="button"
                        className="staff-pill-btn"
                        style={{ width: 160, height: 52 }}
                        onClick={() =>
                          setResolvingId((prev) => (prev === inc.id ? null : inc.id))
                        }
                      >
                        Resolve
                      </button>
                    )}
                    {inc.status === 'CLOSED' && (
                      <span className="staff-status-tag staff-status-tag--ok">Closed</span>
                    )}
                  </div>
                </div>

                {resolvingId === inc.id && (
                  <div
                    style={{
                      background: 'var(--staff-pill)',
                      borderRadius: 12,
                      padding: 16,
                      marginBottom: 16,
                      display: 'flex',
                      gap: 12,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <input
                      className="staff-pill-input"
                      style={{ background: '#fff', flex: '1 1 280px' }}
                      placeholder="Resolution notes (UC12)"
                      value={resolutionNotes}
                      onChange={(e) => setResolutionNotes(e.target.value)}
                    />
                    <button
                      type="button"
                      className="staff-pill-btn"
                      onClick={() => handleConfirmResolve(inc.id)}
                    >
                      Confirm &amp; close
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

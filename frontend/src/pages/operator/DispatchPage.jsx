import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { operatorApi } from '../../api';

const STAFF_MEMBERS = ['S. Patel', 'A. Lee', 'M. Tran', 'K. Nguyen'];

/**
 * Staff / Dispatch & Slot-to-Slot Vehicle Arrangement (Task 3.3a / 4.1a)
 * Supports:
 *  1. Selecting Source Hub -> clicking Destination Hub to view its live slots
 *  2. Custom vehicle-to-slot mapping (S1->V1 ===> Dest Slot S2, S2->V2 ===> Dest Slot S1...)
 *  3. Rearranging existing vehicles between slots right inside the selected Hub
 */
export function DispatchPage() {
  const [bundle, setBundle] = useState(null);
  const [sourceHubId, setSourceHubId] = useState(2);
  const [destinationHubId, setDestinationHubId] = useState(1);
  const [assignedStaff, setAssignedStaff] = useState('S. Patel');

  // Map: { [vehicleId]: targetSlotId }
  const [slotAssignments, setSlotAssignments] = useState({});
  // Currently highlighted vehicle waiting to click a destination slot
  const [activeVehicleId, setActiveVehicleId] = useState(null);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await operatorApi.getDashboardBundle();
      setBundle(data);
    } catch (err) {
      setError(err.message || 'Could not load hub & slot data.');
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const hubs = bundle?.hubUtilization?.hubs || [];
  const allSlots = bundle?.manageParking?.parkingSlots || [];
  const allVehicles = bundle?.vehicleCharging?.vehicles || [];

  const sourceHub = hubs.find((h) => h.id === Number(sourceHubId));
  const destinationHub = hubs.find((h) => h.id === Number(destinationHubId));
  const isSameHub = Number(sourceHubId) === Number(destinationHubId);

  // Source Hub: AVAILABLE vehicles (with their current slot S1 -> V1)
  const sourceVehicles = useMemo(() => {
    return allVehicles
      .filter((v) => v.currentHubId === Number(sourceHubId) && v.status === 'AVAILABLE')
      .map((v) => {
        const slot = allSlots.find((s) => s.id === v.parkingSlotId);
        return {
          ...v,
          slotCode: v.parkingSlotCode || slot?.slotCode || 'Unassigned',
        };
      });
  }, [allVehicles, allSlots, sourceHubId]);

  // Destination Hub: Rental-compatible slots (SHARED_EV & UNIVERSAL)
  const destinationSlots = useMemo(() => {
    return allSlots
      .filter(
        (s) =>
          s.hubId === Number(destinationHubId) &&
          (s.slotType === 'SHARED_EV' || s.slotType === 'UNIVERSAL')
      )
      .map((s) => {
        const parkedVehicle = allVehicles.find((v) => v.parkingSlotId === s.id);
        // Check if this slot is being vacated in the current plan (when rearranging within same hub)
        const isBeingVacated =
          parkedVehicle && slotAssignments[parkedVehicle.id] !== undefined;
        return {
          ...s,
          parkedVehicle,
          effectiveFree: s.status === 'FREE' || isBeingVacated,
        };
      });
  }, [allSlots, allVehicles, destinationHubId, slotAssignments]);

  // Reverse lookup: { [targetSlotId]: vehicleObject }
  const incomingByDestSlot = useMemo(() => {
    const map = {};
    Object.entries(slotAssignments).forEach(([vId, slotId]) => {
      const veh = allVehicles.find((v) => v.id === Number(vId));
      if (veh && slotId) {
        const fromSlot = allSlots.find((s) => s.id === veh.parkingSlotId);
        map[Number(slotId)] = {
          ...veh,
          fromSlotCode: veh.parkingSlotCode || fromSlot?.slotCode || '—',
        };
      }
    });
    return map;
  }, [slotAssignments, allVehicles, allSlots]);

  const plannedAllocations = useMemo(() => {
    return Object.entries(slotAssignments)
      .map(([vId, toSlotId]) => {
        const veh = allVehicles.find((v) => v.id === Number(vId));
        const fromSlot = allSlots.find((s) => s.id === veh?.parkingSlotId);
        const toSlot = allSlots.find((s) => s.id === Number(toSlotId));
        if (!veh || !toSlot) return null;
        return {
          vehicleId: veh.id,
          vehicleCode: veh.code,
          batteryLevel: veh.batteryLevel,
          fromSlotId: fromSlot?.id || null,
          fromSlotCode: veh.parkingSlotCode || fromSlot?.slotCode || '—',
          toSlotId: toSlot.id,
          toSlotCode: toSlot.slotCode,
        };
      })
      .filter(Boolean);
  }, [slotAssignments, allVehicles, allSlots]);

  const handleSourceChange = (nextHubId) => {
    setSourceHubId(Number(nextHubId));
    setSlotAssignments({});
    setActiveVehicleId(null);
    setMessage('');
    setError('');
  };

  const handleDestinationSelect = (nextHubId) => {
    setDestinationHubId(Number(nextHubId));
    setSlotAssignments({});
    setActiveVehicleId(null);
    setMessage('');
    setError('');
  };

  const assignVehicleToSlot = (vehicleId, targetSlotId) => {
    setError('');
    setMessage('');
    const veh = allVehicles.find((v) => v.id === Number(vehicleId));
    setSlotAssignments((prev) => {
      const next = { ...prev };
      if (!targetSlotId || (veh && Number(veh.parkingSlotId) === Number(targetSlotId))) {
        delete next[vehicleId];
        return next;
      }
      // Remove any other vehicle previously assigned to this same destination slot
      Object.keys(next).forEach((otherVid) => {
        if (Number(next[otherVid]) === Number(targetSlotId)) {
          delete next[otherVid];
        }
      });
      next[vehicleId] = Number(targetSlotId);
      return next;
    });
    setActiveVehicleId(null);
  };

  const handleSlotCardClick = (slot) => {
    const incomingVeh = incomingByDestSlot[slot.id];

    // If a vehicle is actively highlighted on the left, place it into this free slot!
    if (activeVehicleId) {
      if (!slot.effectiveFree && !incomingVeh) {
        setError(`Slot ${slot.slotCode} is currently ${slot.status.toLowerCase()}. Please choose a FREE slot.`);
        return;
      }
      assignVehicleToSlot(activeVehicleId, slot.id);
      return;
    }

    // If clicking an already-assigned incoming slot without an active vehicle, unassign it
    if (incomingVeh) {
      assignVehicleToSlot(incomingVeh.id, null);
      return;
    }

    // If clicking an occupied slot in Destination Hub (same-hub rearrange shortcut), select that vehicle to move!
    if (isSameHub && slot.parkedVehicle?.status === 'AVAILABLE') {
      setActiveVehicleId(slot.parkedVehicle.id);
    }
  };

  const handleAutoArrange = () => {
    setError('');
    setMessage('');
    const freeSlots = destinationSlots.filter((s) => s.status === 'FREE');
    const sortedVehicles = [...sourceVehicles].sort((a, b) => b.batteryLevel - a.batteryLevel);
    const next = {};
    const count = Math.min(freeSlots.length, sortedVehicles.length);
    for (let i = 0; i < count; i += 1) {
      next[sortedVehicles[i].id] = freeSlots[i].id;
    }
    setSlotAssignments(next);
    setActiveVehicleId(null);
  };

  const handleClear = () => {
    setSlotAssignments({});
    setActiveVehicleId(null);
    setError('');
    setMessage('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (plannedAllocations.length === 0) {
      setError('Please select at least 1 vehicle and assign it to a destination slot.');
      return;
    }
    try {
      setSubmitting(true);
      setError('');
      setMessage('');
      const res = await operatorApi.redistributeVehicles({
        sourceHubId: Number(sourceHubId),
        destinationHubId: Number(destinationHubId),
        vehicleCount: plannedAllocations.length,
        assignedStaff,
        reason: isSameHub
          ? `Slot rearrangement at ${destinationHub?.name} by ${assignedStaff}`
          : `Dispatch to ${destinationHub?.name} assigned to ${assignedStaff}`,
        allocations: plannedAllocations,
      });
      const summaryPairs = plannedAllocations
        .map((a) => `${a.vehicleCode} (${a.fromSlotCode} → ${a.toSlotCode})`)
        .join(', ');
      setSlotAssignments({});
      setActiveVehicleId(null);
      await loadData();
      setMessage(
        `${isSameHub ? 'Rearranged' : `Dispatch ${res.orderCode || ''} completed`}: ${summaryPairs} · Staff: ${assignedStaff}`
      );
    } catch (err) {
      setError(err.message || 'Could not execute dispatch arrangement.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <h1 className="staff-page-title">Dispatch &amp; slot arrangement</h1>

      <form onSubmit={handleSubmit} className="staff-panel staff-panel--full">
        {/* Step 1: Hub Selectors & Clickable Destination Hub Tabs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 20,
            alignItems: 'end',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 16, fontWeight: 600, color: 'var(--staff-forest)' }}>
              1. Source hub (pick vehicles from)
            </label>
            <select
              className="staff-field-green"
              style={{ height: 50, fontSize: 16 }}
              value={sourceHubId}
              onChange={(e) => handleSourceChange(e.target.value)}
            >
              {hubs.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} ({h.availableVehicles} available)
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 16, fontWeight: 600, color: 'var(--staff-forest)' }}>
              Assigned staff
            </label>
            <select
              className="staff-field-green"
              style={{ height: 50, fontSize: 16 }}
              value={assignedStaff}
              onChange={(e) => setAssignedStaff(e.target.value)}
            >
              {STAFF_MEMBERS.map((person) => (
                <option key={person} value={person}>
                  {person}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Clickable Destination Hub Cards — click any Hub to arrange vehicles into its slots */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--staff-forest)' }}>
              2. Click target hub to open &amp; arrange its parking slots:
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {!isSameHub && (
                <button
                  type="button"
                  className="staff-pill-btn staff-pill-btn--soft"
                  style={{ minHeight: 36, padding: '6px 14px', fontSize: 14 }}
                  onClick={handleAutoArrange}
                >
                  Auto-pair by battery
                </button>
              )}
              {plannedAllocations.length > 0 && (
                <button
                  type="button"
                  className="staff-pill-btn staff-pill-btn--soft"
                  style={{ minHeight: 36, padding: '6px 14px', fontSize: 14 }}
                  onClick={handleClear}
                >
                  Reset ({plannedAllocations.length})
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {hubs.map((h) => {
              const selected = h.id === Number(destinationHubId);
              const hubFreeCount = allSlots.filter(
                (s) =>
                  s.hubId === h.id &&
                  (s.slotType === 'SHARED_EV' || s.slotType === 'UNIVERSAL') &&
                  s.status === 'FREE'
              ).length;
              return (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => handleDestinationSelect(h.id)}
                  style={{
                    textAlign: 'left',
                    padding: '14px 16px',
                    borderRadius: 14,
                    border: selected ? '2px solid #34c759' : '1px solid var(--staff-divider)',
                    background: selected ? 'var(--staff-pill-active)' : 'var(--staff-pill)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 15.5, color: 'var(--staff-forest)' }}>
                    {h.name}
                  </div>
                  <div style={{ fontSize: 13.5, color: 'var(--staff-olive)', marginTop: 4 }}>
                    {hubFreeCount} free slot{hubFreeCount === 1 ? '' : 's'} · {h.availableVehicles} vehicles
                    {h.id === Number(sourceHubId) ? ' · (Same hub rearrange)' : ''}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Side-by-Side Slot-to-Slot Board (Source S1->V1 ===> Destination Slots S1, S2, S4) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: 24,
            alignItems: 'start',
          }}
        >
          {/* LEFT BOX: Source Hub Slots -> Vehicles */}
          <div
            style={{
              background: 'var(--staff-pill)',
              borderRadius: 16,
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--staff-forest)' }}>
                Source: {sourceHub?.name || 'Hub'}
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--staff-muted)', marginTop: 2 }}>
                Click a vehicle below, then click a FREE slot on the right (or pick from dropdown)
              </div>
            </div>

            {sourceVehicles.length === 0 ? (
              <p style={{ color: 'var(--staff-muted)', margin: '8px 0' }}>
                No AVAILABLE vehicles at this hub to move.
              </p>
            ) : (
              sourceVehicles.map((veh) => {
                const isSelected = activeVehicleId === veh.id;
                const assignedSlotId = slotAssignments[veh.id] || '';
                const assignedSlotObj = destinationSlots.find((s) => s.id === Number(assignedSlotId));

                return (
                  <div
                    key={veh.id}
                    onClick={() => setActiveVehicleId(isSelected ? null : veh.id)}
                    style={{
                      background: isSelected
                        ? '#cdf4cf'
                        : assignedSlotId
                        ? '#ffffff'
                        : 'rgba(255,255,255,0.75)',
                      border: isSelected
                        ? '2px solid #2b581c'
                        : assignedSlotId
                        ? '1.5px solid #34c759'
                        : '1px solid var(--staff-divider)',
                      borderRadius: 12,
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      cursor: 'pointer',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="staff-zone-badge" style={{ fontSize: 14, padding: '4px 10px' }}>
                        {veh.slotCode}
                      </span>
                      <span style={{ color: 'var(--staff-muted)', fontWeight: 600 }}>→</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--staff-ink)' }}>
                          {veh.code}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--staff-muted)' }}>
                          Battery {veh.batteryLevel}%
                        </div>
                      </div>
                    </div>

                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <select
                        className="staff-pill-select"
                        style={{
                          background: assignedSlotObj ? '#cdf4cf' : '#eff9eb',
                          padding: '7px 12px',
                          fontSize: 14,
                          fontWeight: assignedSlotObj ? 600 : 400,
                        }}
                        value={assignedSlotId}
                        onChange={(e) =>
                          assignVehicleToSlot(
                            veh.id,
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                      >
                        <option value="">Select target slot...</option>
                        {destinationSlots
                          .filter(
                            (s) =>
                              s.id !== veh.parkingSlotId &&
                              (s.effectiveFree || Number(slotAssignments[veh.id]) === s.id)
                          )
                          .map((s) => {
                            const takenByOther =
                              incomingByDestSlot[s.id] &&
                              incomingByDestSlot[s.id].id !== veh.id;
                            return (
                              <option key={s.id} value={s.id}>
                                → Slot {s.slotCode}
                                {takenByOther ? ` (replace ${incomingByDestSlot[s.id].code})` : ' (FREE)'}
                              </option>
                            );
                          })}
                      </select>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* RIGHT BOX: Destination Hub Parking Slots */}
          <div
            style={{
              background: 'var(--staff-pill)',
              borderRadius: 16,
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--staff-forest)' }}>
                Target slots at: {destinationHub?.name || 'Hub'}
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--staff-muted)', marginTop: 2 }}>
                {activeVehicleId
                  ? `Now click any FREE slot below to place ${
                      allVehicles.find((v) => v.id === activeVehicleId)?.code || 'selected vehicle'
                    }`
                  : 'Shows exact slot layout after arrangement (click an assigned slot to undo)'}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 10 }}>
              {destinationSlots.map((slot) => {
                const incoming = incomingByDestSlot[slot.id];
                const isOccupiedStay =
                  !incoming && slot.status !== 'FREE' && !slot.effectiveFree;

                return (
                  <div
                    key={slot.id}
                    onClick={() => handleSlotCardClick(slot)}
                    style={{
                      background: incoming
                        ? '#cdf4cf'
                        : slot.effectiveFree
                        ? '#ffffff'
                        : '#f3f5ef',
                      border: incoming
                        ? '2px solid #2b581c'
                        : activeVehicleId && slot.effectiveFree
                        ? '2px dashed #34c759'
                        : '1px solid var(--staff-divider)',
                      borderRadius: 12,
                      padding: '12px 14px',
                      cursor:
                        incoming ||
                        slot.effectiveFree ||
                        (isSameHub && slot.parkedVehicle?.status === 'AVAILABLE')
                          ? 'pointer'
                          : 'default',
                      opacity: isOccupiedStay ? 0.72 : 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: 15.5, color: 'var(--staff-forest)' }}>
                        {slot.slotCode}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--staff-olive)' }}>
                        {incoming ? 'ASSIGNED' : slot.effectiveFree ? 'FREE' : slot.status}
                      </span>
                    </div>

                    {incoming ? (
                      <div style={{ fontSize: 13.5, color: '#182b20', fontWeight: 600, marginTop: 2 }}>
                        ← {incoming.code} ({incoming.batteryLevel}%)
                        <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--staff-olive)' }}>
                          from {incoming.fromSlotCode} · click to clear
                        </div>
                      </div>
                    ) : slot.effectiveFree ? (
                      <div style={{ fontSize: 13, color: '#34c759', fontWeight: 500, marginTop: 2 }}>
                        {activeVehicleId ? '+ Click to place here' : 'Empty · Ready'}
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: 'var(--staff-muted)', marginTop: 2 }}>
                        {slot.parkedVehicle
                          ? `Parked: ${slot.parkedVehicle.code}`
                          : slot.vehiclePlate || 'Unavailable'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {error && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 16px', borderRadius: 12, fontSize: 15 }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{ background: '#eff9eb', color: '#2b581c', padding: '12px 16px', borderRadius: 12, fontSize: 15.5, fontWeight: 500 }}>
            ✓ {message}
          </div>
        )}

        {/* Step 3: Planned Slot Mapping Summary & Submit */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            paddingTop: 6,
            borderTop: '1px solid var(--staff-divider)',
          }}
        >
          <div style={{ fontSize: 15.5, color: 'var(--staff-ink)' }}>
            {plannedAllocations.length === 0 ? (
              <span style={{ color: 'var(--staff-muted)' }}>
                No vehicle-to-slot pairs arranged yet.
              </span>
            ) : (
              <span>
                <strong>Planned ({plannedAllocations.length}): </strong>
                {plannedAllocations.map((a, idx) => (
                  <span key={a.vehicleId}>
                    {idx > 0 ? ' · ' : ''}
                    <strong>{a.vehicleCode}</strong> ({a.fromSlotCode} → <strong>{a.toSlotCode}</strong>)
                  </span>
                ))}
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting || plannedAllocations.length === 0}
            className="staff-pill-btn"
          >
            {submitting
              ? 'Applying arrangement...'
              : isSameHub
              ? `Save slot arrangement (${plannedAllocations.length})`
              : `Submit dispatch (${plannedAllocations.length} vehicle${plannedAllocations.length === 1 ? '' : 's'})`}
          </button>
        </div>
      </form>
    </>
  );
}

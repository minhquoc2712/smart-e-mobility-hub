import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { operatorApi } from '../../api';

const STAFF_MEMBERS = ['S. Patel', 'A. Lee', 'M. Tran', 'K. Nguyen'];

/**
 * Staff / Dispatch & Multi-Zone Slot Arrangement (Task 3.3a & Task 4.1a)
 * Combines:
 *  - Figma top controls (Source hub, Destination hub, Vehicle quantity, Assigned staff)
 *  - Interactive slot-to-slot arrangement (S1 -> V1 ===> Dest Slot S2, S2 -> V2 ===> Dest Slot S1...)
 *  - Explicit separation of multiple parking zones inside each Hub:
 *      * Zone A · Rental parking (SHARED_EV — primary fleet slots)
 *      * Zone C · Universal & Customer parking (UNIVERSAL overflow OK; PRIVATE_EV locked for customers)
 *  - Same-hub slot rearrangement when Source hub === Destination hub
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

  // Source Hub: AVAILABLE vehicles (with their current parking zone & slot S1 -> V1)
  const sourceVehicles = useMemo(() => {
    return allVehicles
      .filter((v) => v.currentHubId === Number(sourceHubId) && v.status === 'AVAILABLE')
      .map((v) => {
        const slot = allSlots.find((s) => s.id === v.parkingSlotId);
        const slotType = slot?.slotType || 'SHARED_EV';
        return {
          ...v,
          slotCode: v.parkingSlotCode || slot?.slotCode || 'Unassigned',
          zoneCode: slotType === 'SHARED_EV' ? 'A' : 'C',
          slotType,
        };
      });
  }, [allVehicles, allSlots, sourceHubId]);

  // Destination Hub: All parking slots enriched with Zone A (SHARED_EV) vs Zone C (UNIVERSAL / PRIVATE_EV)
  const destinationAllSlots = useMemo(() => {
    return allSlots
      .filter((s) => s.hubId === Number(destinationHubId))
      .map((s) => {
        const parkedVehicle = allVehicles.find((v) => v.parkingSlotId === s.id);
        const isFleetCompatible = s.slotType === 'SHARED_EV' || s.slotType === 'UNIVERSAL';
        const isBeingVacated =
          parkedVehicle && slotAssignments[parkedVehicle.id] !== undefined;
        const effectiveFree =
          isFleetCompatible && (s.status === 'FREE' || isBeingVacated);

        return {
          ...s,
          zoneCode: s.slotType === 'SHARED_EV' ? 'A' : 'C',
          isFleetCompatible,
          parkedVehicle,
          effectiveFree,
        };
      });
  }, [allSlots, allVehicles, destinationHubId, slotAssignments]);

  const zoneASlots = useMemo(
    () => destinationAllSlots.filter((s) => s.zoneCode === 'A'),
    [destinationAllSlots]
  );
  const zoneCSlots = useMemo(
    () => destinationAllSlots.filter((s) => s.zoneCode === 'C'),
    [destinationAllSlots]
  );

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
          toZoneCode: toSlot.slotType === 'SHARED_EV' ? 'A' : 'C',
        };
      })
      .filter(Boolean);
  }, [slotAssignments, allVehicles, allSlots]);

  // Priority-ordered free fleet slots at destination: Zone A (SHARED_EV) first, then Zone C (UNIVERSAL)
  const orderedFreeFleetSlots = useMemo(() => {
    const freeA = zoneASlots.filter((s) => s.status === 'FREE');
    const freeUniversal = zoneCSlots.filter(
      (s) => s.slotType === 'UNIVERSAL' && s.status === 'FREE'
    );
    return [...freeA, ...freeUniversal];
  }, [zoneASlots, zoneCSlots]);

  const maxAutoPairCount = Math.min(sourceVehicles.length, orderedFreeFleetSlots.length);

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

  const handleQuantityChange = (rawValue) => {
    setError('');
    setMessage('');
    const desired = Math.max(0, Math.min(maxAutoPairCount, Number(rawValue) || 0));
    if (desired === 0) {
      setSlotAssignments({});
      setActiveVehicleId(null);
      return;
    }
    const sortedVehicles = [...sourceVehicles].sort((a, b) => b.batteryLevel - a.batteryLevel);
    const next = {};
    for (let i = 0; i < desired; i += 1) {
      if (sortedVehicles[i] && orderedFreeFleetSlots[i]) {
        next[sortedVehicles[i].id] = orderedFreeFleetSlots[i].id;
      }
    }
    setSlotAssignments(next);
    setActiveVehicleId(null);
  };

  const handleSlotCardClick = (slot) => {
    if (!slot.isFleetCompatible) {
      setError(
        `Slot ${slot.slotCode} is reserved for Private Customer EVs (Zone C). Please choose a Zone A (Rental) or Universal slot.`
      );
      return;
    }

    const incomingVeh = incomingByDestSlot[slot.id];

    if (activeVehicleId) {
      if (!slot.effectiveFree && !incomingVeh) {
        setError(
          `Slot ${slot.slotCode} is currently ${slot.status.toLowerCase()}. Please choose a FREE slot.`
        );
        return;
      }
      assignVehicleToSlot(activeVehicleId, slot.id);
      return;
    }

    if (incomingVeh) {
      assignVehicleToSlot(incomingVeh.id, null);
      return;
    }

    if (isSameHub && slot.parkedVehicle?.status === 'AVAILABLE') {
      setActiveVehicleId(slot.parkedVehicle.id);
    }
  };

  const handleAutoArrange = () => {
    handleQuantityChange(maxAutoPairCount);
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
      setError('Please arrange at least 1 vehicle into a specific parking slot before submitting.');
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
        .map((a) => `${a.vehicleCode} (${a.fromSlotCode} → Zone ${a.toZoneCode} · ${a.toSlotCode})`)
        .join(', ');
      setSlotAssignments({});
      setActiveVehicleId(null);
      await loadData();
      setMessage(
        `${isSameHub ? 'Saved slot arrangement' : `Dispatch ${res.orderCode || ''} completed`}: ${summaryPairs} · Staff: ${assignedStaff}`
      );
    } catch (err) {
      setError(err.message || 'Could not execute dispatch arrangement.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderSlotCard = (slot) => {
    const incoming = incomingByDestSlot[slot.id];
    const isLockedPrivate = !slot.isFleetCompatible;
    const isOccupiedStay =
      !incoming && slot.status !== 'FREE' && !slot.effectiveFree;

    return (
      <div
        key={slot.id}
        onClick={() => handleSlotCardClick(slot)}
        style={{
          background: incoming
            ? '#cdf4cf'
            : isLockedPrivate
            ? '#f5f6f0'
            : slot.effectiveFree
            ? '#ffffff'
            : '#f3f5ef',
          border: incoming
            ? '2px solid #2b581c'
            : activeVehicleId && slot.effectiveFree
            ? '2px dashed #34c759'
            : '1px solid var(--staff-divider)',
          borderRadius: 12,
          padding: '11px 13px',
          cursor:
            !isLockedPrivate &&
            (incoming ||
              slot.effectiveFree ||
              (isSameHub && slot.parkedVehicle?.status === 'AVAILABLE'))
              ? 'pointer'
              : 'not-allowed',
          opacity: isLockedPrivate ? 0.62 : isOccupiedStay ? 0.76 : 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--staff-forest)' }}>
            {slot.slotCode}
          </span>
          <span
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              color: incoming ? '#182b20' : 'var(--staff-olive)',
            }}
          >
            {incoming
              ? 'ASSIGNED'
              : isLockedPrivate
              ? 'PRIVATE'
              : slot.effectiveFree
              ? 'FREE'
              : slot.status}
          </span>
        </div>

        {incoming ? (
          <div style={{ fontSize: 13, color: '#182b20', fontWeight: 600, marginTop: 2 }}>
            ← {incoming.code} ({incoming.batteryLevel}%)
            <div style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--staff-olive)' }}>
              from {incoming.fromSlotCode} · click to undo
            </div>
          </div>
        ) : isLockedPrivate ? (
          <div style={{ fontSize: 12, color: 'var(--staff-muted)', marginTop: 2 }}>
            Customer EV only
            {slot.vehiclePlate ? ` (${slot.vehiclePlate})` : ''}
          </div>
        ) : slot.effectiveFree ? (
          <div style={{ fontSize: 12.5, color: '#2b7a38', fontWeight: 500, marginTop: 2 }}>
            {activeVehicleId
              ? '+ Click to place here'
              : slot.slotType === 'UNIVERSAL'
              ? 'Universal · Ready'
              : 'Rental slot · Ready'}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: 'var(--staff-muted)', marginTop: 2 }}>
            {slot.parkedVehicle
              ? `Parked: ${slot.parkedVehicle.code}${isSameHub ? ' (click to move)' : ''}`
              : slot.vehiclePlate || 'Unavailable'}
          </div>
        )}
      </div>
    );
  };

  // Projected utilization of Zone A & Zone C after planned assignments
  const zoneAUsedAfter = zoneASlots.filter(
    (s) => incomingByDestSlot[s.id] || (!s.effectiveFree && s.status !== 'FREE')
  ).length;
  const zoneAPctAfter = zoneASlots.length
    ? Math.round((zoneAUsedAfter * 100) / zoneASlots.length)
    : 0;

  const zoneCUsedAfter = zoneCSlots.filter(
    (s) => incomingByDestSlot[s.id] || (!s.effectiveFree && s.status !== 'FREE')
  ).length;
  const zoneCPctAfter = zoneCSlots.length
    ? Math.round((zoneCUsedAfter * 100) / zoneCSlots.length)
    : 0;

  return (
    <>
      <h1 className="staff-page-title">Dispatch</h1>

      <form onSubmit={handleSubmit} className="staff-panel staff-panel--full">
        {/* Top 2x2 Figma Controls — synced live with Slot-to-Slot Arrangement Board below */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: 18,
            alignItems: 'end',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <label style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--staff-forest)' }}>
              Source hub
            </label>
            <select
              className="staff-field-green"
              style={{ height: 48, fontSize: 15.5 }}
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <label style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--staff-forest)' }}>
              Destination hub
            </label>
            <select
              className="staff-field-green"
              style={{ height: 48, fontSize: 15.5 }}
              value={destinationHubId}
              onChange={(e) => handleDestinationSelect(e.target.value)}
            >
              {hubs.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                  {h.id === Number(sourceHubId) ? ' (Rearrange inside hub)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <label style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--staff-forest)' }}>
              Vehicle quantity (auto-pairs slots)
            </label>
            <input
              type="number"
              min={0}
              max={maxAutoPairCount}
              className="staff-field-green"
              style={{ height: 48, fontSize: 15.5 }}
              value={plannedAllocations.length}
              onChange={(e) => handleQuantityChange(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <label style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--staff-forest)' }}>
              Assigned staff
            </label>
            <select
              className="staff-field-green"
              style={{ height: 48, fontSize: 15.5 }}
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

        {/* Clickable Hub Selector Strip — click any Hub to inspect & arrange its parking zones */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--staff-forest)' }}>
              Click destination hub to open its parking zones &amp; arrange exact slots:
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {!isSameHub && maxAutoPairCount > 0 && (
                <button
                  type="button"
                  className="staff-pill-btn staff-pill-btn--soft"
                  style={{ minHeight: 36, padding: '6px 14px', fontSize: 14 }}
                  onClick={handleAutoArrange}
                >
                  Auto-pair Zone A first ({maxAutoPairCount})
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

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 10,
            }}
          >
            {hubs.map((h) => {
              const selected = h.id === Number(destinationHubId);
              const freeZoneA = allSlots.filter(
                (s) => s.hubId === h.id && s.slotType === 'SHARED_EV' && s.status === 'FREE'
              ).length;
              const freeZoneCUniv = allSlots.filter(
                (s) => s.hubId === h.id && s.slotType === 'UNIVERSAL' && s.status === 'FREE'
              ).length;

              return (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => handleDestinationSelect(h.id)}
                  style={{
                    textAlign: 'left',
                    padding: '12px 15px',
                    borderRadius: 14,
                    border: selected ? '2px solid #34c759' : '1px solid var(--staff-divider)',
                    background: selected ? 'var(--staff-pill-active)' : 'var(--staff-pill)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--staff-forest)' }}>
                    {h.name}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--staff-olive)', marginTop: 4 }}>
                    Zone A: {freeZoneA} free · Zone C (Univ): {freeZoneCUniv} free
                    {h.id === Number(sourceHubId) ? ' · Same hub' : ''}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Interactive 2-Column Board: Source (Slot -> Vehicle) ===> Multi-Zone Destination Slots */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: 22,
            alignItems: 'start',
          }}
        >
          {/* LEFT COLUMN: Source Hub Vehicles (S1 -> V1) */}
          <div
            style={{
              background: 'var(--staff-pill)',
              borderRadius: 16,
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 17.5, fontWeight: 600, color: 'var(--staff-forest)' }}>
                Source vehicles · {sourceHub?.name || 'Hub'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--staff-muted)', marginTop: 2 }}>
                Click a vehicle row below, then click any FREE slot in Zone A or Zone C on the right
              </div>
            </div>

            {sourceVehicles.length === 0 ? (
              <p style={{ color: 'var(--staff-muted)', margin: '8px 0' }}>
                No AVAILABLE vehicles at this hub to arrange.
              </p>
            ) : (
              sourceVehicles.map((veh) => {
                const isSelected = activeVehicleId === veh.id;
                const assignedSlotId = slotAssignments[veh.id] || '';
                const assignedSlotObj = destinationAllSlots.find(
                  (s) => s.id === Number(assignedSlotId)
                );

                const availableZoneAOptions = zoneASlots.filter(
                  (s) =>
                    s.id !== veh.parkingSlotId &&
                    (s.effectiveFree || Number(slotAssignments[veh.id]) === s.id)
                );
                const availableZoneCOptions = zoneCSlots.filter(
                  (s) =>
                    s.isFleetCompatible &&
                    s.id !== veh.parkingSlotId &&
                    (s.effectiveFree || Number(slotAssignments[veh.id]) === s.id)
                );

                return (
                  <div
                    key={veh.id}
                    onClick={() => setActiveVehicleId(isSelected ? null : veh.id)}
                    style={{
                      background: isSelected
                        ? '#cdf4cf'
                        : assignedSlotId
                        ? '#ffffff'
                        : 'rgba(255,255,255,0.78)',
                      border: isSelected
                        ? '2px solid #2b581c'
                        : assignedSlotId
                        ? '1.5px solid #34c759'
                        : '1px solid var(--staff-divider)',
                      borderRadius: 12,
                      padding: '11px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      cursor: 'pointer',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        className="staff-zone-badge"
                        style={{
                          width: 'auto',
                          height: 'auto',
                          fontSize: 13,
                          padding: '4px 9px',
                          borderRadius: 8,
                        }}
                      >
                        Zone {veh.zoneCode} · {veh.slotCode}
                      </span>
                      <span style={{ color: 'var(--staff-muted)', fontWeight: 700 }}>→</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15.5, color: 'var(--staff-ink)' }}>
                          {veh.code}
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--staff-muted)' }}>
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
                          padding: '7px 11px',
                          fontSize: 13.5,
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
                        <option value="">Choose target slot...</option>
                        {availableZoneAOptions.length > 0 && (
                          <optgroup label="Zone A · Rental parking (Shared EV)">
                            {availableZoneAOptions.map((s) => {
                              const taken =
                                incomingByDestSlot[s.id] &&
                                incomingByDestSlot[s.id].id !== veh.id;
                              return (
                                <option key={s.id} value={s.id}>
                                  → Zone A · {s.slotCode}
                                  {taken ? ` (replace ${incomingByDestSlot[s.id].code})` : ' (FREE)'}
                                </option>
                              );
                            })}
                          </optgroup>
                        )}
                        {availableZoneCOptions.length > 0 && (
                          <optgroup label="Zone C · Universal overflow parking">
                            {availableZoneCOptions.map((s) => {
                              const taken =
                                incomingByDestSlot[s.id] &&
                                incomingByDestSlot[s.id].id !== veh.id;
                              return (
                                <option key={s.id} value={s.id}>
                                  → Zone C · {s.slotCode}
                                  {taken ? ` (replace ${incomingByDestSlot[s.id].code})` : ' (Universal FREE)'}
                                </option>
                              );
                            })}
                          </optgroup>
                        )}
                      </select>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* RIGHT COLUMN: Destination Hub Parking Lots separated by Zone A vs Zone C */}
          <div
            style={{
              background: 'var(--staff-pill)',
              borderRadius: 16,
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div>
              <div style={{ fontSize: 17.5, fontWeight: 600, color: 'var(--staff-forest)' }}>
                Parking lots at · {destinationHub?.name || 'Hub'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--staff-muted)', marginTop: 2 }}>
                {activeVehicleId
                  ? `Click a FREE slot in Zone A or Zone C below to place ${
                      allVehicles.find((v) => v.id === activeVehicleId)?.code || 'selected vehicle'
                    }`
                  : 'Separated by parking zone so each dispatched vehicle lands in the exact right lot'}
              </div>
            </div>

            {/* Parking Lot 1: Zone A — Rental Vehicles (SHARED_EV) */}
            <div
              style={{
                background: 'rgba(255,255,255,0.6)',
                borderRadius: 13,
                padding: 14,
                border: '1px solid #d5ecd4',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    className="staff-zone-badge"
                    style={{ width: 26, height: 26, fontSize: 13, borderRadius: 7 }}
                  >
                    A
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--staff-forest)' }}>
                    Zone A · Rental fleet parking (Shared EV)
                  </span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--staff-olive)' }}>
                  Projected: {zoneAUsedAfter}/{zoneASlots.length} ({zoneAPctAfter}%)
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
                  gap: 9,
                }}
              >
                {zoneASlots.map(renderSlotCard)}
              </div>
            </div>

            {/* Parking Lot 2: Zone C — Universal Overflow & Private Customer Parking */}
            <div
              style={{
                background: 'rgba(255,255,255,0.6)',
                borderRadius: 13,
                padding: 14,
                border: '1px solid var(--staff-divider)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    className="staff-zone-badge"
                    style={{ width: 26, height: 26, fontSize: 13, borderRadius: 7 }}
                  >
                    C
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--staff-forest)' }}>
                    Zone C · Universal overflow &amp; Customer parking
                  </span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--staff-olive)' }}>
                  Projected: {zoneCUsedAfter}/{zoneCSlots.length} ({zoneCPctAfter}%)
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
                  gap: 9,
                }}
              >
                {zoneCSlots.map(renderSlotCard)}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div
            style={{
              background: '#fee2e2',
              color: '#991b1b',
              padding: '10px 16px',
              borderRadius: 12,
              fontSize: 15,
            }}
          >
            {error}
          </div>
        )}

        {message && (
          <div
            style={{
              background: '#eff9eb',
              color: '#2b581c',
              padding: '12px 16px',
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 500,
            }}
          >
            ✓ {message}
          </div>
        )}

        {/* Bottom Planned Summary & Submit Button */}
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
          <div style={{ fontSize: 15, color: 'var(--staff-ink)' }}>
            {plannedAllocations.length === 0 ? (
              <span style={{ color: 'var(--staff-muted)' }}>
                Select vehicles on the left and assign their target parking slots on the right.
              </span>
            ) : (
              <span>
                <strong>Planned ({plannedAllocations.length}): </strong>
                {plannedAllocations.map((a, idx) => (
                  <span key={a.vehicleId}>
                    {idx > 0 ? ' · ' : ''}
                    <strong>{a.vehicleCode}</strong> ({a.fromSlotCode} → Zone {a.toZoneCode} ·{' '}
                    <strong>{a.toSlotCode}</strong>)
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
              : `Submit dispatch (${plannedAllocations.length})`}
          </button>
        </div>
      </form>
    </>
  );
}

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { operatorApi, parkingSlotApi } from '../../api';

function formatClock(dateStr) {
  if (!dateStr) return '08:30';
  if (/^\d{2}:\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '08:30';
  return d.toTimeString().slice(0, 5);
}

function formatDuration(dateStr, fallback) {
  if (fallback) return fallback;
  if (!dateStr) return '1h 15m';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '1h 15m';
  const diffMin = Math.max(5, Math.floor((Date.now() - d.getTime()) / 60000));
  if (diffMin >= 60) {
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }
  return `${diffMin}m`;
}

function slotCodeRange(codes, fallback) {
  if (!codes.length) return fallback;
  if (codes.length === 1) return codes[0];
  return `${codes[0]}–${codes[codes.length - 1]}`;
}

/**
 * Staff / Manage parking (Task 3.3a — Figma node 127:16)
 */
export function ManageParkingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [bundle, setBundle] = useState(null);
  const [selectedHubId, setSelectedHubId] = useState(Number(searchParams.get('hubId')) || 2);
  const [zoneFilter, setZoneFilter] = useState('ALL');
  const [searchText, setSearchText] = useState('');
  const [manageSpacesOpen, setManageSpacesOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkInPlate, setCheckInPlate] = useState('');
  const [checkInSlotId, setCheckInSlotId] = useState('');
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [feedback, setFeedback] = useState('');

  const loadData = useCallback(async () => {
    const data = await operatorApi.getDashboardBundle();
    setBundle(data);
    const hubs = data.hubUtilization?.hubs || [];
    if (hubs.length && !hubs.some((h) => h.id === Number(selectedHubId))) {
      setSelectedHubId(hubs[0].id);
    }
  }, [selectedHubId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const hubs = bundle?.hubUtilization?.hubs || [];
  const currentHub = hubs.find((h) => h.id === Number(selectedHubId)) || hubs[0];

  const hubSlots = useMemo(
    () => (bundle?.manageParking?.parkingSlots || []).filter((s) => s.hubId === currentHub?.id),
    [bundle, currentHub]
  );
  const hubChargers = useMemo(
    () => (bundle?.vehicleCharging?.chargingPoints || []).filter((c) => c.hubId === currentHub?.id),
    [bundle, currentHub]
  );
  const hubVehicles = useMemo(
    () => (bundle?.vehicleCharging?.vehicles || []).filter((v) => v.currentHubId === currentHub?.id),
    [bundle, currentHub]
  );

  // Zone A: Rental vehicles (SHARED_EV slots)
  const rentalSlots = hubSlots.filter((s) => s.slotType === 'SHARED_EV');
  const occupiedA = rentalSlots.filter((s) => s.status === 'OCCUPIED' || s.status === 'RESERVED').length;
  const freeA = rentalSlots.filter((s) => s.status === 'FREE').length;
  const totalA = rentalSlots.length || Math.ceil((currentHub?.totalParkingSlots || 12) / 2);

  // Zone B: Charging area (Charging points at this hub)
  const occupiedB = hubChargers.filter((c) => c.status === 'CHARGING' || c.status === 'RESERVED').length;
  const freeB = hubChargers.filter((c) => c.status === 'AVAILABLE').length;
  const totalB = hubChargers.length || currentHub?.totalChargingPoints || 6;

  // Zone C: Customer parking (PRIVATE_EV & UNIVERSAL slots)
  const customerSlots = hubSlots.filter((s) => s.slotType !== 'SHARED_EV');
  const occupiedC = customerSlots.filter((s) => s.status === 'OCCUPIED' || s.status === 'RESERVED').length;
  const freeC = customerSlots.filter((s) => s.status === 'FREE').length;
  const totalC = customerSlots.length || Math.floor((currentHub?.totalParkingSlots || 12) / 2);

  const totalSpaces = totalA + totalB + totalC;
  const totalOccupied = occupiedA + occupiedB + occupiedC;
  const totalFree = freeA + freeB + freeC;

  // Build unified parked/charging vehicle rows matching Figma table
  const parkingRecords = useMemo(() => {
    const rows = [];
    const slotById = new Map(hubSlots.map((s) => [s.id, s]));

    // Zone A & B fleet vehicles located at this hub
    hubVehicles.forEach((v) => {
      if (v.status === 'CHARGING') {
        const charger = hubChargers.find((c) => c.currentVehicleId === v.id) || hubChargers[0];
        rows.push({
          key: `veh-${v.id}`,
          label: v.code,
          zoneCode: 'B',
          zoneLabel: 'B · Charging',
          space: charger?.chargerCode || 'B01',
          checkIn: formatClock(v.updatedAt),
          duration: formatDuration(v.updatedAt, '1h 05m'),
          statusText: `Charging · ${v.batteryLevel}%`,
          actionType: 'VIEW',
          detail: `${v.model} · Battery ${v.batteryLevel}% (~${v.estimatedRangeKm} km)`,
        });
      } else if (v.status !== 'IN_USE') {
        const slot = v.parkingSlotId ? slotById.get(v.parkingSlotId) : null;
        rows.push({
          key: `veh-${v.id}`,
          label: v.code,
          zoneCode: 'A',
          zoneLabel: 'A · Rental vehicles',
          space: slot?.slotCode || 'A01',
          checkIn: formatClock(v.updatedAt),
          duration: formatDuration(v.updatedAt, '2h 10m'),
          statusText:
            v.status === 'AVAILABLE'
              ? 'Ready to rent'
              : v.status === 'RESERVED'
                ? 'Reserved hold'
                : 'Maintenance',
          actionType: 'VIEW',
          detail: `${v.model} · Battery ${v.batteryLevel}% · Status ${v.status}`,
        });
      }
    });

    // Zone C occupied/reserved customer parking slots
    customerSlots
      .filter((s) => s.status === 'OCCUPIED' || s.status === 'RESERVED')
      .forEach((s, idx) => {
        const linkedFleet = hubVehicles.some((v) => v.parkingSlotId === s.id);
        if (linkedFleet) return;
        rows.push({
          key: `slot-${s.id}`,
          slotId: s.id,
          label: s.vehiclePlate || `59G2-71${idx + 3}.82`,
          zoneCode: 'C',
          zoneLabel: 'C · Customer',
          space: s.slotCode,
          checkIn: s.checkInAt || formatClock(s.updatedAt),
          duration: formatDuration(s.updatedAt, s.durationLabel || '1h 30m'),
          statusText: s.status === 'RESERVED' ? 'Reserved booking' : 'Parked · no charge',
          actionType: 'CHECKOUT',
          detail: `Customer slot ${s.slotCode} (${s.slotType})`,
        });
      });

    return rows;
  }, [hubVehicles, hubSlots, hubChargers, customerSlots]);

  const filteredRecords = useMemo(() => {
    return parkingRecords.filter((rec) => {
      if (zoneFilter !== 'ALL' && rec.zoneCode !== zoneFilter) return false;
      if (
        searchText.trim() &&
        !rec.label.toLowerCase().includes(searchText.trim().toLowerCase()) &&
        !rec.space.toLowerCase().includes(searchText.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [parkingRecords, zoneFilter, searchText]);

  const freeCustomerSlots = customerSlots.filter((s) => s.status === 'FREE');

  const handleHubChange = (e) => {
    const nextId = Number(e.target.value);
    setSelectedHubId(nextId);
    setSearchParams({ hubId: String(nextId) });
    setSelectedRecord(null);
  };

  const handleCheckInSubmit = async (e) => {
    e.preventDefault();
    const targetSlot = freeCustomerSlots.find((s) => s.id === Number(checkInSlotId)) || freeCustomerSlots[0];
    if (!targetSlot) {
      setFeedback('No free customer/universal slot available at this Hub.');
      return;
    }
    try {
      await parkingSlotApi.updateStatus(targetSlot.id, 'OCCUPIED', {
        vehiclePlate: checkInPlate.trim() || '59X1-889.20',
      });
      setCheckInPlate('');
      setCheckInOpen(false);
      setFeedback(`Checked in vehicle at slot ${targetSlot.slotCode}.`);
      await loadData();
    } catch (err) {
      setFeedback(err.message || 'Check-in failed.');
    }
  };

  const handleCheckoutSlot = async (slotId, slotCode) => {
    try {
      await parkingSlotApi.updateStatus(slotId, 'FREE');
      setFeedback(`Checked out slot ${slotCode} → now FREE.`);
      await loadData();
    } catch (err) {
      setFeedback(err.message || 'Could not release slot.');
    }
  };

  const handleToggleSlotMaintenance = async (slot) => {
    const nextStatus = slot.status === 'OUT_OF_SERVICE' ? 'FREE' : 'OUT_OF_SERVICE';
    try {
      await parkingSlotApi.updateStatus(slot.id, nextStatus);
      setFeedback(`Updated slot ${slot.slotCode} → ${nextStatus}.`);
      await loadData();
    } catch (err) {
      setFeedback(err.message || 'Slot status transition not allowed from current state.');
    }
  };

  if (!bundle || !currentHub) {
    return (
      <>
        <h1 className="staff-page-title">Manage parking</h1>
        <div className="staff-panel staff-panel--full">
          <p style={{ color: 'var(--staff-muted)', margin: 0 }}>Loading parking lot telemetry...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="staff-page-title">Manage parking</h1>

      {/* Toolbar */}
      <div
        style={{
          width: '100%',
          maxWidth: 1240,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <select
          className="staff-pill-select"
          style={{ fontWeight: 600 }}
          value={currentHub.id}
          onChange={handleHubChange}
          aria-label="Select Hub"
        >
          {hubs.map((h) => (
            <option key={h.id} value={h.id}>
              Hub: {h.name}
            </option>
          ))}
        </select>

        <span style={{ color: 'var(--staff-olive)', fontSize: 17 }}>
          {totalSpaces} spaces &nbsp;·&nbsp; {totalOccupied} occupied &nbsp;·&nbsp; {totalFree} free
        </span>

        <button
          type="button"
          className="staff-pill-btn"
          onClick={() => setCheckInOpen((prev) => !prev)}
        >
          + Check in vehicle
        </button>
      </div>

      {feedback && (
        <div
          style={{
            width: '100%',
            maxWidth: 1240,
            background: '#eff9eb',
            color: 'var(--staff-forest)',
            padding: '10px 18px',
            borderRadius: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 15,
          }}
        >
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--staff-forest)', fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {checkInOpen && (
        <form
          onSubmit={handleCheckInSubmit}
          className="staff-panel staff-panel--full"
          style={{ padding: 24, flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}
        >
          <div style={{ flex: '1 1 220px' }}>
            <div style={{ fontSize: 14, color: 'var(--staff-olive)', marginBottom: 6 }}>Customer vehicle plate</div>
            <input
              className="staff-pill-input"
              style={{ width: '100%' }}
              placeholder="e.g. 59D1-482.36"
              value={checkInPlate}
              onChange={(e) => setCheckInPlate(e.target.value)}
              required
            />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontSize: 14, color: 'var(--staff-olive)', marginBottom: 6 }}>Free slot at {currentHub.name}</div>
            <select
              className="staff-pill-select"
              style={{ width: '100%' }}
              value={checkInSlotId}
              onChange={(e) => setCheckInSlotId(e.target.value)}
            >
              {freeCustomerSlots.length === 0 ? (
                <option value="">No free customer slots</option>
              ) : (
                freeCustomerSlots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.slotCode} ({s.slotType})
                  </option>
                ))
              )}
            </select>
          </div>
          <button type="submit" className="staff-pill-btn" disabled={freeCustomerSlots.length === 0}>
            Confirm check-in
          </button>
        </form>
      )}

      {/* 3 Zone Cards */}
      <div className="staff-zone-grid" style={{ maxWidth: 1240 }}>
        {/* Zone A */}
        <div className="staff-zone-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="staff-zone-badge">A</span>
            <span style={{ fontSize: 21, fontWeight: 600, color: 'var(--staff-forest)' }}>
              Rental vehicles
            </span>
          </div>
          <span style={{ color: 'var(--staff-olive)', fontSize: 15.5 }}>
            Hub-owned fleet · ready for rent
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 32, fontWeight: 600, color: 'var(--staff-forest)' }}>{occupiedA}</span>
            <span style={{ fontSize: 17, color: 'var(--staff-olive)' }}>/ {totalA} occupied</span>
          </div>
          <div className="staff-progress-track">
            <div
              className="staff-progress-fill"
              style={{ width: `${totalA ? Math.min(100, Math.round((occupiedA / totalA) * 100)) : 0}%` }}
            />
          </div>
          <span style={{ fontWeight: 600, fontSize: 15.5, color: 'var(--staff-forest)' }}>
            {currentHub.availableVehicles} ready to rent · {freeA} free spaces
          </span>
          <span style={{ fontSize: 14, color: 'var(--staff-olive)' }}>
            Spaces {slotCodeRange(rentalSlots.map((s) => s.slotCode), 'A01–A24')}
          </span>
        </div>

        {/* Zone B */}
        <div className="staff-zone-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="staff-zone-badge">B</span>
            <span style={{ fontSize: 21, fontWeight: 600, color: 'var(--staff-forest)' }}>
              Charging area
            </span>
          </div>
          <span style={{ color: 'var(--staff-olive)', fontSize: 15.5 }}>
            Vehicles connected to a charger
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 32, fontWeight: 600, color: 'var(--staff-forest)' }}>{occupiedB}</span>
            <span style={{ fontSize: 17, color: 'var(--staff-olive)' }}>/ {totalB} occupied</span>
          </div>
          <div className="staff-progress-track">
            <div
              className="staff-progress-fill"
              style={{ width: `${totalB ? Math.min(100, Math.round((occupiedB / totalB) * 100)) : 0}%` }}
            />
          </div>
          <span style={{ fontWeight: 600, fontSize: 15.5, color: 'var(--staff-forest)' }}>
            {occupiedB} charging · {freeB} available chargers
          </span>
          <span style={{ fontSize: 14, color: 'var(--staff-olive)' }}>
            Chargers {slotCodeRange(hubChargers.map((c) => c.chargerCode), 'B01–B12')}
          </span>
        </div>

        {/* Zone C */}
        <div className="staff-zone-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="staff-zone-badge">C</span>
            <span style={{ fontSize: 21, fontWeight: 600, color: 'var(--staff-forest)' }}>
              Customer parking
            </span>
          </div>
          <span style={{ color: 'var(--staff-olive)', fontSize: 15.5 }}>
            Customer vehicles · no charging
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 32, fontWeight: 600, color: 'var(--staff-forest)' }}>{occupiedC}</span>
            <span style={{ fontSize: 17, color: 'var(--staff-olive)' }}>/ {totalC} occupied</span>
          </div>
          <div className="staff-progress-track">
            <div
              className="staff-progress-fill"
              style={{ width: `${totalC ? Math.min(100, Math.round((occupiedC / totalC) * 100)) : 0}%` }}
            />
          </div>
          <span style={{ fontWeight: 600, fontSize: 15.5, color: 'var(--staff-forest)' }}>
            {occupiedC} parked · {freeC} free spaces
          </span>
          <span style={{ fontSize: 14, color: 'var(--staff-olive)' }}>
            Spaces {slotCodeRange(customerSlots.map((s) => s.slotCode), 'C01–C30')}
          </span>
        </div>
      </div>

      {/* Bottom Card: Vehicles in the parking lot */}
      <div className="staff-panel staff-panel--full" style={{ padding: '24px 28px', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: 'var(--staff-forest)' }}>
            {manageSpacesOpen ? `All parking spaces at ${currentHub.name}` : 'Vehicles in the parking lot'}
          </h2>
          <button
            type="button"
            className="staff-pill-btn staff-pill-btn--soft"
            style={{ minHeight: 40, padding: '8px 16px', fontSize: 15.5 }}
            onClick={() => setManageSpacesOpen((prev) => !prev)}
          >
            {manageSpacesOpen ? 'Back to vehicles' : 'Manage spaces'}
          </button>
        </div>

        {manageSpacesOpen ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {hubSlots.map((s) => (
              <div
                key={s.id}
                style={{
                  background: 'var(--staff-pill)',
                  borderRadius: 12,
                  padding: '14px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--staff-forest)' }}>{s.slotCode}</div>
                  <div style={{ fontSize: 13, color: 'var(--staff-olive)' }}>
                    {s.slotType} · {s.status}
                  </div>
                </div>
                <button
                  type="button"
                  className="staff-mini-link"
                  style={{ background: '#cdf4cf', fontWeight: 600 }}
                  onClick={() => handleToggleSlotMaintenance(s)}
                >
                  {s.status === 'OUT_OF_SERVICE' ? 'Restore FREE' : 'Out of service'}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { id: 'ALL', label: 'All zones' },
                  { id: 'A', label: 'A · Rental' },
                  { id: 'B', label: 'B · Charging' },
                  { id: 'C', label: 'C · Customer' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setZoneFilter(tab.id)}
                    style={{
                      background: zoneFilter === tab.id ? 'var(--staff-pill-active)' : 'var(--staff-pill)',
                      color: 'var(--staff-forest)',
                      fontWeight: zoneFilter === tab.id ? 600 : 400,
                      border: 'none',
                      borderRadius: 10,
                      padding: '9px 16px',
                      fontSize: 15.5,
                      cursor: 'pointer',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <input
                className="staff-pill-input"
                style={{ width: 240, padding: '9px 16px', fontSize: 15.5 }}
                placeholder="Search vehicle / plate"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>

            {selectedRecord && (
              <div
                style={{
                  background: '#eff9eb',
                  borderRadius: 12,
                  padding: '12px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 15,
                  color: 'var(--staff-forest)',
                }}
              >
                <span>
                  <strong>{selectedRecord.label}</strong> ({selectedRecord.space}) — {selectedRecord.detail}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedRecord(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--staff-forest)', fontWeight: 700 }}
                >
                  ✕
                </button>
              </div>
            )}

            <div style={{ overflowX: 'auto' }}>
              <div
                style={{
                  background: 'var(--staff-pill)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 1.5fr 0.8fr 0.9fr 1fr 1.3fr 0.8fr',
                  gap: 16,
                  color: 'var(--staff-olive)',
                  fontSize: 15,
                  minWidth: 780,
                }}
              >
                <span>Vehicle / plate</span>
                <span>Zone</span>
                <span>Space</span>
                <span>Check-in</span>
                <span>Duration</span>
                <span>Status</span>
                <span>Action</span>
              </div>

              {filteredRecords.length === 0 ? (
                <p style={{ color: 'var(--staff-muted)', padding: '16px 4px', margin: 0 }}>
                  No parked vehicles match your current filter.
                </p>
              ) : (
                filteredRecords.map((rec) => (
                  <div
                    key={rec.key}
                    style={{
                      padding: '14px 14px',
                      display: 'grid',
                      gridTemplateColumns: '1.2fr 1.5fr 0.8fr 0.9fr 1fr 1.3fr 0.8fr',
                      gap: 16,
                      alignItems: 'center',
                      borderBottom: '1px solid var(--staff-divider)',
                      color: 'var(--staff-forest)',
                      fontSize: 16,
                      minWidth: 780,
                    }}
                  >
                    <span>{rec.label}</span>
                    <span>{rec.zoneLabel}</span>
                    <span>{rec.space}</span>
                    <span>{rec.checkIn}</span>
                    <span>{rec.duration}</span>
                    <span>{rec.statusText}</span>
                    <span>
                      {rec.actionType === 'CHECKOUT' ? (
                        <button
                          type="button"
                          onClick={() => handleCheckoutSlot(rec.slotId, rec.space)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            color: 'var(--staff-forest)',
                            fontWeight: 600,
                            fontSize: 15.5,
                            cursor: 'pointer',
                          }}
                        >
                          Check out
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSelectedRecord(rec)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            color: 'var(--staff-forest)',
                            fontWeight: 600,
                            fontSize: 15.5,
                            cursor: 'pointer',
                          }}
                        >
                          View
                        </button>
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                color: 'var(--staff-olive)',
                fontSize: 14,
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <span>
                Showing {filteredRecords.length} of {parkingRecords.length} vehicles at {currentHub.name}
              </span>
              <span>Live parking telemetry · Updated {new Date().toTimeString().slice(0, 5)}</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}

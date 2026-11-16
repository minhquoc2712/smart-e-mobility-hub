import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { chargingApi, operatorApi } from '../../api';

const PRIORITIES = ['URGENT', 'HIGH', 'NORMAL', 'LOW'];
const PRIORITY_RANK = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

function getAutoPriorityByBattery(batteryLevel) {
  const b = Number(batteryLevel ?? 100);
  if (b < 20) return 'URGENT';
  if (b < 50) return 'HIGH';
  if (b < 80) return 'NORMAL';
  return 'LOW';
}

function getPriorityBadgeStyle(priority, isManual) {
  const base = {
    URGENT: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
    HIGH: { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
    NORMAL: { bg: '#eff9eb', color: '#2b581c', border: '#bbf7d0' },
    LOW: { bg: '#f3f4f6', color: '#4b5563', border: '#e5e7eb' },
  }[priority] || { bg: '#eff9eb', color: '#2b581c', border: '#bbf7d0' };

  return {
    background: base.bg,
    color: base.color,
    border: `1.5px solid ${isManual ? '#2b581c' : base.border}`,
  };
}

function formatWindow(start, end) {
  if (!start || !end) return '';
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '';
  const fmt = (d) =>
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${fmt(s)}–${fmt(e)}`;
}

/**
 * Staff / Vehicle & charging status (Task 3.3a & Task 4.1a — UC10 & UC15)
 * 100% Real-Time MySQL Sync:
 *   1. Confirmed Time-Slot Bookings (status = SCHEDULED / CHARGING on a specific charger)
 *      lock their booked interval [start, end) and CANNOT be preempted.
 *   2. Waitlist (status = QUEUED) & Fleet vehicles waiting for charging are ranked by:
 *      Staff Manual Priority (persisted in MySQL) -> Auto Battery SoC -> Booking Time (FIFO).
 */
export function VehicleChargingStatusPage() {
  const [bundle, setBundle] = useState(null);
  const [chargingRequests, setChargingRequests] = useState([]);
  const [hubFilter, setHubFilter] = useState('ALL');
  const [showChargers, setShowChargers] = useState(false);
  const [showQueue, setShowQueue] = useState(true);
  const [queueNotice, setQueueNotice] = useState('');
  const [savingKey, setSavingKey] = useState(null);

  const loadStatus = useCallback(async () => {
    const [data, requests] = await Promise.all([
      operatorApi.getDashboardBundle(),
      chargingApi.getChargingRequests().catch(() => []),
    ]);
    setBundle(data);
    setChargingRequests(Array.isArray(requests) ? requests : []);
  }, []);

  useEffect(() => {
    loadStatus();
    const timer = setInterval(loadStatus, 10000);
    return () => clearInterval(timer);
  }, [loadStatus]);

  const hubs = bundle?.hubUtilization?.hubs || [];
  const vehicles = bundle?.vehicleCharging?.vehicles || [];
  const chargingPoints = bundle?.vehicleCharging?.chargingPoints || [];
  const chargingVehiclesCount =
    bundle?.vehicleCharging?.vehicleStats?.CHARGING ??
    vehicles.filter((v) => v.status === 'CHARGING').length;

  // Map active MySQL charging_requests by vehicleId
  const requestByVehicleId = useMemo(() => {
    const map = new Map();
    chargingRequests.forEach((req) => {
      const vid = req.vehicleId ?? req.vehicle_id;
      const st = String(req.status || '').toUpperCase();
      if (vid != null && st !== 'CANCELLED' && st !== 'COMPLETED') {
        map.set(Number(vid), req);
      }
    });
    return map;
  }, [chargingRequests]);

  // Enrich fleet vehicles directly from MySQL state (charging_requests + charging_points)
  const enrichedVehicles = useMemo(() => {
    return vehicles
      .filter((v) => hubFilter === 'ALL' || Number(v.currentHubId) === Number(hubFilter))
      .map((v) => {
        const key = `veh-${v.id}`;
        const linkedReq = requestByVehicleId.get(Number(v.id));
        const charger = chargingPoints.find(
          (cp) => Number(cp.currentVehicleId) === Number(v.id)
        );
        const autoPriority = getAutoPriorityByBattery(v.batteryLevel);
        const dbPriority =
          linkedReq?.priority ||
          (charger?.priorityLevel && charger.priorityLevel !== autoPriority
            ? charger.priorityLevel
            : null);
        const reqCode = String(linkedReq?.requestCode || linkedReq?.request_code || '');
        const isManual =
          reqCode.startsWith('CHG-STAFF-') ||
          Boolean(dbPriority && dbPriority !== autoPriority);
        const effectivePriority = dbPriority || charger?.priorityLevel || autoPriority;

        return {
          ...v,
          overrideKey: key,
          linkedRequestId: linkedReq?.id || null,
          chargerCode: charger?.chargerCode || null,
          autoPriority,
          manualPriority: isManual ? effectivePriority : null,
          effectivePriority,
          isManual,
        };
      });
  }, [vehicles, chargingPoints, requestByVehicleId, hubFilter]);

  // Build Unified Smart Charging Queue (1. Locked Time-Slot Bookings first, 2. Priority Waitlist & Fleet Queue)
  const smartQueue = useMemo(() => {
    const items = [];
    const seenRequestIds = new Set();

    // Part 1: Fleet vehicles that are CHARGING, need charging (< 80% battery), or have an active MySQL request
    vehicles.forEach((v) => {
      if (hubFilter !== 'ALL' && Number(v.currentHubId) !== Number(hubFilter)) return;

      const key = `veh-${v.id}`;
      const linkedReq = requestByVehicleId.get(Number(v.id));
      if (linkedReq) seenRequestIds.add(Number(linkedReq.id));

      const charger = chargingPoints.find(
        (cp) => Number(cp.currentVehicleId) === Number(v.id)
      );
      const autoPriority = getAutoPriorityByBattery(v.batteryLevel);
      const dbPriority =
        linkedReq?.priority ||
        (charger?.priorityLevel && charger.priorityLevel !== autoPriority
          ? charger.priorityLevel
          : null);
      const reqCode = String(linkedReq?.requestCode || linkedReq?.request_code || '');
      const isManual =
        reqCode.startsWith('CHG-STAFF-') ||
        Boolean(dbPriority && dbPriority !== autoPriority);
      const effectivePriority = dbPriority || charger?.priorityLevel || autoPriority;

      const shouldIncludeInQueue =
        v.status === 'CHARGING' ||
        Number(v.batteryLevel) < 80 ||
        Boolean(linkedReq);

      if (!shouldIncludeInQueue) return;

      const isPluggedIn = v.status === 'CHARGING' && Boolean(charger);

      items.push({
        key,
        itemType: 'FLEET_VEHICLE',
        vehicleId: v.id,
        requestId: linkedReq?.id || null,
        code: v.code,
        subLabel: v.model || 'Shared Fleet EV',
        ownershipType: 'RENTAL',
        hubId: v.currentHubId,
        hubName: v.currentHubName || 'Campus Hub',
        currentBattery: Number(v.batteryLevel ?? 0),
        targetBattery: Number(
          linkedReq?.targetBatteryLevel ?? linkedReq?.target_battery_level ?? 95
        ),
        isSlotLocked: isPluggedIn,
        slotBadge: isPluggedIn
          ? `🔒 Active on ${charger.chargerCode}`
          : '⏳ Fleet Queue (Waiting Charger)',
        createdAtMs: linkedReq?.created_at ? new Date(linkedReq.created_at).getTime() : 0,
        autoPriority,
        manualPriority: isManual ? effectivePriority : null,
        effectivePriority,
        isManual,
      });
    });

    // Part 2: Student Private EV / Scheduled charging_requests in MySQL
    chargingRequests.forEach((req) => {
      if (seenRequestIds.has(Number(req.id))) return;
      const status = String(req.status || '').toUpperCase();
      if (status === 'CANCELLED' || status === 'COMPLETED') return;

      const reqHubId = req.hubId ?? req.hub_id;
      if (hubFilter !== 'ALL' && Number(reqHubId) !== Number(hubFilter)) return;

      const key = `req-${req.id}`;
      const curBatt = Number(req.currentBatteryLevel ?? req.current_battery_level ?? 35);
      const tgtBatt = Number(req.targetBatteryLevel ?? req.target_battery_level ?? 85);
      const autoPriority = getAutoPriorityByBattery(curBatt);
      const effectivePriority = req.priority || autoPriority;
      const isManual = effectivePriority !== autoPriority;

      const startVal = req.scheduledStart ?? req.scheduled_start;
      const endVal = req.scheduledEnd ?? req.scheduled_end;
      const windowLabel = formatWindow(startVal, endVal);
      const chargerCode = req.chargerCode || req.charger_code || null;
      const hasLockedSlot = status === 'SCHEDULED' || status === 'CHARGING';

      items.push({
        key,
        itemType: 'CHARGING_REQUEST',
        vehicleId: req.vehicleId ?? req.vehicle_id ?? null,
        requestId: req.id,
        code:
          req.privateVehicleLabel ||
          req.private_vehicle_label ||
          req.vehicleCode ||
          req.requestCode ||
          req.request_code ||
          `CHG-${req.id}`,
        subLabel: `${req.requestCode || req.request_code || `CHG-${req.id}`} · Student Booking`,
        ownershipType: req.ownershipType || req.ownership_type || 'PRIVATE',
        hubId: reqHubId,
        hubName: req.hubName || req.hub_name || 'Campus Hub',
        currentBattery: curBatt,
        targetBattery: tgtBatt,
        isSlotLocked: hasLockedSlot,
        slotBadge: hasLockedSlot
          ? `🔒 Locked ${chargerCode || 'Charger'}${windowLabel ? ` (${windowLabel})` : ''}`
          : `⏳ Waitlist Queue${windowLabel ? ` (${windowLabel})` : ''}`,
        createdAtMs: req.created_at ? new Date(req.created_at).getTime() : Date.now(),
        autoPriority,
        manualPriority: isManual ? effectivePriority : null,
        effectivePriority,
        isManual,
      });
    });

    // Sort Rule:
    //   Tier 1: Locked / Active Charger Slots first (protected from preemption!)
    //   Tier 2: Waitlist & Unassigned Fleet Queue ranked by Effective Priority -> Lowest Battery % -> Earlier Booking Time (FIFO)
    items.sort((a, b) => {
      if (a.isSlotLocked !== b.isSlotLocked) {
        return a.isSlotLocked ? -1 : 1;
      }
      const rankDiff =
        (PRIORITY_RANK[a.effectivePriority] ?? 2) -
        (PRIORITY_RANK[b.effectivePriority] ?? 2);
      if (rankDiff !== 0) return rankDiff;
      if (a.currentBattery !== b.currentBattery) {
        return a.currentBattery - b.currentBattery;
      }
      return a.createdAtMs - b.createdAtMs;
    });

    return items.map((item, idx) => ({
      ...item,
      queuePosition: idx + 1,
    }));
  }, [vehicles, chargingPoints, chargingRequests, requestByVehicleId, hubFilter]);

  const handleSetPriority = async ({ key, label, vehicleId, requestId, autoPriority, nextValue }) => {
    setQueueNotice('');
    setSavingKey(key);
    const isResetToAuto = nextValue === 'AUTO';

    try {
      if (vehicleId) {
        await operatorApi.updateVehicleChargingPriority(vehicleId, nextValue);
      } else if (requestId) {
        const targetPrio = isResetToAuto ? autoPriority || 'NORMAL' : nextValue;
        await chargingApi.updatePriority(requestId, targetPrio);
      }
      await loadStatus();
      setQueueNotice(
        isResetToAuto
          ? `Synced to MySQL: reverted ${label} back to Auto priority (${autoPriority}).`
          : `Synced to MySQL: set ${label} priority → ${nextValue}. Queue updated!`
      );
    } catch (err) {
      setQueueNotice(err.message || 'Failed to update priority in MySQL.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleResetAllToAuto = async () => {
    try {
      await operatorApi.resetAllChargingPriorities();
      await loadStatus();
      setQueueNotice('All fleet charging priorities reset to Automatic in MySQL.');
    } catch (err) {
      setQueueNotice(err.message || 'Could not reset priorities.');
    }
  };

  const manualOverrideCount = enrichedVehicles.filter((v) => v.isManual).length;

  return (
    <>
      <div style={{ textAlign: 'center' }}>
        <h1 className="staff-page-title">Vehicle &amp; charging status</h1>
        <p style={{ margin: '6px 0 0', color: 'var(--staff-olive)', fontSize: 15.5 }}>
          Confirmed time-slot bookings lock their charger first · Waitlist &amp; fleet queue rank by
          Priority &amp; Battery % (100% synced with MySQL)
        </p>
      </div>

      <div className="staff-panel staff-panel--full" style={{ maxWidth: 1140 }}>
        {/* Filter bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--staff-forest)' }}>
              Filter by hub:
            </span>
            <select
              className="staff-pill-select"
              style={{ padding: '8px 14px', fontSize: 15 }}
              value={hubFilter}
              onChange={(e) => setHubFilter(e.target.value)}
            >
              <option value="ALL">All campus hubs ({vehicles.length} vehicles)</option>
              {hubs.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ fontSize: 13.5, color: 'var(--staff-olive)' }}>
            Auto rule: <strong>&lt;20%</strong> Urgent · <strong>20–49%</strong> High ·{' '}
            <strong>50–79%</strong> Normal · <strong>&ge;80%</strong> Low
          </div>
        </div>

        {/* Fleet Table */}
        <div>
          <div
            className="staff-list-head"
            style={{
              display: 'grid',
              gridTemplateColumns: '0.9fr 1.4fr 1.1fr 0.9fr 1.4fr',
              gap: 14,
            }}
          >
            <span>Vehicle</span>
            <span>Hub</span>
            <span>Battery</span>
            <span>Status</span>
            <span>Set priority (MySQL)</span>
          </div>

          {!bundle ? (
            <p style={{ color: 'var(--staff-muted)', padding: '16px 0' }}>
              Loading fleet telemetry from MySQL...
            </p>
          ) : (
            enrichedVehicles.map((v) => {
              const statusLabel =
                v.status === 'AVAILABLE'
                  ? 'Available'
                  : v.status === 'CHARGING'
                  ? 'Charging'
                  : v.status === 'IN_USE'
                  ? 'In use'
                  : v.status === 'RESERVED'
                  ? 'Reserved'
                  : 'Out of service';

              const badgeStyle = getPriorityBadgeStyle(v.effectivePriority, v.isManual);

              return (
                <div
                  key={v.id}
                  className="staff-list-row"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '0.9fr 1.4fr 1.1fr 0.9fr 1.4fr',
                    gap: 14,
                    fontSize: 16.5,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>
                    {v.code}
                    {v.chargerCode && (
                      <div style={{ fontSize: 12, color: 'var(--staff-olive)', fontWeight: 500 }}>
                        ⚡ {v.chargerCode}
                      </div>
                    )}
                  </span>

                  <span>{v.currentHubName || 'In transit'}</span>

                  <span>
                    <div style={{ fontWeight: 600 }}>{v.batteryLevel}%</div>
                    <div
                      style={{
                        width: 96,
                        height: 6,
                        background: '#e5efe3',
                        borderRadius: 999,
                        overflow: 'hidden',
                        marginTop: 4,
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(0, v.batteryLevel))}%`,
                          height: '100%',
                          background:
                            v.batteryLevel < 20
                              ? '#ef4444'
                              : v.batteryLevel < 50
                              ? '#f59e0b'
                              : '#22c55e',
                        }}
                      />
                    </div>
                  </span>

                  <span
                    style={{
                      color:
                        v.status === 'OUT_OF_SERVICE'
                          ? '#b91c1c'
                          : v.status === 'CHARGING'
                          ? '#2b581c'
                          : 'var(--staff-ink)',
                      fontWeight: v.status === 'CHARGING' ? 600 : 400,
                    }}
                  >
                    {statusLabel}
                  </span>

                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <select
                      className="staff-pill-select"
                      disabled={savingKey === v.overrideKey}
                      aria-label={`Charging priority for ${v.code}`}
                      style={{
                        padding: '5px 10px',
                        fontSize: 13.5,
                        fontWeight: 600,
                        borderRadius: 8,
                        ...badgeStyle,
                      }}
                      value={v.manualPriority || 'AUTO'}
                      onChange={(e) =>
                        handleSetPriority({
                          key: v.overrideKey,
                          label: v.code,
                          vehicleId: v.id,
                          requestId: v.linkedRequestId,
                          autoPriority: v.autoPriority,
                          nextValue: e.target.value,
                        })
                      }
                    >
                      <option value="AUTO">
                        Auto ({v.autoPriority} · {v.batteryLevel}%)
                      </option>
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          Manual: {p}
                        </option>
                      ))}
                    </select>

                    {v.isManual && (
                      <button
                        type="button"
                        onClick={() =>
                          handleSetPriority({
                            key: v.overrideKey,
                            label: v.code,
                            vehicleId: v.id,
                            requestId: v.linkedRequestId,
                            autoPriority: v.autoPriority,
                            nextValue: 'AUTO',
                          })
                        }
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--staff-olive)',
                          fontSize: 12.5,
                          textDecoration: 'underline',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        Reset auto
                      </button>
                    )}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Figma bottom mint summary bar (clickable to expand individual chargers) */}
        <div
          onClick={() => setShowChargers((prev) => !prev)}
          title="Click to toggle charging point details"
          style={{
            background: 'var(--staff-pill)',
            borderRadius: 14,
            padding: '16px 22px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 18.5,
            color: 'var(--staff-ink)',
            cursor: 'pointer',
          }}
        >
          <span>{chargingVehiclesCount} vehicles actively charging</span>
          <span style={{ fontSize: 14.5, color: 'var(--staff-olive)' }}>
            {showChargers ? 'Hide chargers ▲' : `View ${chargingPoints.length} chargers ▼`}
          </span>
        </div>

        {showChargers && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            {chargingPoints.map((cp) => (
              <div
                key={cp.id}
                style={{
                  background: cp.status === 'OUT_OF_SERVICE' ? '#fee2e2' : 'var(--staff-pill)',
                  borderRadius: 12,
                  padding: '12px 16px',
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--staff-forest)' }}>
                  {cp.chargerCode} · {cp.maxPowerKw} kW
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--staff-olive)', marginTop: 2 }}>
                  {cp.hubName}
                </div>
                <div style={{ fontSize: 13.5, marginTop: 4, fontWeight: 600 }}>
                  {cp.status}
                  {cp.currentVehicleCode ? ` (${cp.currentVehicleCode})` : ''} · Priority:{' '}
                  {cp.priorityLevel}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Smart Charging Queue (Locked Time-Slots + Priority Waitlist) */}
        <div
          style={{
            background: 'var(--staff-pill)',
            borderRadius: 16,
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            border: '1px solid #d5ecd4',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div
              onClick={() => setShowQueue((prev) => !prev)}
              style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2 }}
            >
              <div style={{ fontSize: 18.5, fontWeight: 600, color: 'var(--staff-forest)' }}>
                Smart charging schedule &amp; waitlist ({smartQueue.length})
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--staff-olive)' }}>
                🔒 Confirmed time-slots are locked first · ⏳ Waitlist &amp; unassigned fleet rank by
                Staff Priority &rarr; Battery % &rarr; Booking Time
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {manualOverrideCount > 0 && (
                <button
                  type="button"
                  className="staff-pill-btn staff-pill-btn--soft"
                  style={{ minHeight: 34, padding: '5px 12px', fontSize: 13.5 }}
                  onClick={handleResetAllToAuto}
                >
                  Reset all to Auto ({manualOverrideCount})
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowQueue((prev) => !prev)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--staff-olive)',
                  fontSize: 14,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {showQueue ? 'Collapse ▲' : 'Expand ▼'}
              </button>
            </div>
          </div>

          {queueNotice && (
            <div
              style={{
                background: '#ffffff',
                color: 'var(--staff-forest)',
                border: '1px solid #34c759',
                padding: '9px 14px',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              ✓ {queueNotice}
            </div>
          )}

          {showQueue && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {smartQueue.length === 0 ? (
                <p style={{ color: 'var(--staff-muted)', margin: 0 }}>
                  All vehicles are above 80% battery. Set a vehicle&apos;s priority manually above
                  to queue it.
                </p>
              ) : (
                smartQueue.map((item) => {
                  const badgeStyle = getPriorityBadgeStyle(item.effectivePriority, item.isManual);
                  return (
                    <div
                      key={item.key}
                      style={{
                        background: '#ffffff',
                        border: item.isManual
                          ? '1.5px solid #34c759'
                          : '1px solid var(--staff-divider)',
                        borderRadius: 12,
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span
                          className="staff-zone-badge"
                          style={{
                            width: 34,
                            height: 34,
                            fontSize: 14,
                            borderRadius: 9,
                            background:
                              item.effectivePriority === 'URGENT'
                                ? '#fee2e2'
                                : item.effectivePriority === 'HIGH'
                                ? '#fff7db'
                                : 'var(--staff-pill-active)',
                            color:
                              item.effectivePriority === 'URGENT'
                                ? '#991b1b'
                                : item.effectivePriority === 'HIGH'
                                ? '#854d0e'
                                : 'var(--staff-forest)',
                          }}
                        >
                          #{item.queuePosition}
                        </span>

                        <div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              flexWrap: 'wrap',
                            }}
                          >
                            <span
                              style={{
                                fontWeight: 700,
                                fontSize: 15.5,
                                color: 'var(--staff-forest)',
                              }}
                            >
                              {item.code}
                            </span>
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                padding: '2px 8px',
                                borderRadius: 6,
                                background: item.isSlotLocked ? '#e0f2fe' : '#fef3c7',
                                color: item.isSlotLocked ? '#075985' : '#92400e',
                              }}
                            >
                              {item.slotBadge}
                            </span>
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                padding: '2px 8px',
                                borderRadius: 6,
                                background: item.isManual ? '#cdf4cf' : '#f3f5ef',
                                color: item.isManual ? '#182b20' : 'var(--staff-olive)',
                              }}
                            >
                              {item.isManual
                                ? `MANUAL (${item.effectivePriority})`
                                : `AUTO (${item.effectivePriority} · ${item.currentBattery}%)`}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--staff-muted)', marginTop: 2 }}>
                            {item.hubName} · {item.subLabel} · Battery{' '}
                            <strong>{item.currentBattery}%</strong> &rarr; {item.targetBattery}%
                          </div>
                        </div>
                      </div>

                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                      >
                        <span style={{ fontSize: 13.5, color: 'var(--staff-olive)' }}>
                          Priority:
                        </span>
                        <select
                          className="staff-pill-select"
                          disabled={savingKey === item.key}
                          style={{
                            padding: '6px 12px',
                            fontSize: 13.5,
                            fontWeight: 600,
                            borderRadius: 8,
                            ...badgeStyle,
                          }}
                          value={item.manualPriority || 'AUTO'}
                          onChange={(e) =>
                            handleSetPriority({
                              key: item.key,
                              label: item.code,
                              vehicleId: item.vehicleId,
                              requestId: item.requestId,
                              autoPriority: item.autoPriority,
                              nextValue: e.target.value,
                            })
                          }
                        >
                          <option value="AUTO">Auto ({item.autoPriority})</option>
                          {PRIORITIES.map((p) => (
                            <option key={p} value={p}>
                              Manual: {p}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

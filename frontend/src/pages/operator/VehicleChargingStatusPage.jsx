import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { chargingApi, operatorApi } from '../../api';
import { QuickGuideStrip } from '../../components/common/QuickGuideStrip';

const CHARGING_CONSOLE_GUIDE = [
  {
    title: 'Inspect Fleet Battery & Priority',
    desc: 'Filter by hub or override charging priority (Urgent, High, Normal, Low) on any EV.',
  },
  {
    title: 'Active Chargers (Left Column)',
    desc: 'Monitor plugged-in EVs and click Unplug when charged to release the port.',
  },
  {
    title: 'Waitlist Queue (Right Column)',
    desc: 'Plug waiting EVs into free chargers or Swap directly with an active vehicle.',
  },
];

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
 * Layout:
 *   1. Fleet Table (All fleet vehicles, statuses, battery levels, priority settings)
 *   2. Chargers Summary Bar (Toggles individual charging points)
 *   3. Smart Charging Schedule & Waitlist: Split into 2 Tables:
 *      - Active on Chargers (Currently plugged in / locked)
 *      - Waitlist & Fleet Queue (Waiting for charger, with operator Plug-In / Swap actions)
 */
export function VehicleChargingStatusPage() {
  const [bundle, setBundle] = useState(null);
  const [chargingRequests, setChargingRequests] = useState([]);
  const [hubFilter, setHubFilter] = useState('ALL');
  const [showChargers, setShowChargers] = useState(false);
  const [showQueue, setShowQueue] = useState(true);
  const [queueNotice, setQueueNotice] = useState('');
  const [savingKey, setSavingKey] = useState(null);
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverZone, setDragOverZone] = useState(null); // 'ACTIVE_ZONE' | 'QUEUE_ZONE' | itemId

  const loadStatus = useCallback(async () => {
    try {
      const [data, requests] = await Promise.all([
        operatorApi.getDashboardBundle(),
        chargingApi.getChargingRequests().catch(() => []),
      ]);
      setBundle(data);
      setChargingRequests(Array.isArray(requests) ? requests : []);
    } catch {
      // Keep existing bundle on transient error
    }
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

  // Group chargers by hubId
  const chargersByHubId = useMemo(() => {
    const map = new Map();
    chargingPoints.forEach((cp) => {
      const hid = Number(cp.hubId || cp.hub_id);
      if (!map.has(hid)) map.set(hid, []);
      map.get(hid).push(cp);
    });
    return map;
  }, [chargingPoints]);

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
          chargerId: charger?.id || null,
          autoPriority,
          manualPriority: isManual ? effectivePriority : null,
          effectivePriority,
          isManual,
        };
      });
  }, [vehicles, chargingPoints, requestByVehicleId, hubFilter]);

  // Build Unified Smart Charging Queue (Split into Active on Chargers & Waitlist Queue)
  const { activeChargingList, waitlistQueue, totalQueueCount } = useMemo(() => {
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
        chargerId: charger?.id || null,
        chargerCode: charger?.chargerCode || null,
        requestId: linkedReq?.id || null,
        code: v.code,
        subLabel: v.model || 'Shared Fleet EV',
        ownershipType: 'RENTAL',
        hubId: v.currentHubId,
        hubName: v.currentHubName || 'Campus Hub',
        currentBattery: Number(v.batteryLevel ?? 0),
        targetBattery: Number(
          linkedReq?.targetBatteryLevel ?? linkedReq?.target_battery_level ?? 100
        ),
        isSlotLocked: isPluggedIn,
        slotBadge: isPluggedIn
          ? `Active on ${charger.chargerCode}`
          : 'Fleet Queue (Waiting Charger)',
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
      const tgtBatt = Number(req.targetBatteryLevel ?? req.target_battery_level ?? 100);
      const autoPriority = getAutoPriorityByBattery(curBatt);
      const effectivePriority = req.priority || autoPriority;
      const isManual = effectivePriority !== autoPriority;

      const startVal = req.scheduledStart ?? req.scheduled_start;
      const endVal = req.scheduledEnd ?? req.scheduled_end;
      const windowLabel = formatWindow(startVal, endVal);
      const chargerCode = req.chargerCode || req.charger_code || null;
      const chargerId = req.chargingPointId || req.charging_point_id || null;
      const hasLockedSlot = status === 'SCHEDULED' || status === 'CHARGING';

      items.push({
        key,
        itemType: 'CHARGING_REQUEST',
        vehicleId: req.vehicleId ?? req.vehicle_id ?? null,
        chargerId,
        chargerCode,
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
          ? `Locked ${chargerCode || 'Charger'}${windowLabel ? ` (${windowLabel})` : ''}`
          : `Waitlist Queue${windowLabel ? ` (${windowLabel})` : ''}`,
        createdAtMs: req.created_at ? new Date(req.created_at).getTime() : Date.now(),
        autoPriority,
        manualPriority: isManual ? effectivePriority : null,
        effectivePriority,
        isManual,
      });
    });

    // Split into 2 distinct tables:
    // 1. Active / Locked slots (sorted: highest battery first so near-full vehicles are easy to spot and unplug)
    const activeList = items
      .filter((i) => i.isSlotLocked)
      .sort((a, b) => b.currentBattery - a.currentBattery);

    // 2. Waitlist & Unassigned Fleet Queue (ranked by Priority -> Lowest Battery % -> Booking Time FIFO)
    const queueList = items
      .filter((i) => !i.isSlotLocked)
      .sort((a, b) => {
        const rankDiff =
          (PRIORITY_RANK[a.effectivePriority] ?? 2) -
          (PRIORITY_RANK[b.effectivePriority] ?? 2);
        if (rankDiff !== 0) return rankDiff;
        if (a.currentBattery !== b.currentBattery) {
          return a.currentBattery - b.currentBattery;
        }
        return a.createdAtMs - b.createdAtMs;
      })
      .map((item, idx) => ({
        ...item,
        queuePosition: idx + 1,
      }));

    return {
      activeChargingList: activeList,
      waitlistQueue: queueList,
      totalQueueCount: items.length,
    };
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
          ? `Reverted ${label} back to Auto priority (${autoPriority}).`
          : `Updated ${label} priority → ${nextValue}. Queue re-ranked!`
      );
    } catch (err) {
      setQueueNotice(`Error: ${err.message || 'Failed to update priority.'}`);
    } finally {
      setSavingKey(null);
    }
  };

  const handleResetAllToAuto = async () => {
    try {
      await operatorApi.resetAllChargingPriorities();
      await loadStatus();
      setQueueNotice('All fleet charging priorities reset to Automatic.');
    } catch (err) {
      setQueueNotice(`Error: ${err.message || 'Could not reset priorities.'}`);
    }
  };

  // Operator Action 1: Unplug / release active vehicle
  const handleUnplug = async (item) => {
    try {
      setSavingKey(item.key);
      setQueueNotice('');
      await operatorApi.unplugVehicle({
        vehicleId: item.vehicleId,
        chargerId: item.chargerId,
        requestId: item.requestId,
      });
      await loadStatus();
      setQueueNotice(
        `✓ Unplugged vehicle ${item.code}${item.chargerCode ? ` from charger ${item.chargerCode}` : ''}. Charger is now available!`
      );
    } catch (err) {
      setQueueNotice(`Error unplugging: ${err.message || 'Failed to unplug vehicle.'}`);
    } finally {
      setSavingKey(null);
    }
  };

  // Operator Action 2: Plug in waiting vehicle into an available charger
  const handlePlugIn = async (queueItem, targetChargerId = null) => {
    try {
      setSavingKey(queueItem.key);
      setQueueNotice('');

      const hubChargers = chargersByHubId.get(Number(queueItem.hubId)) || [];
      const freeChargers = hubChargers.filter((cp) => cp.status === 'AVAILABLE');

      if (!targetChargerId && freeChargers.length === 0) {
        throw new Error(`Hub "${queueItem.hubName}" has no available chargers. Please unplug a charged vehicle or swap.`);
      }

      const assignedChargerId = targetChargerId || freeChargers[0]?.id;

      await operatorApi.plugInVehicle({
        vehicleId: queueItem.vehicleId,
        chargerId: assignedChargerId,
      });
      await loadStatus();
      setQueueNotice(`✓ Successfully plugged in ${queueItem.code} into charger at ${queueItem.hubName}!`);
    } catch (err) {
      setQueueNotice(`Error plugging in: ${err.message || 'Failed to plug in vehicle.'}`);
    } finally {
      setSavingKey(null);
    }
  };

  // Operator Action 3: Swap active vehicle with queue vehicle at the same hub
  const handleSwap = async (activeItem, queueItem) => {
    try {
      setSavingKey(queueItem.key);
      setQueueNotice('');

      if (Number(activeItem.hubId) !== Number(queueItem.hubId)) {
        throw new Error(
          `Cannot swap: Vehicle ${activeItem.code} is at "${activeItem.hubName}" while ${queueItem.code} is at "${queueItem.hubName}". Both vehicles must be at the same hub.`
        );
      }

      await operatorApi.swapVehicles({
        activeVehicleId: activeItem.vehicleId,
        queueVehicleId: queueItem.vehicleId,
      });
      await loadStatus();
      setQueueNotice(
        `✓ Swapped successfully: ${activeItem.code} unplugged, ${queueItem.code} plugged into ${activeItem.chargerCode || 'charger'}!`
      );
    } catch (err) {
      setQueueNotice(`Swap error: ${err.message || 'Failed to swap vehicles.'}`);
    } finally {
      setSavingKey(null);
    }
  };

  // Drag and Drop handlers
  const handleDragStart = (e, item, sourceZone) => {
    setDraggedItem({ ...item, sourceZone });
    e.dataTransfer.setData('text/plain', JSON.stringify({ ...item, sourceZone }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, zoneId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverZone !== zoneId) setDragOverZone(zoneId);
  };

  const handleDragLeave = (e, zoneId) => {
    if (dragOverZone === zoneId) setDragOverZone(null);
  };

  const handleDropOnActiveZone = async (e, targetActiveItem = null) => {
    e.preventDefault();
    setDragOverZone(null);
    if (!draggedItem) return;

    if (draggedItem.sourceZone === 'QUEUE') {
      if (targetActiveItem) {
        await handleSwap(targetActiveItem, draggedItem);
      } else {
        await handlePlugIn(draggedItem);
      }
    }
    setDraggedItem(null);
  };

  const handleDropOnQueueZone = async (e) => {
    e.preventDefault();
    setDragOverZone(null);
    if (!draggedItem) return;

    if (draggedItem.sourceZone === 'ACTIVE') {
      await handleUnplug(draggedItem);
    }
    setDraggedItem(null);
  };

  const manualOverrideCount = enrichedVehicles.filter((v) => v.isManual).length;

  return (
    <>
      <div style={{ textAlign: 'center' }}>
        <h1 className="staff-page-title">Vehicle &amp; charging status</h1>
        <p style={{ margin: '6px 0 0', color: 'var(--staff-olive)', fontSize: 15.5 }}>
          Confirmed time-slot bookings lock their charger first · Waitlist &amp; fleet queue rank by
          Priority &amp; Battery %
        </p>
      </div>

      <div style={{ width: '100%', maxWidth: 1140 }}>
        <QuickGuideStrip steps={CHARGING_CONSOLE_GUIDE} variant="operator" />
      </div>

      <div className="staff-panel staff-panel--full" style={{ maxWidth: 1140, overflow: 'hidden' }}>
        {/* =========================================================================
            SECTION 1: FILTER BAR & FLEET TABLE (KEPT AS ORIGINAL)
           ========================================================================= */}
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

        {/* Fleet Table (horizontally scrollable on narrow mobile screens so Battery % & Priority never misalign) */}
        <div className="fleet-table-scroll">
          <div
            className="staff-list-head"
            style={{
              display: 'grid',
              gridTemplateColumns: '92px minmax(145px, 1.3fr) 128px 102px minmax(168px, 1.3fr)',
              gap: 14,
              minWidth: 650,
              alignItems: 'center',
            }}
          >
            <span>Vehicle</span>
            <span>Hub</span>
            <span>Battery</span>
            <span>Status</span>
            <span>Set priority</span>
          </div>

          {!bundle ? (
            <p style={{ color: 'var(--staff-muted)', padding: '16px 0' }}>
              Loading fleet telemetry...
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
                    gridTemplateColumns: '92px minmax(145px, 1.3fr) 128px 102px minmax(168px, 1.3fr)',
                    gap: 14,
                    minWidth: 650,
                    alignItems: 'center',
                    fontSize: 16,
                  }}
                >
                  <span style={{ fontWeight: 700 }}>
                    {v.code}
                    {v.chargerCode && (
                      <div style={{ fontSize: 12, color: 'var(--staff-olive)', fontWeight: 500 }}>
                        Port {v.chargerCode}
                      </div>
                    )}
                  </span>

                  <span style={{ lineHeight: 1.3 }}>{v.currentHubName || 'In transit'}</span>

                  <span style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ fontWeight: 700, lineHeight: 1.2 }}>{v.batteryLevel}%</div>
                    <div
                      style={{
                        width: 96,
                        height: 7,
                        background: 'var(--staff-divider)',
                        borderRadius: 999,
                        overflow: 'hidden',
                        marginTop: 5,
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
                          ? '#dc2626'
                          : v.status === 'CHARGING'
                          ? 'var(--staff-forest)'
                          : 'var(--staff-ink)',
                      fontWeight: v.status === 'CHARGING' ? 700 : 500,
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
                      className="staff-pill-select priority-pill-select"
                      disabled={savingKey === v.overrideKey}
                      aria-label={`Charging priority for ${v.code}`}
                      style={{
                        padding: '6px 10px',
                        fontSize: 13,
                        fontWeight: 700,
                        borderRadius: 8,
                        maxWidth: '100%',
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

        {/* =========================================================================
            SECTION 2: MINT SUMMARY BAR & CHARGING POINTS (KEPT AS ORIGINAL)
           ========================================================================= */}
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
            {chargingPoints
              .filter((cp) => hubFilter === 'ALL' || Number(cp.hubId || cp.hub_id) === Number(hubFilter))
              .map((cp) => (
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

        {/* =========================================================================
            SECTION 3: SMART CHARGING SCHEDULE & WAITLIST
            Split into 2 DISTINCT TABLES (Active Charging vs Queue / Waitlist)
           ========================================================================= */}
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
          {/* Header */}
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
                Smart charging schedule &amp; waitlist ({totalQueueCount})
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--staff-olive)' }}>
                Active on chargers · Waitlist &amp; fleet queue rank by Staff Priority &rarr; Battery % &rarr; Booking Time
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

          {/* Feedback Notice Alert */}
          {queueNotice && (
            <div
              style={{
                background:
                  queueNotice.startsWith('Error') || queueNotice.startsWith('Cannot')
                    ? '#fef2f2'
                    : 'var(--staff-card)',
                color:
                  queueNotice.startsWith('Error') || queueNotice.startsWith('Cannot')
                    ? '#b91c1c'
                    : 'var(--staff-forest)',
                border: `1px solid ${
                  queueNotice.startsWith('Error') || queueNotice.startsWith('Cannot')
                    ? '#fca5a5'
                    : '#34c759'
                }`,
                padding: '9px 14px',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 500,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>{queueNotice}</span>
              <button
                type="button"
                onClick={() => setQueueNotice('')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  fontSize: 15,
                  fontWeight: 700,
                }}
              >
                ✕
              </button>
            </div>
          )}

          {showQueue && (
            <div className="parallel-board-scroll">
              <div className="parallel-two-col-board">
              {/* -----------------------------------------------------------------
                  TABLE A: ACTIVE CHARGING (CURRENTLY ON CHARGERS)
                 ----------------------------------------------------------------- */}
              <div
                onDragOver={(e) => handleDragOver(e, 'ACTIVE_ZONE')}
                onDragLeave={(e) => handleDragLeave(e, 'ACTIVE_ZONE')}
                onDrop={(e) => handleDropOnActiveZone(e)}
                style={{
                  background: 'var(--staff-card)',
                  borderRadius: 14,
                  padding: '16px',
                  border:
                    dragOverZone === 'ACTIVE_ZONE'
                      ? '2px dashed #16a34a'
                      : '1px solid var(--staff-divider)',
                  boxShadow: dragOverZone === 'ACTIVE_ZONE' ? '0 0 12px rgba(34, 197, 94, 0.25)' : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 16.5, fontWeight: 700, color: 'var(--staff-forest)' }}>
                      Active on Chargers ({activeChargingList.length})
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--staff-olive)', marginTop: 2 }}>
                      Currently charging. Unplug when near full to free the charger.
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: 6,
                      background: '#e0f2fe',
                      color: '#0284c7',
                    }}
                  >
                    ACTIVE
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {activeChargingList.length === 0 ? (
                    <div
                      style={{
                        padding: '24px 16px',
                        textAlign: 'center',
                        color: 'var(--staff-muted)',
                        fontSize: 13.5,
                        border: '1px dashed var(--staff-divider)',
                        borderRadius: 10,
                      }}
                    >
                      No vehicles actively charging at this hub.
                      <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--staff-forest)', fontWeight: 600 }}>
                        Drag a waiting vehicle from the queue to start charging!
                      </div>
                    </div>
                  ) : (
                    activeChargingList.map((item, idx) => {
                      const badgeStyle = getPriorityBadgeStyle(item.effectivePriority, item.isManual);
                      const isNearlyFull = item.currentBattery >= 80;
                      const isDone = item.currentBattery >= item.targetBattery;
                      const isBeingSaved = savingKey === item.key;

                      return (
                        <div
                          key={item.key}
                          draggable={Boolean(item.vehicleId)}
                          onDragStart={(e) => handleDragStart(e, item, 'ACTIVE')}
                          onDragOver={(e) => {
                            e.stopPropagation();
                            handleDragOver(e, item.key);
                          }}
                          onDragLeave={(e) => {
                            e.stopPropagation();
                            handleDragLeave(e, item.key);
                          }}
                          onDrop={(e) => {
                            e.stopPropagation();
                            handleDropOnActiveZone(e, item);
                          }}
                          style={{
                            background: 'var(--staff-subcard, var(--staff-card))',
                            borderRadius: 12,
                            padding: '12px 14px',
                            border:
                              dragOverZone === item.key
                                ? '2px dashed #2563eb'
                                : item.isManual
                                ? '1.5px solid #34c759'
                                : '1px solid var(--staff-divider)',
                            cursor: item.vehicleId ? 'grab' : 'default',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                            transition: 'all 0.15s ease',
                          }}
                          title="Drag to Queue to unplug, or drop a waiting vehicle here to swap"
                        >
                          {/* Top: Code, Slot Badge, Battery status */}
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: 6,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span
                                style={{
                                  width: 24,
                                  height: 24,
                                  borderRadius: 6,
                                  background: '#e0f2fe',
                                  color: '#0369a1',
                                  fontWeight: 700,
                                  fontSize: 12.5,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                #{idx + 1}
                              </span>
                              <span style={{ fontWeight: 700, fontSize: 15.5, color: 'var(--staff-forest)' }}>
                                {item.code}
                              </span>
                              <span
                                style={{
                                  fontSize: 11.5,
                                  fontWeight: 600,
                                  padding: '2px 7px',
                                  borderRadius: 6,
                                  background: '#e0f2fe',
                                  color: '#075985',
                                }}
                              >
                                {item.slotBadge}
                              </span>
                            </div>

                            {isDone ? (
                              <span
                                style={{
                                  fontSize: 11.5,
                                  fontWeight: 700,
                                  padding: '2px 7px',
                                  borderRadius: 6,
                                  background: '#dcfce7',
                                  color: '#15803d',
                                }}
                              >
                                Charged ({item.currentBattery}%)
                              </span>
                            ) : isNearlyFull ? (
                              <span
                                style={{
                                  fontSize: 11.5,
                                  fontWeight: 700,
                                  padding: '2px 7px',
                                  borderRadius: 6,
                                  background: '#fef3c7',
                                  color: '#b45309',
                                }}
                              >
                                Near Full ({item.currentBattery}%)
                              </span>
                            ) : null}
                          </div>

                          {/* Middle: Hub, Model, Battery Bar */}
                          <div>
                            <div style={{ fontSize: 12.5, color: 'var(--staff-muted)', marginBottom: 4 }}>
                              {item.hubName} · {item.subLabel} · Battery{' '}
                              <strong>{item.currentBattery}%</strong> &rarr; {item.targetBattery}%
                            </div>
                            <div
                              style={{
                                width: '100%',
                                height: 6,
                                background: '#e5efe3',
                                borderRadius: 999,
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: `${Math.min(100, Math.max(0, item.currentBattery))}%`,
                                  height: '100%',
                                  background:
                                    item.currentBattery < 20
                                      ? '#ef4444'
                                      : item.currentBattery < 50
                                      ? '#f59e0b'
                                      : '#22c55e',
                                  transition: 'width 0.4s ease',
                                }}
                              />
                            </div>
                          </div>

                          {/* Bottom: Priority & Operator Unplug Button */}
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: 6,
                              paddingTop: 4,
                              borderTop: '1px solid #f1f5ee',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 12, color: 'var(--staff-olive)' }}>Priority:</span>
                              <select
                                className="staff-pill-select priority-pill-select"
                                disabled={isBeingSaved}
                                style={{
                                  padding: '3px 8px',
                                  fontSize: 12,
                                  fontWeight: 600,
                                  borderRadius: 6,
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

                            <button
                              type="button"
                              disabled={isBeingSaved}
                              onClick={() => handleUnplug(item)}
                              className="staff-pill-btn"
                              style={{
                                padding: '4px 10px',
                                fontSize: 12.5,
                                fontWeight: 600,
                                minHeight: 28,
                                background: isNearlyFull ? '#16a34a' : '#f87171',
                                color: '#ffffff',
                                border: 'none',
                                cursor: 'pointer',
                                borderRadius: 7,
                              }}
                              title="Unplug this vehicle to set Available and release the charger"
                            >
                              {isBeingSaved ? 'Unplugging...' : 'Unplug (Release)'}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* -----------------------------------------------------------------
                  TABLE B: WAITLIST & FLEET QUEUE (WAITING FOR CHARGER)
                 ----------------------------------------------------------------- */}
              <div
                onDragOver={(e) => handleDragOver(e, 'QUEUE_ZONE')}
                onDragLeave={(e) => handleDragLeave(e, 'QUEUE_ZONE')}
                onDrop={(e) => handleDropOnQueueZone(e)}
                style={{
                  background: 'var(--staff-card)',
                  borderRadius: 14,
                  padding: '16px',
                  border:
                    dragOverZone === 'QUEUE_ZONE'
                      ? '2px dashed #f59e0b'
                      : '1px solid var(--staff-divider)',
                  boxShadow: dragOverZone === 'QUEUE_ZONE' ? '0 0 12px rgba(245, 158, 11, 0.25)' : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 16.5, fontWeight: 700, color: 'var(--staff-forest)' }}>
                      Waitlist &amp; Fleet Queue ({waitlistQueue.length})
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--staff-olive)', marginTop: 2 }}>
                      Suggested rank: Priority &rarr; Battery % &rarr; Time. Operator chooses when to plug in.
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: 6,
                      background: '#fef3c7',
                      color: '#92400e',
                    }}
                  >
                    QUEUE
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {waitlistQueue.length === 0 ? (
                    <div
                      style={{
                        padding: '24px 16px',
                        textAlign: 'center',
                        color: 'var(--staff-muted)',
                        fontSize: 13.5,
                        border: '1px dashed var(--staff-divider)',
                        borderRadius: 10,
                      }}
                    >
                      No vehicles waiting for a charger (all vehicles &ge; 80% battery).
                    </div>
                  ) : (
                    waitlistQueue.map((item) => {
                      const badgeStyle = getPriorityBadgeStyle(item.effectivePriority, item.isManual);
                      const isBeingSaved = savingKey === item.key;

                      // Check charger availability at this specific vehicle's hub
                      const hubChargers = chargersByHubId.get(Number(item.hubId)) || [];
                      const freeChargers = hubChargers.filter((cp) => cp.status === 'AVAILABLE');
                      const hasFreeCharger = freeChargers.length > 0;
                      const activeVehicleAtSameHub = activeChargingList.find(
                        (act) => Number(act.hubId) === Number(item.hubId)
                      );

                      return (
                        <div
                          key={item.key}
                          draggable={Boolean(item.vehicleId)}
                          onDragStart={(e) => handleDragStart(e, item, 'QUEUE')}
                          style={{
                            background: 'var(--staff-subcard, var(--staff-card))',
                            borderRadius: 12,
                            padding: '12px 14px',
                            border: item.isManual
                              ? '1.5px solid #34c759'
                              : '1px solid #fed7aa',
                            cursor: item.vehicleId ? 'grab' : 'default',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                            transition: 'all 0.15s ease',
                          }}
                          title="Drag to Active to plug in or swap with an active vehicle"
                        >
                          {/* Top: Queue #, Code, Hub status badge */}
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: 6,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span
                                style={{
                                  width: 24,
                                  height: 24,
                                  borderRadius: 6,
                                  background:
                                    item.effectivePriority === 'URGENT'
                                      ? '#fee2e2'
                                      : item.effectivePriority === 'HIGH'
                                      ? '#fef3c7'
                                      : '#eff9eb',
                                  color:
                                    item.effectivePriority === 'URGENT'
                                      ? '#991b1b'
                                      : item.effectivePriority === 'HIGH'
                                      ? '#92400e'
                                      : '#166534',
                                  fontWeight: 700,
                                  fontSize: 12.5,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                #{item.queuePosition}
                              </span>
                              <span style={{ fontWeight: 700, fontSize: 15.5, color: 'var(--staff-forest)' }}>
                                {item.code}
                              </span>
                              <span
                                style={{
                                  fontSize: 11.5,
                                  fontWeight: 600,
                                  padding: '2px 7px',
                                  borderRadius: 6,
                                  background: item.isManual ? '#cdf4cf' : '#f3f5ef',
                                  color: item.isManual ? '#182b20' : 'var(--staff-olive)',
                                }}
                              >
                                {item.isManual
                                  ? `MANUAL (${item.effectivePriority})`
                                  : `AUTO (${item.effectivePriority})`}
                              </span>
                            </div>

                            {hasFreeCharger ? (
                              <span
                                style={{
                                  fontSize: 11.5,
                                  fontWeight: 700,
                                  padding: '2px 7px',
                                  borderRadius: 6,
                                  background: '#dcfce7',
                                  color: '#15803d',
                                }}
                              >
                                Free at hub: {freeChargers[0].chargerCode}
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: 11.5,
                                  fontWeight: 600,
                                  padding: '2px 7px',
                                  borderRadius: 6,
                                  background: '#fee2e2',
                                  color: '#b91c1c',
                                }}
                              >
                                Chargers at hub busy
                              </span>
                            )}
                          </div>

                          {/* Middle: Hub, Model, Battery Bar */}
                          <div>
                            <div style={{ fontSize: 12.5, color: 'var(--staff-muted)', marginBottom: 4 }}>
                              {item.hubName} · {item.subLabel} · Battery{' '}
                              <strong>{item.currentBattery}%</strong> &rarr; {item.targetBattery}%
                            </div>
                            <div
                              style={{
                                width: '100%',
                                height: 6,
                                background: '#fef3c7',
                                borderRadius: 999,
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: `${Math.min(100, Math.max(0, item.currentBattery))}%`,
                                  height: '100%',
                                  background:
                                    item.currentBattery < 20
                                      ? '#ef4444'
                                      : item.currentBattery < 50
                                      ? '#f59e0b'
                                      : '#22c55e',
                                  transition: 'width 0.4s ease',
                                }}
                              />
                            </div>
                          </div>

                          {/* Bottom: Priority & Operator Action Button */}
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: 6,
                              paddingTop: 4,
                              borderTop: '1px solid #fff7ed',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 12, color: '#92400e' }}>Priority:</span>
                              <select
                                className="staff-pill-select priority-pill-select"
                                disabled={isBeingSaved}
                                style={{
                                  padding: '3px 8px',
                                  fontSize: 12,
                                  fontWeight: 600,
                                  borderRadius: 6,
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

                            {/* Operator Action */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {hasFreeCharger ? (
                                <button
                                  type="button"
                                  disabled={isBeingSaved}
                                  onClick={() => handlePlugIn(item, freeChargers[0].id)}
                                  className="staff-pill-btn staff-pill-btn--primary"
                                  style={{
                                    padding: '4px 10px',
                                    fontSize: 12.5,
                                    fontWeight: 700,
                                    minHeight: 28,
                                    background: '#16a34a',
                                    color: '#ffffff',
                                    border: 'none',
                                    cursor: 'pointer',
                                    borderRadius: 7,
                                  }}
                                  title={`Plug this vehicle into available charger ${freeChargers[0].chargerCode} at ${item.hubName}`}
                                >
                                  {isBeingSaved ? 'Plugging in...' : `Plug In (${freeChargers[0].chargerCode})`}
                                </button>
                              ) : activeVehicleAtSameHub ? (
                                <button
                                  type="button"
                                  disabled={isBeingSaved}
                                  onClick={() => handleSwap(activeVehicleAtSameHub, item)}
                                  className="staff-pill-btn"
                                  style={{
                                    padding: '4px 10px',
                                    fontSize: 12.5,
                                    fontWeight: 700,
                                    minHeight: 28,
                                    background: '#ea580c',
                                    color: '#ffffff',
                                    border: 'none',
                                    cursor: 'pointer',
                                    borderRadius: 7,
                                  }}
                                  title={`Swap charger with vehicle ${activeVehicleAtSameHub.code} at the same hub`}
                                >
                                  {isBeingSaved ? 'Swapping...' : `Swap (${activeVehicleAtSameHub.code})`}
                                </button>
                              ) : (
                                <span style={{ fontSize: 12, color: 'var(--staff-muted)', fontStyle: 'italic' }}>
                                  Waiting for charger
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

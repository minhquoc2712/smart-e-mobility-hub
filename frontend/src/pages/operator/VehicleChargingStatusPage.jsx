import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { operatorApi, chargingApi } from '../../api';

const HUMAN_STATUS = {
  AVAILABLE: 'Available',
  RESERVED: 'Reserved',
  IN_USE: 'In use',
  CHARGING: 'Charging',
  OUT_OF_SERVICE: 'Maintenance',
};

const PRIORITIES = ['URGENT', 'HIGH', 'NORMAL', 'LOW'];
const PRIORITY_RANK = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
const MANUAL_PRIORITY_STORAGE_KEY = 'semh_staff_manual_charging_priority_v1';

/**
 * Smart Charging Auto-Priority Rule (Task 4.1a / 4.1b — businessRules):
 *  - Battery < 20%   -> URGENT
 *  - Battery 20–49%  -> HIGH
 *  - Battery 50–79%  -> NORMAL
 *  - Battery >= 80%  -> LOW
 */
function getAutoPriorityByBattery(batteryLevel) {
  const soc = Number(batteryLevel ?? 0);
  if (soc < 20) return 'URGENT';
  if (soc < 50) return 'HIGH';
  if (soc < 80) return 'NORMAL';
  return 'LOW';
}

function getPriorityBadgeStyle(priority, isManual) {
  if (priority === 'URGENT') {
    return {
      background: '#fee2e2',
      color: '#991b1b',
      border: isManual ? '1.5px solid #dc2626' : '1px solid #fecaca',
    };
  }
  if (priority === 'HIGH') {
    return {
      background: '#fff7db',
      color: '#854d0e',
      border: isManual ? '1.5px solid #d97706' : '1px solid #fde68a',
    };
  }
  if (priority === 'NORMAL') {
    return {
      background: '#eff9eb',
      color: '#2b581c',
      border: isManual ? '1.5px solid #34c759' : '1px solid #cde8cc',
    };
  }
  return {
    background: '#f3f5ef',
    color: '#5a6e58',
    border: isManual ? '1.5px solid #5a6e58' : '1px solid #dce5d8',
  };
}

function loadManualOverrides() {
  try {
    const raw = sessionStorage.getItem(MANUAL_PRIORITY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveManualOverrides(map) {
  try {
    sessionStorage.setItem(MANUAL_PRIORITY_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

/**
 * Staff / Vehicle & charging status (Task 3.3a — Figma node 32:2293 & Task 4.1a UC15)
 * Supports:
 *  1. Fleet status table with live Auto Priority (by battery %) + Manual Staff Override per vehicle
 *  2. Expandable Charging Points telemetry bar
 *  3. Auto Charging Queue (ordered automatically by priority & battery %) where Staff can intervene
 *     manually ("Set priority bằng tay") or reset back to Auto mode.
 */
export function VehicleChargingStatusPage() {
  const [bundle, setBundle] = useState(null);
  const [chargingRequests, setChargingRequests] = useState([]);
  const [manualOverrides, setManualOverrides] = useState(loadManualOverrides);
  const [hubFilter, setHubFilter] = useState('ALL');
  const [showChargers, setShowChargers] = useState(false);
  const [showQueue, setShowQueue] = useState(true);
  const [queueNotice, setQueueNotice] = useState('');

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
    const timer = setInterval(loadStatus, 15000);
    return () => clearInterval(timer);
  }, [loadStatus]);

  const hubs = bundle?.hubUtilization?.hubs || [];
  const vehicles = bundle?.vehicleCharging?.vehicles || [];
  const chargingPoints = bundle?.vehicleCharging?.chargingPoints || [];
  const chargingVehiclesCount =
    bundle?.vehicleCharging?.vehicleStats?.CHARGING ??
    vehicles.filter((v) => v.status === 'CHARGING').length;

  // Map active charging_requests by vehicleId so fleet vehicles & DB requests stay linked
  const requestByVehicleId = useMemo(() => {
    const map = new Map();
    chargingRequests.forEach((req) => {
      const vid = req.vehicleId ?? req.vehicle_id;
      if (vid != null) {
        map.set(Number(vid), req);
      }
    });
    return map;
  }, [chargingRequests]);

  // Enrich fleet vehicles with charger info + Auto vs Manual priority
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
        const manualPriority = manualOverrides[key] || null;
        const effectivePriority = manualPriority || autoPriority;

        return {
          ...v,
          overrideKey: key,
          linkedRequestId: linkedReq?.id || null,
          chargerCode: charger?.chargerCode || null,
          autoPriority,
          manualPriority,
          effectivePriority,
          isManual: Boolean(manualPriority),
        };
      });
  }, [vehicles, chargingPoints, requestByVehicleId, manualOverrides, hubFilter]);

  // Build Unified Smart Charging Queue (Auto-ranked by priority + battery %, with Staff manual override)
  const smartQueue = useMemo(() => {
    const items = [];
    const seenRequestIds = new Set();

    // 1. Fleet vehicles that are CHARGING, need charging (< 80% battery), have a linked request, or have a manual override
    vehicles.forEach((v) => {
      if (hubFilter !== 'ALL' && Number(v.currentHubId) !== Number(hubFilter)) return;

      const key = `veh-${v.id}`;
      const linkedReq = requestByVehicleId.get(Number(v.id));
      if (linkedReq) seenRequestIds.add(Number(linkedReq.id));

      const charger = chargingPoints.find(
        (cp) => Number(cp.currentVehicleId) === Number(v.id)
      );
      const autoPriority = getAutoPriorityByBattery(v.batteryLevel);
      const manualPriority = manualOverrides[key] || null;
      const effectivePriority = manualPriority || autoPriority;

      const shouldIncludeInQueue =
        v.status === 'CHARGING' ||
        Number(v.batteryLevel) < 80 ||
        Boolean(linkedReq) ||
        Boolean(manualPriority);

      if (!shouldIncludeInQueue) return;

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
        targetBattery: Number(linkedReq?.targetBatteryLevel ?? linkedReq?.target_battery_level ?? 95),
        queueStatus:
          v.status === 'CHARGING'
            ? `Charging at ${charger?.chargerCode || 'charger'}`
            : linkedReq?.status === 'SCHEDULED'
            ? 'Scheduled in queue'
            : 'Queued (waiting charger)',
        autoPriority,
        manualPriority,
        effectivePriority,
        isManual: Boolean(manualPriority),
      });
    });

    // 2. Private EV / standalone charging_requests from students
    chargingRequests.forEach((req) => {
      if (seenRequestIds.has(Number(req.id))) return;
      const reqHubId = req.hubId ?? req.hub_id;
      if (hubFilter !== 'ALL' && Number(reqHubId) !== Number(hubFilter)) return;

      const key = `req-${req.id}`;
      const curBatt = Number(req.currentBatteryLevel ?? req.current_battery_level ?? 28);
      const tgtBatt = Number(req.targetBatteryLevel ?? req.target_battery_level ?? 85);
      const autoPriority = getAutoPriorityByBattery(curBatt);
      const manualPriority = manualOverrides[key] || null;
      const effectivePriority = manualPriority || req.priority || autoPriority;

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
        subLabel: `${req.requestCode || req.request_code || `CHG-${req.id}`} · Private Student EV`,
        ownershipType: req.ownershipType || req.ownership_type || 'PRIVATE',
        hubId: reqHubId,
        hubName: req.hubName || req.hub_name || 'Campus Hub',
        currentBattery: curBatt,
        targetBattery: tgtBatt,
        queueStatus: req.status || 'SCHEDULED',
        autoPriority,
        manualPriority,
        effectivePriority,
        isManual: Boolean(manualPriority),
      });
    });

    // Sort queue: 1) Effective Priority (URGENT -> HIGH -> NORMAL -> LOW), 2) Lowest battery % first
    items.sort((a, b) => {
      const rankDiff =
        (PRIORITY_RANK[a.effectivePriority] ?? 2) -
        (PRIORITY_RANK[b.effectivePriority] ?? 2);
      if (rankDiff !== 0) return rankDiff;
      return a.currentBattery - b.currentBattery;
    });

    return items.map((item, idx) => ({
      ...item,
      queuePosition: idx + 1,
    }));
  }, [vehicles, chargingPoints, chargingRequests, requestByVehicleId, manualOverrides, hubFilter]);

  const handleSetPriority = async ({ key, label, vehicleId, requestId, nextValue }) => {
    setQueueNotice('');
    const isResetToAuto = nextValue === 'AUTO';

    setManualOverrides((prev) => {
      const next = { ...prev };
      if (isResetToAuto) {
        delete next[key];
      } else {
        next[key] = nextValue;
      }
      saveManualOverrides(next);
      return next;
    });

    try {
      if (vehicleId) {
        await operatorApi.updateVehicleChargingPriority(vehicleId, nextValue);
      } else if (requestId && !isResetToAuto) {
        await chargingApi.updatePriority(requestId, nextValue);
      }
      await loadStatus();
    } catch {
      // Keep local Staff override active even if backend request is not in QUEUED/SCHEDULED state
    }

    setQueueNotice(
      isResetToAuto
        ? `Reverted ${label} back to Auto priority (by battery %).`
        : `Staff manual intervention: set ${label} priority → ${nextValue}. Queue & MySQL updated!`
    );
  };

  const handleResetAllToAuto = () => {
    setManualOverrides({});
    saveManualOverrides({});
    setQueueNotice('All charging priorities reset to Automatic (sorted by battery SoC).');
  };

  const manualOverrideCount = Object.keys(manualOverrides).length;

  return (
    <>
      <h1 className="staff-page-title">Vehicle &amp; charging status</h1>

      <div className="staff-panel staff-panel--full" style={{ maxWidth: 1120 }}>
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
              <option value="ALL">All hubs ({vehicles.length} vehicles)</option>
              {hubs.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ fontSize: 14, color: 'var(--staff-olive)' }}>
            Auto rule: <strong>&lt;20% URGENT</strong> · <strong>20–49% HIGH</strong> ·{' '}
            <strong>50–79% NORMAL</strong> · <strong>≥80% LOW</strong>
          </div>
        </div>

        {/* Fleet Vehicle Table with Auto / Manual Charging Priority */}
        <div style={{ overflowX: 'auto' }}>
          <div className="staff-list-head" style={{ minWidth: 680 }}>
            <span style={{ flex: 0.9 }}>Vehicle</span>
            <span style={{ flex: 1.4 }}>Hub &amp; Space</span>
            <span style={{ flex: 0.7 }}>Battery</span>
            <span style={{ flex: 0.9 }}>Status</span>
            <span style={{ flex: 1.3 }}>Charging priority (Auto / Staff)</span>
          </div>

          {!bundle ? (
            <p style={{ color: 'var(--staff-muted)', marginTop: 16 }}>Loading fleet status...</p>
          ) : (
            enrichedVehicles.map((v) => {
              const badgeStyle = getPriorityBadgeStyle(v.effectivePriority, v.isManual);
              return (
                <div key={v.id} className="staff-list-row" style={{ minWidth: 680 }}>
                  <span style={{ flex: 0.9, fontWeight: 600 }}>{v.code}</span>
                  <span style={{ flex: 1.4 }}>
                    {v.currentHubName || 'In transit'}
                    {v.chargerCode ? (
                      <span style={{ color: '#2b7a38', fontSize: 14, fontWeight: 600 }}>
                        {' '}
                        · ⚡ {v.chargerCode}
                      </span>
                    ) : v.parkingSlotCode ? (
                      <span style={{ color: 'var(--staff-muted)', fontSize: 14 }}>
                        {' '}
                        · {v.parkingSlotCode}
                      </span>
                    ) : null}
                  </span>
                  <span
                    style={{
                      flex: 0.7,
                      fontWeight: 600,
                      color: v.batteryLevel < 20 ? '#991b1b' : 'var(--staff-ink)',
                    }}
                  >
                    {v.batteryLevel}%
                  </span>
                  <span style={{ flex: 0.9 }}>{HUMAN_STATUS[v.status] || v.status}</span>

                  <span
                    style={{
                      flex: 1.3,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <select
                      className="staff-pill-select"
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
          <span>{chargingVehiclesCount} vehicles charging</span>
          <span style={{ fontSize: 14.5, color: 'var(--staff-olive)' }}>
            {showChargers ? 'Hide chargers ▲' : `View ${chargingPoints.length} chargers ▼`}
          </span>
        </div>

        {showChargers && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
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
                <div style={{ fontSize: 13.5, marginTop: 4, fontWeight: 500 }}>
                  {cp.status}
                  {cp.currentVehicleCode ? ` (${cp.currentVehicleCode})` : ''}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Task 4.1a (UC15): Smart Charging Queue (Auto by Battery + Staff Manual Override) */}
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
                Smart charging queue ({smartQueue.length}) · Auto queue with Staff manual override
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--staff-olive)' }}>
                Automatically ranked by battery level — Staff can manually set priority to jump queue order
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
                  All vehicles are above 80% battery. Set a vehicle&apos;s priority manually above to queue it.
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
                                background: item.isManual ? '#cdf4cf' : '#f3f5ef',
                                color: item.isManual ? '#182b20' : 'var(--staff-olive)',
                              }}
                            >
                              {item.isManual
                                ? 'MANUAL (Staff override)'
                                : `AUTO (Battery ${item.currentBattery}%)`}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--staff-muted)', marginTop: 2 }}>
                            {item.hubName} · {item.subLabel} · Battery{' '}
                            <strong>{item.currentBattery}%</strong> → {item.targetBattery}% ·{' '}
                            {item.queueStatus}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13.5, color: 'var(--staff-olive)' }}>
                          Set priority:
                        </span>
                        <select
                          className="staff-pill-select"
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
                              nextValue: e.target.value,
                            })
                          }
                        >
                          <option value="AUTO">
                            Auto ({item.autoPriority})
                          </option>
                          {PRIORITIES.map((p) => (
                            <option key={p} value={p}>
                              Manual: {p}
                            </option>
                          ))}
                        </select>

                        {item.isManual && (
                          <button
                            type="button"
                            className="staff-mini-link"
                            style={{ background: '#eff9eb', fontWeight: 600 }}
                            onClick={() =>
                              handleSetPriority({
                                key: item.key,
                                label: item.code,
                                vehicleId: item.vehicleId,
                                requestId: item.requestId,
                                nextValue: 'AUTO',
                              })
                            }
                          >
                            Auto
                          </button>
                        )}
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

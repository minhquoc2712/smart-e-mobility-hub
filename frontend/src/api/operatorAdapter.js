/**
 * Normalizes Operator telemetry & monitoring payloads so the Staff UI (Task 3.3a)
 * works seamlessly across:
 *   1. OpenAPI Mock Mode (Task 3.0)
 *   2. Core State APIs on `main` (Task 3.1: /hubs, /vehicles, /parking-slots, /charging-points)
 *   3. Consolidated Operator Monitoring API on branch `3.3b` (Task 3.3b: /operator/dashboard)
 */
const LOW_STOCK_THRESHOLD = 3;

export function normalizeIncident(raw) {
  return {
    id: Number(raw.id),
    incidentCode: raw.incidentCode || raw.incident_code || `INC-${raw.id}`,
    hubId: Number(raw.hubId ?? raw.hub_id),
    hubName: raw.hubName || raw.hub_name || 'Campus Hub',
    targetType: raw.targetType || raw.target_type || 'HUB',
    vehicleId: raw.vehicleId ?? raw.vehicle_id ?? null,
    chargingPointId: raw.chargingPointId ?? raw.charging_point_id ?? null,
    parkingSlotId: raw.parkingSlotId ?? raw.parking_slot_id ?? null,
    severity: raw.severity || 'MEDIUM',
    title: raw.title || 'Operational incident',
    description: raw.description || '',
    resolutionNotes: raw.resolutionNotes ?? raw.resolution_notes ?? null,
    status: raw.status || 'OPEN',
    createdAt: raw.createdAt || raw.created_at || null,
    closedAt: raw.closedAt || raw.closed_at || null,
  };
}

export function buildOperatorDashboardBundle({
  rawDashboard = null,
  hubs = [],
  vehicles = [],
  parkingSlots = [],
  chargingPoints = [],
  openIncidents = 0,
}) {
  // Case 1: Backend 3.3b already returned the 4-section Operator bundle
  if (
    rawDashboard &&
    rawDashboard.overview &&
    rawDashboard.hubUtilization &&
    rawDashboard.manageParking &&
    rawDashboard.vehicleCharging
  ) {
    return {
      overview: rawDashboard.overview,
      hubUtilization: rawDashboard.hubUtilization,
      manageParking: rawDashboard.manageParking,
      vehicleCharging: rawDashboard.vehicleCharging,
      openIncidents: Number(rawDashboard.openIncidents ?? openIncidents ?? 0),
    };
  }

  // Case 2: Synthesize the exact same 3.3b bundle from Core State entities (Task 3.1 / Mock DB)
  const hubMap = new Map(hubs.map((h) => [Number(h.id), h]));
  const slotMap = new Map(parkingSlots.map((s) => [Number(s.id), s]));
  const vehicleMap = new Map(vehicles.map((v) => [Number(v.id), v]));

  const normalizedSlots = parkingSlots.map((s) => {
    const hub = hubMap.get(Number(s.hubId ?? s.hub_id));
    return {
      ...s,
      id: Number(s.id),
      hubId: Number(s.hubId ?? s.hub_id),
      hubCode: s.hubCode || hub?.code || '',
      hubName: s.hubName || hub?.name || 'Campus Hub',
      slotCode: s.slotCode || s.slot_code,
      slotType: s.slotType || s.slot_type || 'SHARED_EV',
      status: s.status || 'FREE',
      updatedAt: s.updatedAt || s.updated_at || null,
    };
  });

  const normalizedVehicles = vehicles.map((v) => {
    const hubId = v.currentHubId ?? v.current_hub_id ?? null;
    const slotId = v.parkingSlotId ?? v.parking_slot_id ?? null;
    const hub = hubId ? hubMap.get(Number(hubId)) : null;
    const slot = slotId ? slotMap.get(Number(slotId)) : null;
    return {
      ...v,
      id: Number(v.id),
      code: v.code,
      type: v.type,
      model: v.model,
      currentHubId: hubId ? Number(hubId) : null,
      currentHubName: v.currentHubName || v.current_hub_name || hub?.name || 'In transit',
      currentHubCode: v.currentHubCode || hub?.code || '',
      parkingSlotId: slotId ? Number(slotId) : null,
      parkingSlotCode: v.parkingSlotCode || slot?.slotCode || slot?.slot_code || null,
      batteryLevel: Number(v.batteryLevel ?? v.battery_level ?? 0),
      estimatedRangeKm: Number(v.estimatedRangeKm ?? v.estimated_range_km ?? 0),
      status: v.status || 'AVAILABLE',
      updatedAt: v.updatedAt || v.updated_at || null,
    };
  });

  const normalizedChargers = chargingPoints.map((cp) => {
    const hubId = Number(cp.hubId ?? cp.hub_id);
    const hub = hubMap.get(hubId);
    const curVehId = cp.currentVehicleId ?? cp.current_vehicle_id ?? null;
    const curVeh = curVehId ? vehicleMap.get(Number(curVehId)) : null;
    return {
      ...cp,
      id: Number(cp.id),
      hubId,
      hubName: cp.hubName || hub?.name || 'Campus Hub',
      hubCode: cp.hubCode || hub?.code || '',
      chargerCode: cp.chargerCode || cp.charger_code,
      connectorType: cp.connectorType || cp.connector_type,
      maxPowerKw: Number(cp.maxPowerKw ?? cp.max_power_kw ?? 0),
      status: cp.status || 'AVAILABLE',
      currentVehicleId: curVehId ? Number(curVehId) : null,
      currentVehicleCode: cp.currentVehicleCode || curVeh?.code || null,
      currentVehicleBattery:
        cp.currentVehicleBattery ?? curVeh?.batteryLevel ?? curVeh?.battery_level ?? null,
      priorityLevel: cp.priorityLevel || cp.priority_level || 'NORMAL',
    };
  });

  const hubStatusList = hubs.map((h) => {
    const hid = Number(h.id);
    const hSlots = normalizedSlots.filter((s) => s.hubId === hid);
    const hChargers = normalizedChargers.filter((c) => c.hubId === hid);
    const hVehicles = normalizedVehicles.filter((v) => v.currentHubId === hid);

    const totalParkingSlots = Number(h.totalParkingSlots ?? h.total_parking_slots ?? hSlots.length);
    const totalChargingPoints = Number(
      h.totalChargingPoints ?? h.total_charging_points ?? hChargers.length
    );
    const totalCapacity = totalParkingSlots + totalChargingPoints;

    const occupiedSlots = hSlots.length
      ? hSlots.filter((s) => s.status === 'OCCUPIED').length
      : Math.max(0, totalParkingSlots - Number(h.freeParkingSlots ?? 0));
    const reservedSlots = hSlots.filter((s) => s.status === 'RESERVED').length;
    const outOfServiceSlots = hSlots.filter((s) => s.status === 'OUT_OF_SERVICE').length;
    const freeSlots = hSlots.length
      ? hSlots.filter((s) => s.status === 'FREE').length
      : Number(h.freeParkingSlots ?? 0);

    const chargingPointsInUse = hChargers.length
      ? hChargers.filter((c) => c.status === 'CHARGING').length
      : Math.max(0, totalChargingPoints - Number(h.availableChargingPoints ?? 0));
    const availableChargingPoints = hChargers.length
      ? hChargers.filter((c) => c.status === 'AVAILABLE').length
      : Number(h.availableChargingPoints ?? 0);
    const reservedChargingPoints = hChargers.filter((c) => c.status === 'RESERVED').length;
    const outOfServiceChargingPoints = hChargers.filter((c) => c.status === 'OUT_OF_SERVICE').length;

    const availableVehicles = hVehicles.length
      ? hVehicles.filter((v) => v.status === 'AVAILABLE').length
      : Number(h.availableBikes ?? 0) + Number(h.availableScooters ?? 0);
    const reservedVehicles = hVehicles.filter((v) => v.status === 'RESERVED').length;
    const vehiclesInUse = hVehicles.filter((v) => v.status === 'IN_USE').length;
    const vehiclesCharging = hVehicles.filter((v) => v.status === 'CHARGING').length;
    const outOfServiceVehicles = hVehicles.filter((v) => v.status === 'OUT_OF_SERVICE').length;

    const usedCapacity =
      (hSlots.length ? occupiedSlots + reservedSlots : occupiedSlots) + chargingPointsInUse;
    const denom = hSlots.length ? hSlots.length + hChargers.length : totalCapacity;
    const utilizationPercentage = denom > 0 ? Number(((usedCapacity * 100) / denom).toFixed(0)) : 0;

    const hubStatus = h.hubStatus || h.status || 'ACTIVE';
    const vehicleStockStatus = availableVehicles <= LOW_STOCK_THRESHOLD ? 'Low stock' : 'Operating';

    return {
      id: hid,
      code: h.code,
      name: h.name,
      campusZone: h.campusZone || h.campus_zone || '',
      address: h.address || '',
      hubStatus,
      totalParkingSlots,
      totalChargingPoints,
      totalCapacity,
      actualParkingSlots: hSlots.length || totalParkingSlots,
      occupiedSlots,
      reservedSlots,
      freeSlots,
      outOfServiceSlots,
      actualChargingPoints: hChargers.length || totalChargingPoints,
      availableChargingPoints,
      reservedChargingPoints,
      chargingPointsInUse,
      outOfServiceChargingPoints,
      availableVehicles,
      reservedVehicles,
      vehiclesInUse,
      vehiclesCharging,
      outOfServiceVehicles,
      utilizationPercentage,
      vehicleStockStatus,
    };
  });

  const vehicleStats = {
    AVAILABLE: normalizedVehicles.filter((v) => v.status === 'AVAILABLE').length,
    RESERVED: normalizedVehicles.filter((v) => v.status === 'RESERVED').length,
    IN_USE: normalizedVehicles.filter((v) => v.status === 'IN_USE').length,
    CHARGING: normalizedVehicles.filter((v) => v.status === 'CHARGING').length,
    OUT_OF_SERVICE: normalizedVehicles.filter((v) => v.status === 'OUT_OF_SERVICE').length,
  };

  const parkingStats = {
    total: normalizedSlots.length,
    FREE: normalizedSlots.filter((s) => s.status === 'FREE').length,
    RESERVED: normalizedSlots.filter((s) => s.status === 'RESERVED').length,
    OCCUPIED: normalizedSlots.filter((s) => s.status === 'OCCUPIED').length,
    OUT_OF_SERVICE: normalizedSlots.filter((s) => s.status === 'OUT_OF_SERVICE').length,
  };

  const chargingStats = {
    total: normalizedChargers.length,
    AVAILABLE: normalizedChargers.filter((c) => c.status === 'AVAILABLE').length,
    RESERVED: normalizedChargers.filter((c) => c.status === 'RESERVED').length,
    CHARGING: normalizedChargers.filter((c) => c.status === 'CHARGING').length,
    OUT_OF_SERVICE: normalizedChargers.filter((c) => c.status === 'OUT_OF_SERVICE').length,
  };

  const totalParkingSlots = hubStatusList.reduce((acc, h) => acc + h.totalParkingSlots, 0);
  const totalChargingPoints = hubStatusList.reduce((acc, h) => acc + h.totalChargingPoints, 0);
  const occupiedSlots = hubStatusList.reduce((acc, h) => acc + h.occupiedSlots, 0);
  const chargingPointsInUse = hubStatusList.reduce((acc, h) => acc + h.chargingPointsInUse, 0);
  const totalCapacity = totalParkingSlots + totalChargingPoints;
  const inUseCapacity = occupiedSlots + chargingPointsInUse;

  const resolvedOpenIncidents = Number(rawDashboard?.openIncidents ?? openIncidents ?? 0);

  return {
    overview: {
      totalHubs: hubStatusList.length,
      totalParkingSlots,
      totalChargingPoints,
      occupiedSlots,
      chargingPointsInUse,
      totalCapacity,
      inUseCapacity,
      utilizationPercentage:
        totalCapacity > 0 ? Number(((inUseCapacity * 100) / totalCapacity).toFixed(1)) : 0,
      totalVehicles: normalizedVehicles.length,
      vehicleStats,
      lowStockHubs: hubStatusList.filter((h) => h.vehicleStockStatus === 'Low stock').length,
    },
    hubUtilization: {
      totalHubs: hubStatusList.length,
      hubs: hubStatusList,
    },
    manageParking: {
      statistics: parkingStats,
      parkingSlots: normalizedSlots,
    },
    vehicleCharging: {
      totalVehicles: normalizedVehicles.length,
      vehicleStats,
      vehicles: normalizedVehicles,
      chargingStatistics: chargingStats,
      chargingPoints: normalizedChargers,
    },
    openIncidents: resolvedOpenIncidents,
  };
}

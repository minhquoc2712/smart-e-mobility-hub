/**
 * Stateful Mock API Server (Task 3.0 & Task 3.3a)
 * Persists state inside sessionStorage so UI screens (Tasks 3.2a, 3.3a, 4.1a, 4.2a)
 * experience realistic state transitions before the Node.js + MySQL backend is connected.
 */
import { INITIAL_MOCK_DB } from './mockData';
import { buildOperatorDashboardBundle, normalizeIncident } from './operatorAdapter';

const STORAGE_KEY = 'semh_mock_db_v3';

function loadDb() {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_MOCK_DB));
    return structuredClone(INITIAL_MOCK_DB);
  }
  const parsed = JSON.parse(raw);
  if (!parsed.parkingSlots) parsed.parkingSlots = structuredClone(INITIAL_MOCK_DB.parkingSlots);
  if (!parsed.chargingPoints) parsed.chargingPoints = structuredClone(INITIAL_MOCK_DB.chargingPoints);
  return parsed;
}

function saveDb(db) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function delay(ms = 140) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const mockServer = {
  resetMockDb() {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_MOCK_DB));
    return structuredClone(INITIAL_MOCK_DB);
  },

  async demoLogin(email) {
    await delay();
    const db = loadDb();
    let user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      user = {
        id: Date.now(),
        email,
        fullName: email.split('@')[0],
        role: email.toLowerCase().includes('operator') ? 'OPERATOR' : 'USER',
      };
      db.users.push(user);
      saveDb(db);
    }
    return {
      token: `mock-jwt-token-${user.id}-${user.role}`,
      user,
    };
  },

  async getHubs({ search = '', vehicleType = '' } = {}) {
    await delay();
    const db = loadDb();
    return db.hubs.filter((h) => {
      const matchText =
        !search ||
        h.name.toLowerCase().includes(search.toLowerCase()) ||
        h.campusZone.toLowerCase().includes(search.toLowerCase());
      const matchType =
        !vehicleType ||
        (vehicleType === 'ELECTRIC_BIKE' && h.availableBikes > 0) ||
        (vehicleType === 'ELECTRIC_SCOOTER' && h.availableScooters > 0);
      return matchText && matchType;
    });
  },

  async getHubById(hubId) {
    await delay();
    const db = loadDb();
    const hub = db.hubs.find((h) => h.id === Number(hubId));
    if (!hub) throw new Error('Hub not found');
    const vehicles = db.vehicles.filter((v) => v.currentHubId === Number(hubId));
    return { ...hub, vehicles };
  },

  async getVehicles({ hubId, type, minBattery = 0, status } = {}) {
    await delay();
    const db = loadDb();
    return db.vehicles.filter((v) => {
      if (hubId && v.currentHubId !== Number(hubId)) return false;
      if (type && v.type !== type) return false;
      if (v.batteryLevel < Number(minBattery)) return false;
      if (status && v.status !== status) return false;
      return true;
    });
  },

  async getParkingSlots({ hubId, status, slotType } = {}) {
    await delay();
    const db = loadDb();
    return db.parkingSlots.filter((s) => {
      if (hubId && s.hubId !== Number(hubId)) return false;
      if (status && s.status !== status) return false;
      if (slotType && s.slotType !== slotType) return false;
      return true;
    });
  },

  async getChargingPoints({ hubId, status } = {}) {
    await delay();
    const db = loadDb();
    return db.chargingPoints.filter((c) => {
      if (hubId && c.hubId !== Number(hubId)) return false;
      if (status && c.status !== status) return false;
      return true;
    });
  },

  async updateParkingSlotStatus(slotId, status, extra = {}) {
    await delay();
    const db = loadDb();
    const slot = db.parkingSlots.find((s) => s.id === Number(slotId));
    if (!slot) throw new Error('Parking slot not found');
    slot.status = status;
    slot.updatedAt = new Date().toISOString();
    if (status === 'FREE') {
      delete slot.vehiclePlate;
      delete slot.checkInAt;
      delete slot.durationLabel;
      db.vehicles.forEach((v) => {
        if (v.parkingSlotId === slot.id) v.parkingSlotId = null;
      });
    } else if (extra.vehiclePlate) {
      slot.vehiclePlate = extra.vehiclePlate;
      slot.checkInAt = extra.checkInAt || new Date().toTimeString().slice(0, 5);
      slot.durationLabel = 'Just now';
    }
    saveDb(db);
    return slot;
  },

  async getMyReservations(userId) {
    await delay();
    const db = loadDb();
    return db.reservations.filter((r) => !userId || r.userId === userId);
  },

  async reserveVehicle({ userId, hubId, vehicleId, startTime, endTime }) {
    await delay();
    const db = loadDb();
    const vehicle = db.vehicles.find((v) => v.id === Number(vehicleId));
    const hub = db.hubs.find((h) => h.id === Number(hubId));
    if (!vehicle || vehicle.status !== 'AVAILABLE') {
      throw new Error('Selected vehicle is not AVAILABLE.');
    }
    vehicle.status = 'RESERVED';
    const newReservation = {
      id: Date.now(),
      reservationCode: `RES-V-${String(Date.now()).slice(-5)}`,
      userId,
      reservationType: 'VEHICLE',
      hubId: Number(hubId),
      hubName: hub?.name || 'Campus Hub',
      vehicleId: vehicle.id,
      vehicleCode: vehicle.code,
      startTime,
      endTime,
      status: 'CONFIRMED',
    };
    db.reservations.unshift(newReservation);
    saveDb(db);
    return newReservation;
  },

  async pickupReservation(reservationId) {
    await delay();
    const db = loadDb();
    const res = db.reservations.find((r) => r.id === Number(reservationId));
    if (!res) throw new Error('Reservation not found');
    res.status = 'ACTIVE';
    const vehicle = db.vehicles.find((v) => v.id === res.vehicleId);
    if (vehicle) vehicle.status = 'IN_USE';
    saveDb(db);
    return res;
  },

  async returnReservation(reservationId, { returnHubId }) {
    await delay();
    const db = loadDb();
    const res = db.reservations.find((r) => r.id === Number(reservationId));
    if (!res) throw new Error('Reservation not found');
    const hub = db.hubs.find((h) => h.id === Number(returnHubId)) || db.hubs[0];
    if (hub.freeParkingSlots <= 0) {
      throw new Error(`${hub.name} has no free parking spaces!`);
    }
    res.status = 'COMPLETED';
    const vehicle = db.vehicles.find((v) => v.id === res.vehicleId);
    if (vehicle) {
      vehicle.status = 'AVAILABLE';
      vehicle.currentHubId = hub.id;
      vehicle.currentHubName = hub.name;
      vehicle.batteryLevel = Math.max(15, vehicle.batteryLevel - 14);
    }
    saveDb(db);
    return res;
  },

  async cancelReservation(reservationId) {
    await delay();
    const db = loadDb();
    const res = db.reservations.find((r) => r.id === Number(reservationId));
    if (!res) throw new Error('Reservation not found');
    res.status = 'CANCELLED';
    const vehicle = db.vehicles.find((v) => v.id === res.vehicleId);
    if (vehicle && vehicle.status === 'RESERVED') vehicle.status = 'AVAILABLE';
    saveDb(db);
    return res;
  },

  async getChargingRequests() {
    await delay();
    return loadDb().chargingRequests;
  },

  async createChargingRequest(payload) {
    await delay();
    const db = loadDb();
    const hub = db.hubs.find((h) => h.id === Number(payload.hubId));
    const item = {
      id: Date.now(),
      requestCode: `CHG-${String(Date.now()).slice(-5)}`,
      ...payload,
      hubName: hub?.name || 'Campus Hub',
      priority: 'NORMAL',
      queuePosition: db.chargingRequests.length + 1,
      status: 'SCHEDULED',
    };
    db.chargingRequests.push(item);
    saveDb(db);
    return item;
  },

  async updateChargingPriority(requestId, priority) {
    await delay();
    const db = loadDb();
    const req = db.chargingRequests.find((c) => c.id === Number(requestId));
    if (req) req.priority = priority;
    saveDb(db);
    return req;
  },

  async getOperatorDashboard() {
    await delay();
    const db = loadDb();
    const openIncidents = db.incidents.filter((i) => i.status !== 'CLOSED').length;
    const bundle = buildOperatorDashboardBundle({
      hubs: db.hubs,
      vehicles: db.vehicles,
      parkingSlots: db.parkingSlots,
      chargingPoints: db.chargingPoints,
      openIncidents,
    });
    return {
      totalVehicles: db.vehicles.length,
      availableVehicles: db.vehicles.filter((v) => v.status === 'AVAILABLE').length,
      inUseVehicles: db.vehicles.filter((v) => v.status === 'IN_USE').length,
      chargingVehicles: db.vehicles.filter((v) => v.status === 'CHARGING').length,
      outOfServiceVehicles: db.vehicles.filter((v) => v.status === 'OUT_OF_SERVICE').length,
      hubs: db.hubs,
      ...bundle,
    };
  },

  async getIncidents() {
    await delay();
    return loadDb().incidents.map(normalizeIncident);
  },

  async createIncident(payload) {
    await delay();
    const db = loadDb();
    const hub = db.hubs.find((h) => h.id === Number(payload.hubId));
    const incident = {
      id: Date.now(),
      incidentCode: `INC-${String(Date.now()).slice(-3)}`,
      hubId: Number(payload.hubId),
      hubName: hub?.name || 'Campus Hub',
      targetType: payload.targetType || 'HUB',
      vehicleId: payload.vehicleId ? Number(payload.vehicleId) : null,
      chargingPointId: payload.chargingPointId ? Number(payload.chargingPointId) : null,
      parkingSlotId: payload.parkingSlotId ? Number(payload.parkingSlotId) : null,
      severity: payload.severity || 'MEDIUM',
      title: payload.title,
      description: payload.description || '',
      status: 'OPEN',
      createdAt: new Date().toISOString(),
    };
    if (incident.targetType === 'VEHICLE' && incident.vehicleId) {
      const v = db.vehicles.find((item) => item.id === incident.vehicleId);
      if (v) v.status = 'OUT_OF_SERVICE';
    }
    if (incident.targetType === 'CHARGING_POINT' && incident.chargingPointId) {
      const cp = db.chargingPoints.find((item) => item.id === incident.chargingPointId);
      if (cp) cp.status = 'OUT_OF_SERVICE';
    }
    if (incident.targetType === 'PARKING_SLOT' && incident.parkingSlotId) {
      const ps = db.parkingSlots.find((item) => item.id === incident.parkingSlotId);
      if (ps) ps.status = 'OUT_OF_SERVICE';
    }
    if (incident.targetType === 'HUB' && hub) {
      hub.status = 'MAINTENANCE';
    }
    db.incidents.unshift(incident);
    saveDb(db);
    return normalizeIncident(incident);
  },

  async assignIncident(incidentId) {
    await delay();
    const db = loadDb();
    const inc = db.incidents.find((i) => i.id === Number(incidentId));
    if (inc && inc.status === 'OPEN') inc.status = 'IN_PROGRESS';
    saveDb(db);
    return inc ? normalizeIncident(inc) : null;
  },

  async closeIncident(incidentId, resolutionNotes = 'Repaired and verified.') {
    await delay();
    const db = loadDb();
    const inc = db.incidents.find((i) => i.id === Number(incidentId));
    if (inc) {
      inc.status = 'CLOSED';
      inc.resolutionNotes = resolutionNotes;
      inc.closedAt = new Date().toISOString();
      if (inc.targetType === 'VEHICLE' && inc.vehicleId) {
        const v = db.vehicles.find((item) => item.id === Number(inc.vehicleId));
        if (v) v.status = 'AVAILABLE';
      }
      if (inc.targetType === 'CHARGING_POINT' && inc.chargingPointId) {
        const cp = db.chargingPoints.find((item) => item.id === Number(inc.chargingPointId));
        if (cp) cp.status = 'AVAILABLE';
      }
      if (inc.targetType === 'PARKING_SLOT' && inc.parkingSlotId) {
        const ps = db.parkingSlots.find((item) => item.id === Number(inc.parkingSlotId));
        if (ps) ps.status = 'FREE';
      }
      if (inc.targetType === 'HUB' && inc.hubId) {
        const h = db.hubs.find((item) => item.id === Number(inc.hubId));
        if (h) h.status = 'ACTIVE';
      }
    }
    saveDb(db);
    return inc ? normalizeIncident(inc) : null;
  },

  async redistributeVehicles({
    sourceHubId,
    destinationHubId,
    vehicleCount,
    assignedStaff,
    allocations,
  }) {
    await delay();
    const db = loadDb();
    const destHub = db.hubs.find((h) => h.id === Number(destinationHubId));

    // Slot-to-slot arrangement mode (S1->V1 ===> Dest Slot S2, or same-hub slot rearrangement)
    if (Array.isArray(allocations) && allocations.length > 0) {
      const nowIso = new Date().toISOString();

      // Phase A: vacate all source slots first (supports safe swaps within the same hub)
      allocations.forEach((item) => {
        const veh = db.vehicles.find((v) => v.id === Number(item.vehicleId));
        const oldSlotId = item.fromSlotId ?? veh?.parkingSlotId;
        if (oldSlotId) {
          const oldSlot = db.parkingSlots.find((s) => s.id === Number(oldSlotId));
          if (oldSlot) {
            oldSlot.status = 'FREE';
            oldSlot.updatedAt = nowIso;
            delete oldSlot.vehiclePlate;
            delete oldSlot.checkInAt;
            delete oldSlot.durationLabel;
          }
        }
        if (veh) {
          veh.parkingSlotId = null;
        }
      });

      // Phase B: occupy target slots and update vehicle hub + slot bindings
      allocations.forEach((item) => {
        const veh = db.vehicles.find((v) => v.id === Number(item.vehicleId));
        const newSlot = db.parkingSlots.find((s) => s.id === Number(item.toSlotId));
        if (veh && newSlot) {
          newSlot.status = 'OCCUPIED';
          newSlot.updatedAt = nowIso;
          veh.currentHubId = Number(destinationHubId);
          veh.currentHubName = destHub?.name || veh.currentHubName;
          veh.parkingSlotId = newSlot.id;
        }
      });

      saveDb(db);
      return {
        orderCode: `DSP-${String(Date.now()).slice(-4)}`,
        movedCount: allocations.length,
        assignedStaff: assignedStaff || 'S. Patel',
        allocations,
        status: 'COMPLETED',
      };
    }

    // Legacy fallback (count-only dispatch)
    const count = Math.max(1, Number(vehicleCount) || 1);
    const movable = db.vehicles
      .filter((v) => v.currentHubId === Number(sourceHubId) && v.status === 'AVAILABLE')
      .slice(0, count);
    const freeDestSlots = db.parkingSlots.filter(
      (s) =>
        s.hubId === Number(destinationHubId) &&
        (s.slotType === 'SHARED_EV' || s.slotType === 'UNIVERSAL') &&
        s.status === 'FREE'
    );
    movable.forEach((v, idx) => {
      if (v.parkingSlotId) {
        const oldSlot = db.parkingSlots.find((s) => s.id === v.parkingSlotId);
        if (oldSlot) oldSlot.status = 'FREE';
      }
      v.currentHubId = Number(destinationHubId);
      v.currentHubName = destHub?.name || v.currentHubName;
      const targetSlot = freeDestSlots[idx];
      if (targetSlot) {
        targetSlot.status = 'OCCUPIED';
        v.parkingSlotId = targetSlot.id;
      } else {
        v.parkingSlotId = null;
      }
    });
    saveDb(db);
    return {
      orderCode: `DSP-${String(Date.now()).slice(-4)}`,
      movedCount: movable.length,
      assignedStaff: assignedStaff || 'S. Patel',
      status: 'COMPLETED',
    };
  },

  async getScenarios() {
    await delay();
    return loadDb().scenarios;
  },

  async runSimulation({ scenarioCode, params }) {
    await delay(300);
    const db = loadDb();
    return {
      runId: `SIM-${String(Date.now()).slice(-6)}`,
      scenarioCode,
      isolatedSnapshotCounts: { hubsCloned: db.hubs.length, vehiclesCloned: db.vehicles.length },
      paramsUsed: params,
      impactSummary: {
        unmetDemandEstimate: 11,
        peakUtilizationPercent: 93,
        avgWaitMinutes: 12,
      },
      recommendations: [
        {
          id: 'REC-1',
          actionType: 'DISPATCH',
          summary: 'Redistribute 5 available e-bikes from Dormitory Zone B Hub to Metro Suoi Tien - VNU Hub.',
        },
        {
          id: 'REC-2',
          actionType: 'CHARGING_PRIORITY',
          summary: 'Promote vehicles above 55% SoC to URGENT fast top-up to meet peak departure wave.',
        },
      ],
    };
  },
};

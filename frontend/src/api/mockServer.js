/**
 * Stateful Mock API Server (Task 3.0)
 * Persists state inside sessionStorage so UI screens (Tasks 3.2a, 3.3a, 4.1a, 4.2a)
 * experience realistic state transitions (AVAILABLE -> RESERVED -> IN_USE -> AVAILABLE)
 * before the Node.js + MySQL backend is connected.
 */
import { INITIAL_MOCK_DB } from './mockData';

const STORAGE_KEY = 'semh_mock_db_v1';

function loadDb() {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_MOCK_DB));
    return structuredClone(INITIAL_MOCK_DB);
  }
  return JSON.parse(raw);
}

function saveDb(db) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function delay(ms = 180) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isValidFutureRange(startTime, endTime) {
  if (typeof startTime !== 'string' || typeof endTime !== 'string') return false;
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  return Number.isFinite(start)
    && Number.isFinite(end)
    && start >= Date.now()
    && end >= Date.now()
    && end > start;
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

  async getParkingSlots(hubId) {
    await delay();
    const db = loadDb();
    return db.vehicles
      .filter((vehicle) => vehicle.currentHubId === Number(hubId) && vehicle.parkingSlotCode)
      .map((vehicle) => ({
        id: vehicle.parkingSlotId ?? vehicle.id,
        hubId: Number(hubId),
        slotCode: vehicle.parkingSlotCode,
        status: vehicle.status === 'AVAILABLE' ? 'OCCUPIED' : vehicle.status,
      }));
  },

  async getChargingPoints(hubId) {
    await delay();
    const hub = loadDb().hubs.find((item) => item.id === Number(hubId));
    if (!hub) throw new Error('Hub not found');
    return Array.from(
      { length: Math.max(0, Number(hub.availableChargingPoints) || 0) },
      (_, index) => ({
        id: Number(hubId) * 100 + index + 1,
        hubId: Number(hubId),
        chargerCode: `C-${String(index + 1).padStart(2, '0')}`,
        connectorType: 'UNIVERSAL_AC',
        status: 'AVAILABLE',
      }),
    );
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

  async getMyReservations(userId) {
    await delay();
    const db = loadDb();
    return db.reservations.filter((r) => !userId || r.userId === userId);
  },

  async reserveVehicle({ userId, hubId, vehicleId, startTime, endTime }) {
    await delay();
    if (!isValidFutureRange(startTime, endTime)) {
      throw new Error('Reservation start and end times must be valid future times, and end must be after start.');
    }
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
      parkingSlotCode: vehicle.parkingSlotCode || null,
      startTime,
      endTime,
      status: 'CONFIRMED',
    };
    db.reservations.unshift(newReservation);
    saveDb(db);
    return newReservation;
  },

  async reserveParking({ userId, hubId, startTime, endTime, licensePlate }) {
    await delay();
    if (!isValidFutureRange(startTime, endTime)) {
      throw new Error('Parking start and end times must be valid future times, and departure must be after arrival.');
    }
    const db = loadDb();
    const hub = db.hubs.find((item) => item.id === Number(hubId));
    if (!hub) throw new Error('Hub not found.');
    if (hub.freeParkingSlots <= 0) throw new Error('No free parking slots available at this hub.');
    hub.freeParkingSlots -= 1;
    const reservation = {
      id: Date.now(),
      reservationCode: `RES-P-${String(Date.now()).slice(-5)}`,
      userId,
      reservationType: 'PARKING',
      hubId: Number(hubId),
      hubName: hub.name,
      parkingSlotCode: `P-${String(hub.id).padStart(2, '0')}-${String(Date.now()).slice(-3)}`,
      startTime,
      endTime,
      licensePlate,
      status: 'CONFIRMED',
    };
    db.reservations.unshift(reservation);
    saveDb(db);
    return reservation;
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
    if (res.reservationType === 'PARKING') {
      const hub = db.hubs.find((item) => item.id === res.hubId);
      if (hub) hub.freeParkingSlots = Math.min(hub.totalParkingSlots, hub.freeParkingSlots + 1);
    }
    saveDb(db);
    return res;
  },

  async getChargingRequests() {
    await delay();
    return loadDb().chargingRequests;
  },

  async createChargingRequest(payload) {
    await delay();
    if (!isValidFutureRange(payload.scheduledStart, payload.scheduledEnd)) {
      throw new Error('Charging start and end times must be valid future times, and end must be after start.');
    }
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

  async cancelChargingRequest(requestId) {
    await delay();
    const db = loadDb();
    const requestIndex = db.chargingRequests.findIndex((request) => request.id === Number(requestId));
    if (requestIndex < 0) throw new Error('Charging registration not found.');
    const [request] = db.chargingRequests.splice(requestIndex, 1);
    saveDb(db);
    return request;
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
    return {
      totalVehicles: db.vehicles.length,
      availableVehicles: db.vehicles.filter((v) => v.status === 'AVAILABLE').length,
      inUseVehicles: db.vehicles.filter((v) => v.status === 'IN_USE').length,
      chargingVehicles: db.vehicles.filter((v) => v.status === 'CHARGING').length,
      outOfServiceVehicles: db.vehicles.filter((v) => v.status === 'OUT_OF_SERVICE').length,
      openIncidents: db.incidents.filter((i) => i.status !== 'CLOSED').length,
      hubs: db.hubs,
    };
  },

  async getIncidents() {
    await delay();
    return loadDb().incidents;
  },

  async createIncident(payload) {
    await delay();
    const db = loadDb();
    const hub = db.hubs.find((h) => h.id === Number(payload.hubId));
    const incident = {
      id: Date.now(),
      incidentCode: `INC-${String(Date.now()).slice(-5)}`,
      ...payload,
      hubName: hub?.name || 'Campus Hub',
      status: 'OPEN',
      createdAt: new Date().toISOString(),
    };
    db.incidents.unshift(incident);
    saveDb(db);
    return incident;
  },

  async closeIncident(incidentId) {
    await delay();
    const db = loadDb();
    const inc = db.incidents.find((i) => i.id === Number(incidentId));
    if (inc) inc.status = 'CLOSED';
    saveDb(db);
    return inc;
  },

  async getScenarios() {
    await delay();
    return loadDb().scenarios;
  },

  async runSimulation({ scenarioCode, params }) {
    await delay(300);
    const db = loadDb(); // Read-only clone — never mutates operational mock DB!
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

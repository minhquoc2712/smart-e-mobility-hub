/**
 * Unified Frontend API Client (Task 3.0 & Task 3.3a)
 * Automatically switches between Mock API (OpenAPI 2B.6) and Real Node.js Backend
 * via VITE_USE_MOCK_API environment flag — zero UI code changes required!
 */
import { httpRequest } from './httpClient';
import { mockServer } from './mockServer';
import { buildOperatorDashboardBundle, normalizeIncident } from './operatorAdapter';

export const IS_MOCK_MODE = import.meta.env.VITE_USE_MOCK_API !== 'false';

// Tracks local IN_PROGRESS staff assignments when backend /incidents only stores OPEN -> CLOSED
const assignedIncidentIds = new Set();

export const authApi = {
  loginWithGoogle: (credential) =>
    IS_MOCK_MODE
      ? mockServer.demoLogin('student@hcmut.edu.vn')
      : httpRequest('/auth/google', { method: 'POST', body: JSON.stringify({ credential }) }),

  demoLogin: (email) =>
    IS_MOCK_MODE
      ? mockServer.demoLogin(email)
      : httpRequest('/auth/dev-login', { method: 'POST', body: JSON.stringify({ email }) }),
};

export const hubApi = {
  getHubs: (filters = {}) => {
    if (IS_MOCK_MODE) return mockServer.getHubs(filters);
    const qs = new URLSearchParams(filters).toString();
    return httpRequest(`/hubs${qs ? `?${qs}` : ''}`);
  },
  getHubById: (hubId) =>
    IS_MOCK_MODE ? mockServer.getHubById(hubId) : httpRequest(`/hubs/${hubId}`),
};

export const vehicleApi = {
  getVehicles: (filters = {}) => {
    if (IS_MOCK_MODE) return mockServer.getVehicles(filters);
    const qs = new URLSearchParams(filters).toString();
    return httpRequest(`/vehicles${qs ? `?${qs}` : ''}`);
  },
};

export const parkingSlotApi = {
  getParkingSlots: (filters = {}) => {
    if (IS_MOCK_MODE) return mockServer.getParkingSlots(filters);
    const qs = new URLSearchParams(filters).toString();
    return httpRequest(`/parking-slots${qs ? `?${qs}` : ''}`);
  },
  updateStatus: (slotId, status, extra = {}) =>
    IS_MOCK_MODE
      ? mockServer.updateParkingSlotStatus(slotId, status, extra)
      : httpRequest(`/parking-slots/${slotId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        }),
};

export const chargingPointApi = {
  getChargingPoints: (filters = {}) => {
    if (IS_MOCK_MODE) return mockServer.getChargingPoints(filters);
    const qs = new URLSearchParams(filters).toString();
    return httpRequest(`/charging-points${qs ? `?${qs}` : ''}`);
  },
};

export const reservationApi = {
  getMyReservations: (userId) =>
    IS_MOCK_MODE ? mockServer.getMyReservations(userId) : httpRequest('/reservations/my'),
  reserveVehicle: (payload) =>
    IS_MOCK_MODE
      ? mockServer.reserveVehicle(payload)
      : httpRequest('/reservations/vehicles', { method: 'POST', body: JSON.stringify(payload) }),
  pickupReservation: (id) =>
    IS_MOCK_MODE
      ? mockServer.pickupReservation(id)
      : httpRequest(`/reservations/${id}/pickup`, { method: 'POST' }),
  returnReservation: (id, payload) =>
    IS_MOCK_MODE
      ? mockServer.returnReservation(id, payload)
      : httpRequest(`/reservations/${id}/return`, { method: 'POST', body: JSON.stringify(payload) }),
  cancelReservation: (id) =>
    IS_MOCK_MODE
      ? mockServer.cancelReservation(id)
      : httpRequest(`/reservations/${id}/cancel`, { method: 'PATCH' }),
};

export const chargingApi = {
  getChargingRequests: () =>
    IS_MOCK_MODE ? mockServer.getChargingRequests() : httpRequest('/charging-requests'),
  createChargingRequest: (payload) =>
    IS_MOCK_MODE
      ? mockServer.createChargingRequest(payload)
      : httpRequest('/charging-requests', { method: 'POST', body: JSON.stringify(payload) }),
  updatePriority: (id, priority) =>
    IS_MOCK_MODE
      ? mockServer.updateChargingPriority(id, priority)
      : httpRequest(`/charging-requests/${id}/priority`, {
          method: 'PATCH',
          body: JSON.stringify({ priority }),
        }),
};

export const operatorApi = {
  getDashboard: () =>
    IS_MOCK_MODE ? mockServer.getOperatorDashboard() : httpRequest('/operator/dashboard'),

  async getDashboardBundle() {
    if (IS_MOCK_MODE) {
      const data = await mockServer.getOperatorDashboard();
      return buildOperatorDashboardBundle({ rawDashboard: data });
    }
    const rawDashboard = await httpRequest('/operator/dashboard');
    if (
      rawDashboard &&
      rawDashboard.overview &&
      rawDashboard.hubUtilization &&
      rawDashboard.manageParking &&
      rawDashboard.vehicleCharging
    ) {
      return buildOperatorDashboardBundle({ rawDashboard });
    }
    // Fallback when running against `main` (Task 3.1 APIs) before Task 3.3b is merged
    const [hubs, vehicles, parkingSlots, chargingPoints] = await Promise.all([
      httpRequest('/hubs'),
      httpRequest('/vehicles'),
      httpRequest('/parking-slots'),
      httpRequest('/charging-points'),
    ]);
    return buildOperatorDashboardBundle({
      rawDashboard,
      hubs,
      vehicles,
      parkingSlots,
      chargingPoints,
    });
  },

  async getIncidents() {
    if (IS_MOCK_MODE) return mockServer.getIncidents();
    const rows = await httpRequest('/incidents');
    return (rows || []).map((raw) => {
      const normalized = normalizeIncident(raw);
      if (normalized.status === 'OPEN' && assignedIncidentIds.has(normalized.id)) {
        return { ...normalized, status: 'IN_PROGRESS' };
      }
      return normalized;
    });
  },

  createIncident: (payload) =>
    IS_MOCK_MODE
      ? mockServer.createIncident(payload)
      : httpRequest('/incidents', { method: 'POST', body: JSON.stringify(payload) }),

  async assignIncident(id) {
    if (IS_MOCK_MODE) return mockServer.assignIncident(id);
    assignedIncidentIds.add(Number(id));
    return { id: Number(id), status: 'IN_PROGRESS' };
  },

  async closeIncident(id, resolutionNotes = 'Repaired and verified by maintenance staff.') {
    assignedIncidentIds.delete(Number(id));
    if (IS_MOCK_MODE) return mockServer.closeIncident(id, resolutionNotes);
    return httpRequest(`/incidents/${id}/close`, {
      method: 'PATCH',
      body: JSON.stringify({ resolutionNotes }),
    });
  },

  redistributeVehicles: (payload) =>
    IS_MOCK_MODE
      ? mockServer.redistributeVehicles(payload)
      : httpRequest('/dispatch/redistribute', { method: 'POST', body: JSON.stringify(payload) }),
};

export const simulationApi = {
  getScenarios: () =>
    IS_MOCK_MODE ? mockServer.getScenarios() : httpRequest('/simulations/scenarios'),
  runSimulation: (payload) =>
    IS_MOCK_MODE
      ? mockServer.runSimulation(payload)
      : httpRequest('/simulations/run', { method: 'POST', body: JSON.stringify(payload) }),
};

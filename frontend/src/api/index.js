/**
 * Unified Frontend API Client (Task 3.0)
 * Automatically switches between Mock API (OpenAPI 2B.6) and Real Node.js Backend
 * via VITE_USE_MOCK_API environment flag — zero UI code changes required!
 */
import { httpRequest } from './httpClient';
import { mockServer } from './mockServer';

export const IS_MOCK_MODE = import.meta.env.VITE_USE_MOCK_API !== 'false';
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

export const reservationApi = {
  getMyReservations: (userId) =>
    IS_MOCK_MODE ? mockServer.getMyReservations(userId) : httpRequest('/reservations/my'),
  reserveVehicle: (payload) =>
    IS_MOCK_MODE
      ? mockServer.reserveVehicle(payload)
      : httpRequest('/reservations/vehicles', { method: 'POST', body: JSON.stringify(payload) }),
  reserveParking: (payload) =>
    IS_MOCK_MODE
      ? mockServer.reserveParking(payload)
      : httpRequest('/reservations/parking', { method: 'POST', body: JSON.stringify(payload) }),
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
  cancelChargingRequest: (id) =>
    IS_MOCK_MODE
      ? mockServer.cancelChargingRequest(id)
      : httpRequest(`/charging-requests/${id}`, { method: 'DELETE' }),
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
  getIncidents: () =>
    IS_MOCK_MODE ? mockServer.getIncidents() : httpRequest('/incidents'),
  createIncident: (payload) =>
    IS_MOCK_MODE
      ? mockServer.createIncident(payload)
      : httpRequest('/incidents', { method: 'POST', body: JSON.stringify(payload) }),
  closeIncident: (id, resolutionNotes) =>
    IS_MOCK_MODE
      ? mockServer.closeIncident(id)
      : httpRequest(`/incidents/${id}/close`, {
          method: 'PATCH',
          body: JSON.stringify({ resolutionNotes }),
        }),
};

export const simulationApi = {
  getScenarios: () =>
    IS_MOCK_MODE ? mockServer.getScenarios() : httpRequest('/simulations/scenarios'),
  runSimulation: (payload) =>
    IS_MOCK_MODE
      ? mockServer.runSimulation(payload)
      : httpRequest('/simulations/run', { method: 'POST', body: JSON.stringify(payload) }),
};

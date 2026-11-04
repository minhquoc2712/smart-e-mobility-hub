/**
 * A3 IoT Sensor / Telemetry Simulator Starter (Task 3.1b — Owner: Nils)
 * Periodically sends simulated battery & status telemetry to POST /api/v1/telemetry/ingest (UC14).
 * Run with: node simulation/a3-telemetry-simulator.js
 */
const API_URL = process.env.API_URL || 'http://localhost:4000/api/v1/telemetry/ingest';
const SIMULATOR_KEY = process.env.SIMULATOR_API_KEY || 'local_dev_simulator_key';

const SAMPLE_VEHICLES = ['EB-102', 'EB-205', 'ES-301', 'EB-108', 'ES-410'];

async function sendTelemetryTick() {
  const vehicleUpdates = SAMPLE_VEHICLES.map((code) => ({
    vehicleCode: code,
    batteryLevel: Math.floor(35 + Math.random() * 60),
  }));

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ simulatorKey: SIMULATOR_KEY, vehicleUpdates }),
    });
    const data = await res.json();
    console.log(`[A3 Simulator] Sent ${vehicleUpdates.length} updates ->`, data);
  } catch (err) {
    console.error('[A3 Simulator] Backend not reachable:', err.message);
  }
}

sendTelemetryTick();

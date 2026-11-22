/**
 * Module: Operator Monitoring, Incidents, Redistribution & Telemetry
 * Covers Task 3.3b (Tráº§n Tiáº¿n PhÃ¡t), Task 4.1b (Dispatch), and Task 3.1b (Nils - A3 Telemetry).
 */
const express = require('express');
const { pool } = require('../../config/db');
const { authenticateToken, requireRole } = require('../../middlewares/auth.middleware');

const router = express.Router();
const { validateRequest: validate } = require('../../middlewares/validateRequest.middleware');
const wrap = require('../../utils/asyncHandler');
const incidentService = require('./incident.service');
const dispatchService = require('./dispatch.service');
const telemetryService = require('./telemetry.service');
const priorityService = require('./priority.service');

// UC10: Operator Network Overview Dashboard
function buildOperatorDashboardBundle({
  rawDashboard = null,
  hubs = [],
  vehicles = [],
  parkingSlots = [],
  chargingPoints = [],
  openIncidents = 0,
}) {
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
}

router.get('/operator/dashboard', authenticateToken, requireRole('OPERATOR'), async (_req, res, next) => {
  try {
    // 1. Fetch data from database
    const [
      [hubs],
      [vehicles],
      [parkingSlots],
      [chargingPoints],
      [incidents],
    ] = await Promise.all([
      pool.execute('SELECT * FROM hubs ORDER BY id ASC'),
      pool.execute('SELECT * FROM vehicles ORDER BY id ASC'),
      pool.execute('SELECT * FROM parking_slots ORDER BY id ASC'),
      pool.execute('SELECT * FROM charging_points ORDER BY id ASC'),
      pool.execute('SELECT status FROM incidents'),
    ]);

    // 2. Count open incidents
    // Keep the same condition as the mock API
    const openIncidents = incidents.filter(
      (i) => i.status !== 'CLOSED'
    ).length;

    // 3. Build the same dashboard bundle as the mock API
    const bundle = buildOperatorDashboardBundle({
      hubs,
      vehicles,
      parkingSlots,
      chargingPoints,
      openIncidents,
    });

    // 4. Calculate vehicle statistics
    const data = {
      totalVehicles: vehicles.length,

      availableVehicles: vehicles.filter(
        (v) => v.status === 'AVAILABLE'
      ).length,

      inUseVehicles: vehicles.filter(
        (v) => v.status === 'IN_USE'
      ).length,

      chargingVehicles: vehicles.filter(
        (v) => v.status === 'CHARGING'
      ).length,

      outOfServiceVehicles: vehicles.filter(
        (v) => v.status === 'OUT_OF_SERVICE'
      ).length,

      hubs,

      ...bundle,
    };

    // 5. Return dashboard data
    res.json({
      success: true,
      data,
    });

  } catch (err) {
    next(err);
  }
}
);
// UC11 & UC12: Operational Incidents
router.get('/incidents', authenticateToken, requireRole('OPERATOR'), async (_req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT i.*, h.name AS hubName FROM incidents i JOIN hubs h ON h.id = i.hub_id ORDER BY i.created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/incidents', authenticateToken, requireRole('OPERATOR'), validate('incident'), wrap(async (req, res) => {
  const data = await incidentService.reportIncident(req.user, req.body);
  console.info(JSON.stringify({event:'incident_opened',requestId:req.requestId,incidentId:data.id,targetType:data.targetType}));
  res.status(201).json({ success:true, data });
}));
router.patch('/incidents/:incidentId/close', authenticateToken, requireRole('OPERATOR'), wrap(async (req, res) => {
  const data = await incidentService.closeIncident(req.user, req.params.incidentId, req.body);
  console.info(JSON.stringify({event:'incident_closed',requestId:req.requestId,incidentId:data.id}));
  res.json({ success:true, data });
}));

// UC13: “ Validate/lock both Hubs, vehicles and slots before committing any dispatch.
router.post('/dispatch/redistribute', authenticateToken, requireRole('OPERATOR'), validate('dispatch'), wrap(async (req, res) => {
  const data = await dispatchService.redistribute(req.user, req.body);
  console.info(JSON.stringify({event:'dispatch_completed',requestId:req.requestId,dispatchId:data.id,movedCount:data.movedCount}));
  res.status(201).json({ success:true, data });
}));

// UC15: Staff manual charging priority override for Fleet Vehicles
router.patch('/operator/vehicles/:vehicleId/charging-priority', authenticateToken, requireRole('OPERATOR'), wrap(async (req, res) => {
  res.json({ success:true, data:await priorityService.overridePriority(req.user,req.params.vehicleId,req.body) });
}));

// UC14: A3 IoT Sensor / Data Simulator Telemetry Ingestion (Task 3.1b â€” Owner: Nils)
router.post('/telemetry/ingest', validate('telemetry'), wrap(async (req, res) => {
  res.json({ success:true, data:await telemetryService.ingestTelemetry(req.body) });
}));

module.exports = router;
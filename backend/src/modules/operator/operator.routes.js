/**
 * Module: Operator Monitoring, Incidents, Redistribution & Telemetry
 * Covers Task 3.3b (Trần Tiến Phát), Task 4.1b (Dispatch), and Task 3.1b (Nils - A3 Telemetry).
 */
const express = require('express');
const { pool } = require('../../config/db');
const { authenticateToken, requireRole } = require('../../middlewares/auth.middleware');
const hubsService = require('../hubs/hubs.service');
const AppError = require('../../utils/appError');
const { parseId } = require('../../utils/validators');
const { battery, optionalText } = require('../reservations/reservations.validation');
const { assertTransition } = require('../state/stateMachine');
const { withTransaction } = require('../../utils/transaction');
const { randomUUID } = require('node:crypto');
const staffCode = () => `CHG-STAFF-${randomUUID().replace(/-/g, '').slice(0, 28)}`;

// Call while the vehicle and/or charger row is locked. A future booking must not
// be overwritten by operator actions during the estimated two-hour charge.
async function assertFleetChargeAvailable(c, vehicle) {
  assertTransition('vehicle', vehicle.status, 'CHARGING');
  if (!vehicle.current_hub_id) throw new AppError(409, 'VEHICLE_NOT_AT_HUB', 'Vehicle is not at a hub.');
  await hubsService.assertHubOperational(c, vehicle.current_hub_id);
  const [bookings] = await c.execute(`SELECT id FROM reservations WHERE vehicle_id = ?
    AND status IN ('CONFIRMED','ACTIVE') AND end_time > NOW()
    AND start_time < DATE_ADD(NOW(), INTERVAL 2 HOUR) LIMIT 1 FOR UPDATE`, [vehicle.id]);
  if (bookings.length) throw new AppError(409, 'VEHICLE_TIME_SLOT_BOOKED', 'Vehicle has a rental booking during charging.');
}
async function assertChargerWindowFree(c, chargerId, vehicleId, excludeVehicleId = null) {
  const [bookings] = await c.execute(`SELECT id FROM charging_requests WHERE charging_point_id = ?
    AND status IN ('SCHEDULED','CHARGING') AND scheduled_end > NOW()
    AND scheduled_start < DATE_ADD(NOW(), INTERVAL 2 HOUR)
    AND (vehicle_id IS NULL OR (vehicle_id <> ? AND vehicle_id <> COALESCE(?, 0))) LIMIT 1 FOR UPDATE`,
    [chargerId, vehicleId, excludeVehicleId]);
  if (bookings.length) throw new AppError(409, 'TIME_SLOT_BOOKED', 'Charger is locked by another booking.');
}


const router = express.Router();

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
      pool.execute("SELECT * FROM vehicles WHERE model <> 'Customer Private EV' ORDER BY id ASC"),
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

router.post('/incidents', authenticateToken, requireRole('OPERATOR'), async (req, res, next) => {
  try {
    const { hubId, targetType, vehicleId = null, chargingPointId = null, parkingSlotId = null, severity = 'MEDIUM', title = null, description = null } = req.body;
    parseId(hubId, 'hubId');
    if (!['VEHICLE','CHARGING_POINT','PARKING_SLOT','HUB'].includes(targetType) || !['LOW','MEDIUM','HIGH','CRITICAL'].includes(severity)) throw new AppError(400, 'VALIDATION_FAILED', 'Invalid targetType or severity.');
    if (!optionalText(title, 'title', 160) || !optionalText(description, 'description', 10000)) throw new AppError(400, 'VALIDATION_FAILED', 'title and description are required.');
    const refs = { VEHICLE: vehicleId, CHARGING_POINT: chargingPointId, PARKING_SLOT: parkingSlotId };
    for (const [type, id] of Object.entries(refs)) {
      if (type === targetType) parseId(id, type);
      else if (id != null) throw new AppError(400, 'VALIDATION_FAILED', 'Incident target IDs must match targetType.');
    }
    const incidentCode = `INC-${randomUUID().replace(/-/g, '')}`;
    const data = await withTransaction(async (c) => {
    const [hubs] = await c.execute('SELECT id FROM hubs WHERE id = ? FOR UPDATE', [hubId]);
    if (!hubs.length) throw new AppError(404, 'HUB_NOT_FOUND', 'Hub not found.');
    const targets = { VEHICLE: ['vehicles','current_hub_id'], CHARGING_POINT: ['charging_points','hub_id'], PARKING_SLOT: ['parking_slots','hub_id'] };
    if (targetType !== 'HUB') {
      const [table, column] = targets[targetType];
      const [rows] = await c.execute(`SELECT id, ${column} AS hub_id FROM ${table} WHERE id = ? FOR UPDATE`, [refs[targetType]]);
      if (!rows.length) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Incident target not found.');
      if (rows[0].hub_id !== Number(hubId)) throw new AppError(409, 'HUB_MISMATCH', 'Incident target is not at this hub.');
    }
    const [result] = await c.execute(
      `INSERT INTO incidents (incident_code, reported_by, hub_id, target_type, vehicle_id, charging_point_id, parking_slot_id, severity, title, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [incidentCode, req.user.id, hubId, targetType, vehicleId, chargingPointId, parkingSlotId, severity, title, description]
    );
    if (targetType === 'VEHICLE' && vehicleId) {
      await c.execute('UPDATE vehicles SET status = "OUT_OF_SERVICE" WHERE id = ?', [vehicleId]);
    }
    if (targetType === 'CHARGING_POINT' && chargingPointId) {
      await c.execute('UPDATE charging_points SET status = "OUT_OF_SERVICE" WHERE id = ?', [chargingPointId]);
    }
    if (targetType === "PARKING_SLOT" && parkingSlotId) {
      await c.execute('UPDATE parking_slots SET status = "OUT_OF_SERVICE" WHERE id = ?', [parkingSlotId]);
    }
    if (targetType === "HUB") {
      await c.execute('UPDATE hubs SET status = "MAINTENANCE" WHERE id = ?', [hubId]);
    }
    return { id: result.insertId, incidentCode, status: 'OPEN' };
    });
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.patch('/incidents/:incidentId/close', authenticateToken, requireRole('OPERATOR'), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const incidentId = Number(req.params.incidentId);
    const {
      resolutionNotes = 'Repaired and verified.'
    } = req.body;
    if (!Number.isInteger(incidentId) || incidentId <= 0) {
      throw new AppError(400, 'VALIDATION_FAILED', 'Invalid incident ID.');
    }
    await connection.beginTransaction();

    // 1. Find and lock the incident
    const [rows] = await connection.execute(
      `SELECT *
                 FROM incidents
                 WHERE id = ?
                 FOR UPDATE`,
      [incidentId]
    );

    if (rows.length === 0) {
      await connection.rollback();

      throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Incident not found.');
    }

    const incident = rows[0];

    if (incident.status === 'CLOSED') {
      await connection.rollback();

      throw new AppError(409, 'CONFLICT', 'Incident is already closed.');
    }

    // 2. Restore the affected object's status
    if (incident.target_type === 'VEHICLE') {

      if (!incident.vehicle_id) {
        console.log("Lỗi ở vehicle_id");
        throw new AppError(404, 'RESOURCE_NOT_FOUND', 'No associated vehicle found.');
      }
      // Restore vehicle only if no other unresolved incidents related to this vehicle exist
      const [[result]] = await connection.execute(
        `SELECT COUNT(*) AS remainingIncidents
     FROM incidents
     WHERE vehicle_id = ?
       AND id <> ?
       AND status <> 'CLOSED'`,
        [incident.vehicle_id, incidentId]
      );
      if (Number(result.remainingIncidents) === 0) {
        await connection.execute(
          `UPDATE vehicles
                     SET status = 'AVAILABLE'
                     WHERE id = ?`,
          [incident.vehicle_id]
        );
      }


    } else if (incident.target_type === 'CHARGING_POINT') {

      if (!incident.charging_point_id) {
        console.log("Lỗi chargingpoint_ID");
        throw new AppError(404, 'RESOURCE_NOT_FOUND', 'No associated charging point found.');
      }
      // Restore charging point only if no other unresolved incidents exist
      const [[result]] = await connection.execute(
        `SELECT COUNT(*) AS remainingIncidents
     FROM incidents
     WHERE charging_point_id = ?
       AND id <> ?
       AND status <> 'CLOSED'`,
        [incident.charging_point_id, incidentId]
      );


      if (Number(result.remainingIncidents) === 0) {
        await connection.execute(
          `UPDATE charging_points
       SET status = 'AVAILABLE'
       WHERE id = ?`,
          [incident.charging_point_id]
        );
      }

    } else if (incident.target_type === 'PARKING_SLOT') {
      if (!incident.parking_slot_id) {
        console.log("Lỗi ở parkingSlot_id");
        throw new AppError(404, 'RESOURCE_NOT_FOUND', 'No associated parking slot found.');
      }
      // Restore parking_slot only if no other unresolved incidents related to this parking_slot exist
      const [[result]] = await connection.execute(
        `SELECT COUNT(*) AS remainingIncidents
     FROM incidents
     WHERE parking_slot_id = ?
       AND id <> ?
       AND status <> 'CLOSED'`,
        [incident.parking_slot_id, incidentId]
      );

      if (Number(result.remainingIncidents) === 0) {
        await connection.execute(
          `UPDATE parking_slots
                     SET status = 'FREE'
                     WHERE id = ?`,
          [incident.parking_slot_id]
        );
      }

    } else if (incident.target_type === 'HUB') {
      if (!incident.hub_id) {
        console.log("Lỗi ở hub_id");
        throw new AppError(404, 'RESOURCE_NOT_FOUND', 'No associated parking slot found.');
      }
      // Restore hub only if no other unresolved incidents related to this hub exist
      const [[result]] = await connection.execute(
        `SELECT COUNT(*) AS remainingIncidents
     FROM incidents
     WHERE hub_id = ?
       AND id <> ?
       AND status <> 'CLOSED'`,
        [incident.hub_id, incidentId]
      );

      if (Number(result.remainingIncidents) === 0) {
        await connection.execute(
          `UPDATE hubs
                     SET status = 'ACTIVE'
                     WHERE id = ?`,
          [incident.hub_id]
        );
      }
    }

    // 3. Close the incident
    await connection.execute(
      `UPDATE incidents
                 SET status = 'CLOSED',
                     resolution_notes = ?,
                     closed_at = NOW()
                 WHERE id = ?`,
      [resolutionNotes, incidentId]
    );

    // 4. Commit all changes
    await connection.commit();

    res.json({
      success: true,
      data: {
        id: incidentId,
        targetType: incident.target_type,
        status: 'CLOSED',
        resolutionNotes
      }
    });

  } catch (err) {
    await connection.rollback();
    next(err);

  } finally {
    connection.release();
  }
}
);

const buildPlaceholders = (count) => Array(count).fill('?').join(',');

const createHttpError = (statusCode, message) => {
  return new AppError(statusCode, statusCode === 409 ? 'DISPATCH_CONFLICT' : statusCode === 404 ? 'RESOURCE_NOT_FOUND' : 'VALIDATION_FAILED', message);
};

router.post('/dispatch/redistribute', authenticateToken, requireRole('OPERATOR'), async (req, res, next) => {
  let connection;
  let transactionStarted = false;

  try {
    connection = await pool.getConnection();

    const {
      sourceHubId,
      destinationHubId,
      vehicleCount,
      assignedStaff = 'S. Patel',
      allocations,
      reason = 'Manual balancing',
    } = req.body;

    const sourceId = Number(sourceHubId);
    const destinationId = Number(destinationHubId);

    if (
      !Number.isInteger(sourceId) ||
      sourceId <= 0 ||
      !Number.isInteger(destinationId) ||
      destinationId <= 0
    ) {
      throw createHttpError(400, 'Invalid sourceHubId or destinationHubId.');
    }

    await connection.beginTransaction();
    transactionStarted = true;

    // 1. Verify and lock source/destination hubs.
    const hubIds = [...new Set([sourceId, destinationId])];
    const [hubs] = await connection.execute(
      `SELECT id, name, status
         FROM hubs
         WHERE id IN (${buildPlaceholders(hubIds.length)})
         FOR UPDATE`,
      hubIds
    );

    if (hubs.some(h => h.status === 'MAINTENANCE')) throw createHttpError(409, 'Hub is under maintenance.');
    const existingHubIds = new Set(hubs.map((hub) => Number(hub.id)));

    if (!existingHubIds.has(sourceId)) {
      throw createHttpError(404, 'Source hub not found.');
    }

    if (!existingHubIds.has(destinationId)) {
      throw createHttpError(404, 'Destination hub not found.');
    }

    const orderCode = `DSP-${Date.now()}`;
    const staff = assignedStaff || 'S. Patel';

    // =========================================================
    // MODE 1: Slot-to-slot arrangement
    // =========================================================
    if (Array.isArray(allocations) && allocations.length > 0) {
      // Validate allocation data.
      const normalizedAllocations = allocations.map((item) => {
        const vehicleId = Number(item.vehicleId);
        const toSlotId = Number(item.toSlotId);
        const fromSlotId =
          item.fromSlotId == null ? null : Number(item.fromSlotId);

        if (
          !Number.isInteger(vehicleId) ||
          vehicleId <= 0 ||
          !Number.isInteger(toSlotId) ||
          toSlotId <= 0 ||
          (fromSlotId !== null &&
            (!Number.isInteger(fromSlotId) || fromSlotId <= 0))
        ) {
          throw createHttpError(400, 'Invalid allocation data.');
        }

        return {
          ...item,
          vehicleId,
          fromSlotId,
          toSlotId,
        };
      });

      const vehicleIds = normalizedAllocations.map((a) => a.vehicleId);
      const targetSlotIds = normalizedAllocations.map((a) => a.toSlotId);

      if (new Set(vehicleIds).size !== vehicleIds.length) {
        throw createHttpError(400, 'Duplicate vehicle in allocations.');
      }

      if (new Set(targetSlotIds).size !== targetSlotIds.length) {
        throw createHttpError(400, 'A target slot can only be allocated once.');
      }

      // 2. Lock all requested vehicles.
      const [vehicles] = await connection.execute(
        `SELECT id, current_hub_id, parking_slot_id, status
           FROM vehicles
           WHERE id IN (${buildPlaceholders(vehicleIds.length)})
           FOR UPDATE`,
        vehicleIds
      );

      const vehicleMap = new Map(
        vehicles.map((vehicle) => [Number(vehicle.id), vehicle])
      );

      if (vehicles.length !== vehicleIds.length) {
        throw createHttpError(404, 'One or more vehicles were not found.');
      }

      // Resolve the actual source slots.
      const resolvedAllocations = normalizedAllocations.map((item) => {
        const vehicle = vehicleMap.get(item.vehicleId);
        if (vehicle.status !== 'AVAILABLE') throw createHttpError(409, 'Only available vehicles can be redistributed.');

        if (Number(vehicle.current_hub_id) !== sourceId) {
          throw createHttpError(
            409,
            `Vehicle ${item.vehicleId} does not belong to the source hub.`
          );
        }

        const actualSlotId =
          vehicle.parking_slot_id == null
            ? null
            : Number(vehicle.parking_slot_id);

        // Prevent freeing a slot that is not currently assigned to this vehicle.
        if (
          item.fromSlotId !== null &&
          item.fromSlotId !== actualSlotId
        ) {
          throw createHttpError(
            409,
            `Vehicle ${item.vehicleId} has changed its parking slot.`
          );
        }

        return {
          ...item,
          oldSlotId: item.fromSlotId ?? actualSlotId,
        };
      });

      const oldSlotIds = [
        ...new Set(
          resolvedAllocations
            .map((item) => item.oldSlotId)
            .filter((id) => id !== null)
        ),
      ];

      const allSlotIds = [...new Set([...oldSlotIds, ...targetSlotIds])];

      // 3. Lock all source and target slots.
      const [slots] = await connection.execute(
        `SELECT id, hub_id, slot_type, status
           FROM parking_slots
           WHERE id IN (${buildPlaceholders(allSlotIds.length)})
           FOR UPDATE`,
        allSlotIds
      );

      const slotMap = new Map(
        slots.map((slot) => [Number(slot.id), slot])
      );

      if (slots.length !== allSlotIds.length) {
        throw createHttpError(404, 'One or more parking slots were not found.');
      }

      const oldSlotSet = new Set(oldSlotIds);

      // Validate source slots.
      for (const slotId of oldSlotIds) {
        const slot = slotMap.get(slotId);

        if (Number(slot.hub_id) !== sourceId) {
          throw createHttpError(409, 'A source slot does not belong to the source hub.');
        }
      }

      // Validate target slots.
      for (const slotId of targetSlotIds) {
        const slot = slotMap.get(slotId);

        if (Number(slot.hub_id) !== destinationId) {
          throw createHttpError(
            409,
            `Target slot ${slotId} does not belong to the destination hub.`
          );
        }

        if (!['SHARED_EV','UNIVERSAL'].includes(slot.slot_type)) throw createHttpError(409, 'Target slot is incompatible with fleet vehicles.');
        // A target must be FREE or be one of the slots vacated in Phase A.
        if (slot.status !== 'FREE' && !oldSlotSet.has(slotId)) {
          throw createHttpError(
            409,
            `Target slot ${slotId} is not available.`
          );
        }
      }

      // ---------------------------------------------------------
      // Phase A: Vacate all source slots first.
      // This allows safe swaps within the same hub.
      // ---------------------------------------------------------
      if (oldSlotIds.length > 0) {
        await connection.execute(
          `UPDATE parking_slots
             SET status = 'FREE'
             WHERE id IN (${buildPlaceholders(oldSlotIds.length)})`,
          oldSlotIds
        );
      }

      await connection.execute(
        `UPDATE vehicles
           SET parking_slot_id = NULL
           WHERE id IN (${buildPlaceholders(vehicleIds.length)})`,
        vehicleIds
      );

      // ---------------------------------------------------------
      // Phase B: Occupy target slots and update vehicle locations.
      // ---------------------------------------------------------
      await connection.execute(
        `UPDATE parking_slots
           SET status = 'OCCUPIED'
           WHERE id IN (${buildPlaceholders(targetSlotIds.length)})`,
        targetSlotIds
      );

      for (const item of resolvedAllocations) {
        await connection.execute(
          `UPDATE vehicles
             SET current_hub_id = ?,
                 parking_slot_id = ?
             WHERE id = ?`,
          [destinationId, item.toSlotId, item.vehicleId]
        );
      }

      // Create completed dispatch order.
      const [result] = await connection.execute(
        `INSERT INTO dispatch_orders
            (order_code, operator_id, source_hub_id, destination_hub_id,
             vehicle_count, reason, status)
           VALUES (?, ?, ?, ?, ?, ?, 'COMPLETED')`,
        [
          orderCode,
          req.user.id,
          sourceId,
          destinationId,
          resolvedAllocations.length,
          reason,
        ]
      );

      await hubsService.syncHubStatus(connection, sourceId);
      if (destinationId !== sourceId) {
        await hubsService.syncHubStatus(connection, destinationId);
      }

      await connection.commit();
      transactionStarted = false;

      return res.status(201).json({
        success: true,
        data: {
          id: result.insertId,
          orderCode,
          movedCount: resolvedAllocations.length,
          assignedStaff: staff,
          allocations,
          status: 'COMPLETED',
        },
      });
    }

    // =========================================================
    // MODE 2: Legacy count-only dispatch
    // =========================================================

    const count = parseId(vehicleCount ?? 1, 'vehicleCount');
    if (sourceId === destinationId) throw createHttpError(400, 'Source and destination must differ for count-only dispatch.');

    // 2. Get available vehicles from the source hub.
    const [movableVehicles] = await connection.execute(
      `SELECT id, current_hub_id, parking_slot_id
         FROM vehicles
         WHERE current_hub_id = ?
           AND status = 'AVAILABLE'
           AND model <> 'Customer Private EV'
         ORDER BY id
         LIMIT ?
         FOR UPDATE`,
      [sourceId, count]
    );

    const movedCount = movableVehicles.length;
    if (movedCount < count) throw createHttpError(409, 'Not enough available vehicles at source hub.');

    // 3. Get free destination slots.
    // Keep the same slot types as the mock API.
    let freeDestSlots = [];

    if (movedCount > 0) {
      [freeDestSlots] = await connection.execute(
        `SELECT id
           FROM parking_slots
           WHERE hub_id = ?
             AND slot_type IN ('SHARED_EV', 'UNIVERSAL')
             AND status = 'FREE'
           ORDER BY id
           LIMIT ?
           FOR UPDATE`,
        [destinationId, movedCount]
      );
    }

    if (freeDestSlots.length < movedCount) throw createHttpError(409, 'Destination hub lacks free parking capacity.');
    // 4. Vacate old vehicle slots.
    const oldSlotIds = [
      ...new Set(
        movableVehicles
          .map((vehicle) =>
            vehicle.parking_slot_id == null
              ? null
              : Number(vehicle.parking_slot_id)
          )
          .filter((id) => id !== null)
      ),
    ];

    if (oldSlotIds.length > 0) {
      await connection.execute(
        `UPDATE parking_slots
           SET status = 'FREE'
           WHERE id IN (${buildPlaceholders(oldSlotIds.length)})`,
        oldSlotIds
      );
    }

    // 5. Occupy destination slots and move vehicles.
    for (let i = 0; i < movableVehicles.length; i++) {
      const vehicle = movableVehicles[i];
      const targetSlot = freeDestSlots[i] || null;

      if (targetSlot) {
        await connection.execute(
          `UPDATE parking_slots
             SET status = 'OCCUPIED'
             WHERE id = ?`,
          [targetSlot.id]
        );
      }

      await connection.execute(
        `UPDATE vehicles
           SET current_hub_id = ?,
               parking_slot_id = ?
           WHERE id = ?`,
        [destinationId, targetSlot ? targetSlot.id : null, vehicle.id]
      );
    }

    // 6. Create completed dispatch order.
    const [result] = await connection.execute(
      `INSERT INTO dispatch_orders
          (order_code, operator_id, source_hub_id, destination_hub_id,
           vehicle_count, reason, status)
         VALUES (?, ?, ?, ?, ?, ?, 'COMPLETED')`,
      [
        orderCode,
        req.user.id,
        sourceId,
        destinationId,
        movedCount,
        reason,
      ]
    );

    await hubsService.syncHubStatus(connection, sourceId);
    if (destinationId !== sourceId) {
      await hubsService.syncHubStatus(connection, destinationId);
    }

    await connection.commit();
    transactionStarted = false;

    return res.status(201).json({
      success: true,
      data: {
        id: result.insertId,
        orderCode,
        movedCount,
        assignedStaff: staff,
        status: 'COMPLETED',
      },
    });
  } catch (err) {
    if (connection && transactionStarted) {
      await connection.rollback();
    }

    next(err);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}
);


// UC15: Staff manual charging priority override for Fleet Vehicles (persisted in MySQL)
router.patch('/operator/vehicles/:vehicleId/charging-priority', authenticateToken, requireRole('OPERATOR'), async (req, res, next) => {
  try {
    const vehicleId = parseId(req.params.vehicleId, 'vehicleId');
    const rawPriority = req.body?.priority;
    if (!['AUTO','LOW','NORMAL','HIGH','URGENT'].includes(rawPriority)) throw new AppError(400, 'VALIDATION_FAILED', 'Invalid priority.');
    const data = await withTransaction(async (c) => {
    const [vehicles] = await c.execute('SELECT * FROM vehicles WHERE id = ? LIMIT 1 FOR UPDATE', [vehicleId]);
    if (!vehicles.length) {
      throw new AppError(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found.');
    }
    const veh = vehicles[0];
    const autoPriority =
      veh.battery_level < 20
        ? 'URGENT'
        : veh.battery_level < 50
        ? 'HIGH'
        : veh.battery_level < 80
        ? 'NORMAL'
        : 'LOW';

    if (rawPriority === 'AUTO') {
      await c.execute('UPDATE charging_points SET priority_level = ? WHERE current_vehicle_id = ?', [
        autoPriority,
        vehicleId,
      ]);
      await c.execute(
        `UPDATE charging_requests SET status = 'CANCELLED' WHERE vehicle_id = ? AND request_code LIKE 'CHG-STAFF-%' AND status = 'QUEUED'`,
        [vehicleId]
      );
      await c.execute(
        `UPDATE charging_requests SET priority = ? WHERE vehicle_id = ? AND status IN ('QUEUED', 'SCHEDULED', 'CHARGING')`,
        [autoPriority, vehicleId]
      );
      return { vehicleId, priority: autoPriority, mode: 'AUTO' };
    }

    const effectivePriority = ['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(rawPriority)
      ? rawPriority
      : autoPriority;

    // 1. Update charging_points.priority_level if vehicle is plugged into a charger
    await c.execute('UPDATE charging_points SET priority_level = ? WHERE current_vehicle_id = ?', [
      effectivePriority,
      vehicleId,
    ]);

    // 2. Update or create an active row in charging_requests so MySQL persists Staff priority override
    const [existingReqs] = await c.execute(
      `SELECT id FROM charging_requests WHERE vehicle_id = ? AND status IN ('QUEUED', 'SCHEDULED', 'CHARGING') ORDER BY id DESC LIMIT 1`,
      [vehicleId]
    );
    if (existingReqs.length > 0) {
      await c.execute('UPDATE charging_requests SET priority = ? WHERE id = ?', [
        effectivePriority,
        existingReqs[0].id,
      ]);
    } else if (veh.current_hub_id && veh.status === 'AVAILABLE') {
      const reqCode = staffCode();
      await c.execute(
        `INSERT INTO charging_requests
          (request_code, user_id, ownership_type, vehicle_id, hub_id, current_battery_level, target_battery_level, priority, scheduled_start, scheduled_end, status)
         VALUES (?, ?, 'RENTAL', ?, ?, ?, 100, ?, NOW(), DATE_ADD(NOW(), INTERVAL 2 HOUR), ?)`,
        [
          reqCode,
          req.user.id,
          vehicleId,
          veh.current_hub_id,
          veh.battery_level,
          effectivePriority,
          veh.status === 'CHARGING' ? 'CHARGING' : 'QUEUED',
        ]
      );
    }

    return { vehicleId, priority: effectivePriority, mode: 'MANUAL' };
    });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
});

router.post('/operator/charging-priority/reset-all', authenticateToken, requireRole('OPERATOR'), async (_req, res, next) => {
  try {
    await withTransaction(async (c) => {
    await c.execute(`UPDATE charging_requests SET status = 'CANCELLED' WHERE request_code LIKE 'CHG-STAFF-%' AND status = 'QUEUED'`);
    await c.execute(`
      UPDATE charging_points cp
      LEFT JOIN vehicles v ON v.id = cp.current_vehicle_id
      SET cp.priority_level = CASE
        WHEN v.id IS NULL THEN 'NORMAL'
        WHEN v.battery_level < 20 THEN 'URGENT'
        WHEN v.battery_level < 50 THEN 'HIGH'
        WHEN v.battery_level < 80 THEN 'NORMAL'
        ELSE 'LOW'
      END
    `);
    await c.execute(`UPDATE charging_requests cr LEFT JOIN vehicles v ON v.id = cr.vehicle_id
      SET cr.priority = CASE WHEN COALESCE(v.battery_level, cr.current_battery_level) < 20 THEN 'URGENT'
        WHEN COALESCE(v.battery_level, cr.current_battery_level) < 50 THEN 'HIGH'
        WHEN COALESCE(v.battery_level, cr.current_battery_level) < 80 THEN 'NORMAL' ELSE 'LOW' END
      WHERE cr.status IN ('QUEUED','SCHEDULED','CHARGING')`);
    });
    return res.json({ success: true, data: { reset: true } });
  } catch (err) {
    return next(err);
  }
});

// UC15 / Task 4.1: Operator Manual Charging Dispatch Actions (Plug in, Unplug, Swap)
router.post('/operator/charging/plug-in', authenticateToken, requireRole('OPERATOR'), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const { vehicleId, chargerId } = req.body;
    const vId = parseId(vehicleId, 'vehicleId');

    await connection.beginTransaction();

    const [vehicles] = await connection.execute('SELECT * FROM vehicles WHERE id = ? FOR UPDATE', [vId]);
    if (!vehicles.length) {
      await connection.rollback();
      throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Vehicle not found.');
    }
    const vehicle = vehicles[0];
    await assertFleetChargeAvailable(connection, vehicle);

    let targetCharger = null;
    if (chargerId) {
      const [chargers] = await connection.execute(
        'SELECT * FROM charging_points WHERE id = ? FOR UPDATE',
        [parseId(chargerId, 'chargerId')]
      );
      if (!chargers.length) {
        await connection.rollback();
        throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Charging point not found.');
      }
      targetCharger = chargers[0];
      if (targetCharger.status !== 'AVAILABLE') {
        await connection.rollback();
        throw new AppError(409, 'CONFLICT', `Charger ${targetCharger.charger_code} is not available (${targetCharger.status}).`);
      }
      if (Number(targetCharger.hub_id) !== Number(vehicle.current_hub_id)) {
        await connection.rollback();
        throw new AppError(409, 'CONFLICT', 'Vehicle and charger are at different hubs.');
      }
    } else {
      const [chargers] = await connection.execute(
        'SELECT * FROM charging_points WHERE hub_id = ? AND status = "AVAILABLE" LIMIT 1 FOR UPDATE',
        [vehicle.current_hub_id]
      );
      if (!chargers.length) {
        await connection.rollback();
        throw new AppError(409, 'CONFLICT', 'No available charger at this hub.');
      }
      targetCharger = chargers[0];
    }

    await assertChargerWindowFree(connection, targetCharger.id, vId);
    assertTransition('chargingPoint', targetCharger.status, 'CHARGING');
    const autoPriority =
      vehicle.battery_level < 20 ? 'URGENT' : vehicle.battery_level < 50 ? 'HIGH' : vehicle.battery_level < 80 ? 'NORMAL' : 'LOW';

    // Update charger
    await connection.execute(
      'UPDATE charging_points SET status = "CHARGING", current_vehicle_id = ?, priority_level = ? WHERE id = ?',
      [vId, autoPriority, targetCharger.id]
    );

    // Update vehicle
    await connection.execute('UPDATE vehicles SET status = "CHARGING" WHERE id = ?', [vId]);

    // Update or create charging request
    const [reqs] = await connection.execute(
      'SELECT id FROM charging_requests WHERE vehicle_id = ? AND status IN ("QUEUED", "SCHEDULED") ORDER BY id DESC LIMIT 1',
      [vId]
    );
    if (reqs.length > 0) {
      await connection.execute(
        'UPDATE charging_requests SET status = "CHARGING", charging_point_id = ?, target_battery_level = 100 WHERE id = ?',
        [targetCharger.id, reqs[0].id]
      );
    } else {
      const reqCode = staffCode();
      await connection.execute(
        `INSERT INTO charging_requests
          (request_code, user_id, ownership_type, vehicle_id, hub_id, charging_point_id, current_battery_level, target_battery_level, priority, scheduled_start, scheduled_end, status)
         VALUES (?, ?, 'RENTAL', ?, ?, ?, ?, 100, ?, NOW(), DATE_ADD(NOW(), INTERVAL 2 HOUR), 'CHARGING')`,
        [reqCode, req.user.id, vId, vehicle.current_hub_id, targetCharger.id, vehicle.battery_level, autoPriority]
      );
    }

    await connection.commit();
    return res.json({
      success: true,
      data: {
        vehicleId: vId,
        chargerId: targetCharger.id,
        chargerCode: targetCharger.charger_code,
        status: 'CHARGING',
      },
    });
  } catch (err) {
    if (connection) await connection.rollback();
    return next(err);
  } finally {
    if (connection) connection.release();
  }
});

router.post('/operator/charging/unplug', authenticateToken, requireRole('OPERATOR'), async (req, res, next) => {
  try {
    const { vehicleId, chargerId, requestId } = req.body || {};
    const vid = vehicleId == null ? null : parseId(vehicleId, 'vehicleId');
    const cid = chargerId == null ? null : parseId(chargerId, 'chargerId');
    const rid = requestId == null ? null : parseId(requestId, 'requestId');
    if (!vid && !cid) throw new AppError(400, 'VALIDATION_FAILED', 'vehicleId or chargerId is required.');
    const data = await withTransaction(async (c) => {
      const [chargers] = await c.execute(cid ? 'SELECT * FROM charging_points WHERE id = ? FOR UPDATE' : 'SELECT * FROM charging_points WHERE current_vehicle_id = ? FOR UPDATE', [cid ?? vid]);
      if (!chargers.length) throw new AppError(404, 'CHARGING_POINT_NOT_FOUND', 'Charging point not found.');
      const charger = chargers[0];
      if (vid && charger.current_vehicle_id !== vid) throw new AppError(409, 'CHARGER_VEHICLE_MISMATCH', 'Vehicle is not assigned to this charger.');
      const target = charger.current_vehicle_id;
      if (target) {
        if (charger.status !== 'CHARGING') throw new AppError(409, 'INVALID_STATE_TRANSITION', 'Charger is not charging.');
        const [vehicles] = await c.execute('SELECT * FROM vehicles WHERE id = ? FOR UPDATE', [target]);
        if (!vehicles.length || vehicles[0].status !== 'CHARGING') throw new AppError(409, 'INVALID_STATE_TRANSITION', 'Vehicle is not charging.');
        assertTransition('vehicle', vehicles[0].status, 'AVAILABLE');
        await c.execute('UPDATE vehicles SET status = "AVAILABLE" WHERE id = ?', [target]);
        await c.execute('UPDATE charging_requests SET status = "COMPLETED" WHERE vehicle_id = ? AND charging_point_id = ? AND status = "CHARGING"', [target, charger.id]);
      } else {
        if (!rid) throw new AppError(400, 'VALIDATION_FAILED', 'requestId is required for a private EV.');
        const [requests] = await c.execute('SELECT * FROM charging_requests WHERE id = ? FOR UPDATE', [rid]);
        const request = requests[0];
        if (!request || request.charging_point_id !== charger.id || request.vehicle_id !== null || !['CHARGING','SCHEDULED'].includes(request.status)) throw new AppError(409, 'INVALID_STATE_TRANSITION', 'Private request is not assigned to this charger.');
        await c.execute('UPDATE charging_requests SET status = ? WHERE id = ?', [request.status === 'CHARGING' ? 'COMPLETED' : 'CANCELLED', rid]);
      }
      const [remaining] = await c.execute(`SELECT id FROM charging_requests WHERE charging_point_id = ? AND status IN ('SCHEDULED','CHARGING') AND scheduled_start <= DATE_ADD(NOW(), INTERVAL 2 HOUR) AND scheduled_end > NOW() LIMIT 1 FOR UPDATE`, [charger.id]);
      if (target || ['RESERVED','CHARGING'].includes(charger.status)) {
        await c.execute('UPDATE charging_points SET status = ?, current_vehicle_id = NULL, priority_level = "NORMAL" WHERE id = ?', [remaining.length ? 'RESERVED' : 'AVAILABLE', charger.id]);
      }
      return { unplugged: true, vehicleId: target, chargerId: charger.id };
    });
    return res.json({ success: true, data });
  } catch (err) { return next(err); }
});

router.post('/operator/charging/swap', authenticateToken, requireRole('OPERATOR'), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const { activeVehicleId, queueVehicleId } = req.body;
    const aId = parseId(activeVehicleId, 'activeVehicleId');
    const qId = parseId(queueVehicleId, 'queueVehicleId');

    if (aId === qId) {
      throw new AppError(400, 'VALIDATION_FAILED', 'The two vehicles must be different.');
    }

    await connection.beginTransaction();

    const [chargers] = await connection.execute('SELECT * FROM charging_points WHERE current_vehicle_id = ? FOR UPDATE', [aId]);
    if (!chargers.length) {
      await connection.rollback();
      throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Active vehicle is not plugged into any charger.');
    }
    const charger = chargers[0];

    const [qVehicles] = await connection.execute('SELECT * FROM vehicles WHERE id = ? FOR UPDATE', [qId]);
    if (!qVehicles.length) {
      await connection.rollback();
      throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Queue vehicle not found.');
    }
    const qVehicle = qVehicles[0];
    const [activeVehicles] = await connection.execute('SELECT * FROM vehicles WHERE id = ? FOR UPDATE', [aId]);
    if (charger.status !== 'CHARGING' || !activeVehicles.length || activeVehicles[0].status !== 'CHARGING') throw new AppError(409, 'INVALID_STATE_TRANSITION', 'Active vehicle is not charging.');
    await assertFleetChargeAvailable(connection, qVehicle);
    await assertChargerWindowFree(connection, charger.id, qId, aId);

    if (Number(qVehicle.current_hub_id) !== Number(charger.hub_id)) {
      await connection.rollback();
      throw new AppError(409, 'CONFLICT', 'Vehicles must be at the same hub to swap charger.');
    }

    // 1. Unplug active vehicle
    await connection.execute('UPDATE vehicles SET status = "AVAILABLE" WHERE id = ?', [aId]);
    await connection.execute('UPDATE charging_requests SET status = "COMPLETED" WHERE vehicle_id = ? AND status = "CHARGING"', [aId]);

    // 2. Plug in queue vehicle to same charger
    const autoPriority =
      qVehicle.battery_level < 20 ? 'URGENT' : qVehicle.battery_level < 50 ? 'HIGH' : qVehicle.battery_level < 80 ? 'NORMAL' : 'LOW';

    await connection.execute(
      'UPDATE charging_points SET status = "CHARGING", current_vehicle_id = ?, priority_level = ? WHERE id = ?',
      [qId, autoPriority, charger.id]
    );
    await connection.execute('UPDATE vehicles SET status = "CHARGING" WHERE id = ?', [qId]);

    // Update charging request
    const [reqs] = await connection.execute(
      'SELECT id FROM charging_requests WHERE vehicle_id = ? AND status IN ("QUEUED", "SCHEDULED") ORDER BY id DESC LIMIT 1',
      [qId]
    );
    if (reqs.length > 0) {
      await connection.execute(
        'UPDATE charging_requests SET status = "CHARGING", charging_point_id = ?, target_battery_level = 100 WHERE id = ?',
        [charger.id, reqs[0].id]
      );
    } else {
      const reqCode = staffCode();
      await connection.execute(
        `INSERT INTO charging_requests
          (request_code, user_id, ownership_type, vehicle_id, hub_id, charging_point_id, current_battery_level, target_battery_level, priority, scheduled_start, scheduled_end, status)
         VALUES (?, ?, 'RENTAL', ?, ?, ?, ?, 100, ?, NOW(), DATE_ADD(NOW(), INTERVAL 2 HOUR), 'CHARGING')`,
        [reqCode, req.user.id, qId, charger.hub_id, charger.id, qVehicle.battery_level, autoPriority]
      );
    }

    await connection.commit();
    return res.json({
      success: true,
      data: {
        swapped: true,
        chargerId: charger.id,
        chargerCode: charger.charger_code,
        unpluggedVehicleId: aId,
        pluggedVehicleId: qId,
      },
    });
  } catch (err) {
    if (connection) await connection.rollback();
    return next(err);
  } finally {
    if (connection) connection.release();
  }
});

// UC14: A3 IoT Sensor / Data Simulator Telemetry Ingestion (Task 3.1b - Owner: Nils)
router.post('/telemetry/ingest', async (req, res, next) => {
  try {
    const { simulatorKey, vehicleUpdates = [] } = req.body;
    if (process.env.SIMULATOR_API_KEY && simulatorKey !== process.env.SIMULATOR_API_KEY) {
      return res.status(401).json({ success: false, error: { code: 'INVALID_SIMULATOR_KEY', message: 'Invalid simulator key.' } });
    }
    if (!Array.isArray(vehicleUpdates) || vehicleUpdates.length > 1000) throw new AppError(400, 'VALIDATION_FAILED', 'vehicleUpdates must be an array of at most 1000 entries.');
    const updates = vehicleUpdates.map(item => {
      const code = optionalText(item?.vehicleCode, 'vehicleCode', 32);
      if (!code) throw new AppError(400, 'VALIDATION_FAILED', 'vehicleCode is required.');
      return { vehicleCode: code, batteryLevel: battery(item.batteryLevel) };
    });
    await withTransaction(async (c) => {
    for (const item of updates) {
      await c.execute(
        'UPDATE vehicles SET battery_level = ?, last_telemetry_at = NOW() WHERE code = ?',
        [item.batteryLevel, item.vehicleCode]
      );
    }
    });
    return res.json({ success: true, data: { updatedCount: updates.length } });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
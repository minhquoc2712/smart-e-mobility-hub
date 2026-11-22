/** Task 4.3b â€“ Atomic incident lifecycle and consistent resource state. */
const { randomUUID } = require('node:crypto');
const { withTransaction } = require('../../utils/transaction');
const { parseId } = require('../../utils/validators');
const { assertTransition } = require('../state/stateMachine');
const AppError = require('../../utils/appError');
const { syncHubStatus } = require('../hubs/hubs.service');

const TARGET = {
  VEHICLE: { table:'vehicles', id:'vehicle_id', input:'vehicleId', machine:'vehicle', off:'OUT_OF_SERVICE', restore:'AVAILABLE' },
  CHARGING_POINT: { table:'charging_points', id:'charging_point_id', input:'chargingPointId', machine:'chargingPoint', off:'OUT_OF_SERVICE', restore:'AVAILABLE' },
  PARKING_SLOT: { table:'parking_slots', id:'parking_slot_id', input:'parkingSlotId', machine:'parkingSlot', off:'OUT_OF_SERVICE', restore:'FREE' },
  HUB: { table:'hubs', id:'hub_id', input:'hubId', machine:'hub', off:'MAINTENANCE', restore:'ACTIVE' },
};
const conflict = (code, message) => { throw new AppError(409, code, message); };
async function existing(conn, table, id, code) {
  const [[row]] = await conn.execute(`SELECT * FROM ${table} WHERE id=? FOR UPDATE`, [id]);
  if (!row) throw new AppError(404, code, `${table} resource not found.`);
  return row;
}

async function reportIncident(user, body) {
  const hubId = parseId(body.hubId, 'hubId');
  const config = TARGET[body.targetType];
  if (!config) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid incident target type.');
  const targetId = parseId(body[config.input] ?? (body.targetType === 'HUB' ? hubId : undefined), config.input);
  return withTransaction(async (conn) => {
    const hub = await existing(conn, 'hubs', hubId, 'HUB_NOT_FOUND');
    if (hub.status === 'MAINTENANCE' && body.targetType !== 'HUB') {
      conflict('HUB_IN_MAINTENANCE', 'Cannot open a new resource incident at a Hub in maintenance.');
    }
    const resource = body.targetType === 'HUB' ? hub
      : await existing(conn, config.table, targetId, 'RESOURCE_NOT_FOUND');
    let belongsToHub = Number(resource.hub_id ?? resource.current_hub_id) === hubId;
    if (body.targetType === 'VEHICLE' && resource.current_hub_id == null) {
      // Vehicles on an active rental have no current_hub_id; their pickup Hub
      // remains the last accountable Hub for an in-transit incident.
      const [[activeRental]] = await conn.execute("SELECT COUNT(*) AS n FROM reservations WHERE vehicle_id=? AND hub_id=? AND status='ACTIVE'", [targetId,hubId]);
      belongsToHub = Number(activeRental.n) > 0;
    }
    if (body.targetType !== 'HUB' && !belongsToHub) {
      conflict('TARGET_HUB_MISMATCH', 'The affected resource does not belong to the selected Hub.');
    }
    assertTransition(config.machine, resource.status, config.off);
    // Use a collision-resistant reference that fits incidents.incident_code VARCHAR(40).
    const incidentCode = `INC-${randomUUID().replace(/-/g, '')}`;
    const ids = {
      vehicle: body.targetType === 'VEHICLE' ? targetId : null,
      charger: body.targetType === 'CHARGING_POINT' ? targetId : null,
      slot: body.targetType === 'PARKING_SLOT' ? targetId : null,
    };
    const [result] = await conn.execute(
      `INSERT INTO incidents (incident_code,reported_by,hub_id,target_type,vehicle_id,charging_point_id,parking_slot_id,severity,title,description)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [incidentCode, parseId(user.id, 'operatorId'), hubId, body.targetType,
        ids.vehicle, ids.charger, ids.slot, body.severity ?? 'MEDIUM', body.title.trim(), body.description.trim()]
    );
    // Invalidate conflicting future reservations atomically with resource outage.
    if (body.targetType === 'VEHICLE') {
      await conn.execute("UPDATE reservations SET status='CANCELLED' WHERE vehicle_id=? AND reservation_type='VEHICLE' AND status='CONFIRMED'", [targetId]);
      await conn.execute("UPDATE charging_requests SET status='FAILED' WHERE vehicle_id=? AND status IN ('QUEUED','SCHEDULED','CHARGING')", [targetId]);
      await conn.execute("UPDATE charging_points SET current_vehicle_id=NULL,status='AVAILABLE' WHERE current_vehicle_id=? AND status='CHARGING'", [targetId]);
    } else if (body.targetType === 'PARKING_SLOT') {
      await conn.execute("UPDATE reservations SET status='CANCELLED' WHERE parking_slot_id=? AND reservation_type='PARKING' AND status='CONFIRMED'", [targetId]);
    } else if (body.targetType === 'CHARGING_POINT') {
      const [[charging]] = await conn.execute('SELECT current_vehicle_id FROM charging_points WHERE id=?', [targetId]);
      await conn.execute("UPDATE charging_requests SET status='FAILED' WHERE charging_point_id=? AND status IN ('SCHEDULED','CHARGING')", [targetId]);
      if (charging?.current_vehicle_id) {
        await conn.execute("UPDATE vehicles SET status='AVAILABLE' WHERE id=? AND status='CHARGING'", [charging.current_vehicle_id]);
      }
      await conn.execute('UPDATE charging_points SET current_vehicle_id=NULL WHERE id=?', [targetId]);
    }
    await conn.execute(`UPDATE ${config.table} SET status=? WHERE id=?`, [config.off, targetId]);
    if (body.targetType === 'PARKING_SLOT') await syncHubStatus(conn,hubId);
    return { id: result.insertId, incidentCode, status:'OPEN', targetType:body.targetType };
  });
}

async function closeIncident(user, incidentId, body = {}) {
  const id = parseId(incidentId, 'incidentId');
  return withTransaction(async (conn) => {
    // Find owning Hub first to serialize with new incident creation on this hub.
    const [[meta]] = await conn.execute('SELECT hub_id FROM incidents WHERE id=?', [id]);
    if (!meta) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found.');
    await existing(conn, 'hubs', meta.hub_id, 'HUB_NOT_FOUND');
    const incident = await existing(conn, 'incidents', id, 'INCIDENT_NOT_FOUND');
    if (incident.status === 'CLOSED') conflict('INVALID_STATE_TRANSITION', 'Incident is already closed.');
    const config = TARGET[incident.target_type];
    if (!config) conflict('INVALID_STATE_TRANSITION', 'Unsupported incident target type.');
    const targetId = incident[config.id];
    if (!targetId) conflict('MISSING_INCIDENT_TARGET', 'Incident target no longer exists.');
    const resource = await existing(conn, config.table, targetId, 'RESOURCE_NOT_FOUND');
    // Multiple open incidents targeting the same resource: never restore it prematurely.
    const [[other]] = await conn.execute(
      `SELECT COUNT(*) AS n FROM incidents WHERE ${config.id}=? AND target_type=? AND id<>? AND status<>'CLOSED'`, [targetId, incident.target_type, id]
    );
    if (Number(other.n) === 0) {
      if (resource.status !== config.off) {
        conflict('INVALID_STATE_TRANSITION', 'Affected resource no longer has the incident state.');
      }
      if (incident.target_type === 'PARKING_SLOT') {
        const [[active]] = await conn.execute("SELECT COUNT(*) AS n FROM reservations WHERE parking_slot_id=? AND status='ACTIVE'", [targetId]);
        if (Number(active.n)) conflict('RESOURCE_IN_USE', 'Parking slot is occupied by an active reservation.');
      }
      if (incident.target_type === 'VEHICLE') {
        const [[active]] = await conn.execute("SELECT COUNT(*) AS n FROM reservations WHERE vehicle_id=? AND status='ACTIVE'", [targetId]);
        if (Number(active.n)) conflict('RESOURCE_IN_USE', 'Vehicle has an active rental; resolve it before restoring availability.');
      }
      assertTransition(config.machine, resource.status, config.restore);
      await conn.execute(`UPDATE ${config.table} SET status=? WHERE id=?`, [config.restore, targetId]);
      if (incident.target_type === 'PARKING_SLOT') await syncHubStatus(conn,incident.hub_id);
    }
    const notes = body.resolutionNotes ?? 'Repaired and verified.';
    if (typeof notes !== 'string' || notes.length > 5000) throw new AppError(400,'VALIDATION_ERROR','resolutionNotes must be a string (max 5000 characters).');
    await conn.execute("UPDATE incidents SET status='CLOSED',resolution_notes=?,closed_at=UTC_TIMESTAMP() WHERE id=?", [notes, id]);
    return { id, targetType:incident.target_type, status:'CLOSED', resolutionNotes:notes };
  });
}

module.exports = { reportIncident, closeIncident };
/** Task 4.3b: Atomic resource dispatch; never move more vehicles than free slots. */
const { randomUUID } = require('node:crypto');
const { withTransaction } = require('../../utils/transaction');
const { parseId } = require('../../utils/validators');
const AppError = require('../../utils/appError');
const { syncHubStatus } = require('../hubs/hubs.service');
const placeholders = ids => ids.map(() => '?').join(',');
function fail(code, message, status = 409) { throw new AppError(status, code, message); }

async function redistribute(user, body) {
  const sourceId = parseId(body.sourceHubId, 'sourceHubId');
  const destinationId = parseId(body.destinationHubId, 'destinationHubId');
  const explicit = Array.isArray(body.allocations) && body.allocations.length > 0;
  if (!explicit && sourceId === destinationId) fail('INVALID_DISPATCH', 'Count-only dispatch requires a different destination Hub.', 400);
  const count = explicit ? body.allocations.length : body.vehicleCount;
  if (!Number.isInteger(count) || count < 1 || count > 100) fail('VALIDATION_ERROR','vehicleCount must be 1-100.',400);
  const items = explicit ? body.allocations.map(a => ({
    vehicleId: parseId(a.vehicleId, 'vehicleId'),
    fromSlotId: a.fromSlotId == null ? null : parseId(a.fromSlotId, 'fromSlotId'),
    toSlotId: parseId(a.toSlotId, 'toSlotId'),
  })) : null;
  if (explicit) {
    if (new Set(items.map(a => a.vehicleId)).size !== count) fail('VALIDATION_ERROR', 'Duplicate vehicle allocation.', 400);
    if (new Set(items.map(a => a.toSlotId)).size !== count) fail('VALIDATION_ERROR', 'Duplicate destination slot.', 400);
  }
  return withTransaction(async conn => {
    const hubIds = [...new Set([sourceId,destinationId])].sort((a,b)=>a-b);
    const [hubs] = await conn.execute(`SELECT id,status FROM hubs WHERE id IN (${placeholders(hubIds)}) ORDER BY id FOR UPDATE`, hubIds);
    if (hubs.length !== hubIds.length) fail('HUB_NOT_FOUND','Source or destination Hub does not exist.',404);
    if (hubs.some(h => h.status === 'MAINTENANCE')) fail('HUB_IN_MAINTENANCE','Cannot dispatch into/out of a Hub under maintenance.');

    // Hub locks serialize any parallel dispatch into the same destination.
    let vehicles;
    if (explicit) {
      const ids = items.map(a=>a.vehicleId).sort((a,b)=>a-b);
      [vehicles] = await conn.execute(
        `SELECT id,current_hub_id,parking_slot_id,status FROM vehicles WHERE id IN (${placeholders(ids)}) ORDER BY id FOR UPDATE`,ids);
    } else {
      [vehicles] = await conn.execute(
        'SELECT id,current_hub_id,parking_slot_id,status FROM vehicles WHERE current_hub_id=? AND status=\'AVAILABLE\' ORDER BY id LIMIT ? FOR UPDATE',
        [sourceId,count]);
    }
    if (vehicles.length !== count) fail('INSUFFICIENT_VEHICLES','Not enough available vehicles at source Hub.');
    if (vehicles.some(v=>Number(v.current_hub_id)!==sourceId || v.status!=='AVAILABLE')) {
      fail('VEHICLE_NOT_AVAILABLE','A selected vehicle was moved or is no longer AVAILABLE.');
    }
    const vehicleMap = new Map(vehicles.map(v=>[Number(v.id),v]));
    const sourceSlotIds = [...new Set(vehicles.map(v=>Number(v.parking_slot_id)).filter(Boolean))];
    if (sourceSlotIds.length !== vehicles.filter(v=>v.parking_slot_id).length) {
      fail('RESOURCE_CONFLICT','Multiple vehicles refer to the same parking slot.');
    }
    let assigned;
    if (explicit) {
      assigned = items.map(a => {
        const v = vehicleMap.get(a.vehicleId);
        if (!v) fail('VEHICLE_NOT_FOUND',`Selected vehicle ${a.vehicleId} does not exist.`,404);
        if (a.fromSlotId !== null && a.fromSlotId !== (v.parking_slot_id == null ? null : Number(v.parking_slot_id))) {
          fail('RESOURCE_CONFLICT','A vehicle has changed its source parking slot.');
        }
        return {...a, oldSlotId:v.parking_slot_id == null ? null : Number(v.parking_slot_id)};
      });
    } else {
      const [available] = await conn.execute(
        "SELECT id FROM parking_slots WHERE hub_id=? AND slot_type IN ('SHARED_EV','UNIVERSAL') AND status='FREE' ORDER BY id FOR UPDATE",
        [destinationId]
      );
      // Exact capacity required: never relocate a vehicle with a NULL target slot.
      if (available.length < count) fail('HUB_PARKING_FULL','Not enough free destination parking slots.');
      assigned = vehicles.map((v,i)=>({vehicleId:Number(v.id),oldSlotId:v.parking_slot_id == null ? null : Number(v.parking_slot_id),toSlotId:Number(available[i].id)}));
    }
    const targetIds = assigned.map(a=>a.toSlotId);
    const allSlotIds = [...new Set([...sourceSlotIds,...targetIds])].sort((a,b)=>a-b);
    const [slots] = await conn.execute(`SELECT id,hub_id,slot_type,status FROM parking_slots WHERE id IN (${placeholders(allSlotIds)}) ORDER BY id FOR UPDATE`,allSlotIds);
    if (slots.length !== allSlotIds.length) fail('SLOT_NOT_FOUND','Source or target parking slot no longer exists.',404);
    const slotMap = new Map(slots.map(s=>[Number(s.id),s]));
    const vacated = new Set(sourceSlotIds);
    for (const slotId of sourceSlotIds) {
      const slot = slotMap.get(slotId);
      if (Number(slot.hub_id)!==sourceId || slot.status!=='OCCUPIED') fail('RESOURCE_CONFLICT','Source slot state changed.');
    }
    for (const slotId of targetIds) {
      const slot = slotMap.get(slotId);
      if (Number(slot.hub_id)!==destinationId) fail('TARGET_HUB_MISMATCH','Target slot is at another Hub.');
      if (!['SHARED_EV','UNIVERSAL'].includes(slot.slot_type)) fail('INCOMPATIBLE_SLOT','Target slot is not compatible with a fleet vehicle.');
      // Existing slot swap is allowed only if that occupant is part of this same dispatch.
      if (slot.status!=='FREE' && !(vacated.has(slotId) && slot.status==='OCCUPIED' && sourceId===destinationId)) {
        fail('HUB_PARKING_FULL','A target parking slot is occupied or reserved.');
      }
    }
    // Never overwrite a reservation on the proposed destination, even when its
    // materialized status is FREE (future bookings can exist for that slot).
    if (targetIds.length) {
      const [bookings] = await conn.execute(
        `SELECT parking_slot_id FROM reservations WHERE parking_slot_id IN (${placeholders(targetIds)}) AND reservation_type='PARKING'
         AND status IN ('CONFIRMED','ACTIVE') LIMIT 1`, targetIds);
      if (bookings.length) fail('PARKING_SLOT_RESERVED','A target slot has an active/future private reservation.');
    }
    if (sourceSlotIds.length) {
      await conn.execute(`UPDATE parking_slots SET status='FREE' WHERE id IN (${placeholders(sourceSlotIds)})`,sourceSlotIds);
    }
    // Phase B: reserve targets before updating vehicle location, in one transaction.
    await conn.execute(`UPDATE parking_slots SET status='OCCUPIED' WHERE id IN (${placeholders(targetIds)})`,targetIds);
    for (const a of assigned) {
      await conn.execute('UPDATE vehicles SET current_hub_id=?,parking_slot_id=? WHERE id=?',
        [destinationId,a.toSlotId,a.vehicleId]);
    }
    // Persist hub utilization consistently with the slot moves.
    await syncHubStatus(conn,sourceId);
    if(destinationId!==sourceId) await syncHubStatus(conn,destinationId);
    const orderCode = `DSP-${randomUUID().replace(/-/g,'')}`;
    const [result] = await conn.execute(
      "INSERT INTO dispatch_orders (order_code,operator_id,source_hub_id,destination_hub_id,vehicle_count,reason,status,completed_at) VALUES (?,?,?,?,?,?,'COMPLETED',UTC_TIMESTAMP())",
      [orderCode,parseId(user.id,'operatorId'),sourceId,destinationId,count,body.reason ?? 'Manual balancing']
    );
    return { id:result.insertId, orderCode,movedCount:count,assignedStaff:body.assignedStaff || null,
      allocations:assigned,status:'COMPLETED' };
  });
}
module.exports = { redistribute };
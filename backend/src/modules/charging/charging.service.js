const crypto = require('node:crypto');
const { pool } = require('../../config/db');
const { withTransaction } = require('../../utils/transaction');
const AppError = require('../../utils/appError');
const { requiredId, windowOf, battery } = require('../reservations/reservations.validation');

const fail = (status, code, msg) => { throw new AppError(status, code, msg); };
const ACTIVE = ['QUEUED','SCHEDULED','CHARGING'];
const priorityFor = n => n < 20 ? 'URGENT' : n < 50 ? 'HIGH' : n < 80 ? 'NORMAL' : 'LOW';

function compatible(point, label, requestedConnector) {
  // A universal AC point supports the demo's private EV connections. A dedicated e-bike
  // outlet is not assigned to a car/scooter; Type 2 is not assigned to an e-bike.
  if (requestedConnector === 'UNIVERSAL_AC') return point.connector_type === 'UNIVERSAL_AC';
  const bike = requestedConnector === 'E_BIKE_DC' || (!requestedConnector && /bike/i.test(label || ''));
  return point.connector_type === 'UNIVERSAL_AC' || point.connector_type === (bike ? 'E_BIKE_DC' : 'TYPE_2');
}

async function list(user) {
  const [rows] = await pool.execute(
    `SELECT cr.*, h.name AS hubName, v.code AS vehicleCode, cp.charger_code AS chargingPointCode
       FROM charging_requests cr
       LEFT JOIN hubs h ON h.id = cr.hub_id
       LEFT JOIN vehicles v ON v.id = cr.vehicle_id
       LEFT JOIN charging_points cp ON cp.id = cr.charging_point_id
       ${user.role === 'OPERATOR' ? '' : 'WHERE cr.user_id = ?'}
       ORDER BY cr.created_at DESC, cr.id DESC LIMIT 200`,
    user.role === 'OPERATOR' ? [] : [requiredId(user.id)]
  );
  return rows;
}
async function detail(user, id) {
  const [rows] = await pool.execute('SELECT * FROM charging_requests WHERE id = ?', [requiredId(id)]);
  if (!rows.length) fail(404, 'CHARGING_REQUEST_NOT_FOUND', 'Charging request not found.');
  if (user.role !== 'OPERATOR' && Number(rows[0].user_id) !== requiredId(user.id)) fail(403,'FORBIDDEN','Not your request.');
  return rows[0];
}

// Must be called while holding this HUB's row lock: serializes schedule/cancel and prevents
// two concurrent customers from both being assigned the last free point in the same interval.
async function findFreePoint(c, hubId, start, end, label, connector) {
  const [points] = await c.execute(
    `SELECT * FROM charging_points WHERE hub_id=? AND status <> 'OUT_OF_SERVICE'
      ORDER BY id FOR UPDATE`, [hubId]);
  for (const point of points) {
    if (!compatible(point, label, connector) || point.status === 'CHARGING') continue;
    const [conflicts] = await c.execute(
      `SELECT id FROM charging_requests
       WHERE charging_point_id=? AND status IN ('SCHEDULED','CHARGING')
         AND scheduled_start < ? AND scheduled_end > ? LIMIT 1`,
      [point.id, end, start]
    );
    if (!conflicts.length) return point;
  }
  return null;
}
async function syncPoint(c, pointId) {
  if (!pointId) return;
  const [[point]] = await c.execute('SELECT * FROM charging_points WHERE id=? FOR UPDATE', [pointId]);
  if (!point || point.status === 'OUT_OF_SERVICE' || point.status === 'CHARGING') return;
  const [active] = await c.execute(
    "SELECT id FROM charging_requests WHERE charging_point_id=? AND status='SCHEDULED' AND scheduled_end > UTC_TIMESTAMP() LIMIT 1",
    [pointId]
  );
  await c.execute('UPDATE charging_points SET status=? WHERE id=?', [active.length ? 'RESERVED' : 'AVAILABLE',pointId]);
}
async function promoteQueue(c, hubId) {
  const [waiting] = await c.execute(
    `SELECT * FROM charging_requests WHERE hub_id=? AND status='QUEUED' AND scheduled_end > UTC_TIMESTAMP()
     ORDER BY created_at, id FOR UPDATE`,[hubId]);
  for(const req of waiting) {
    // The untouched schema stores connector_type on charging_points, not charging_requests.
    // For queued private EVs, derive the compatible outlet from the saved vehicle label.
    // See TASK_3_2B_README.md for this schema-level limitation.
    const point=await findFreePoint(c,hubId,req.scheduled_start,req.scheduled_end,req.private_vehicle_label,null);
    if (!point) continue;
    await c.execute("UPDATE charging_requests SET charging_point_id=?,status='SCHEDULED' WHERE id=?",[point.id,req.id]);
    await syncPoint(c,point.id);
  }
}
async function schedule(user, body) {
  const uid = requiredId(user.id), hubId=requiredId(body.hubId,'hubId');
  const ownershipType=body.ownershipType || 'PRIVATE';
  if (!['PRIVATE','RENTAL'].includes(ownershipType)) fail(400,'VALIDATION_FAILED','Invalid ownership type.');
  const current=battery(body.currentBatteryLevel ?? body.batteryAtRequest ?? 35);
  const target=battery(body.targetBatteryLevel ?? body.targetBattery ?? 85);
  if(target<=current) fail(422,'TARGET_BATTERY_INVALID','Target must exceed current battery.');
  const {start,end}=windowOf(body.scheduledStart ?? body.earliestStart,body.scheduledEnd ?? body.neededBy);
  const label=String(body.privateVehicleLabel || '').trim();
  if (ownershipType === 'PRIVATE' && (!label || label.length > 100)) fail(400,'VALIDATION_FAILED','Private vehicle name is required (max 100 characters).');
  if (body.chargingPointId != null) fail(400,'AUTO_ASSIGNMENT_ONLY','The server automatically chooses the charging point.');
  const connector=body.connectorType || null;
  if(connector && !['E_BIKE_DC','TYPE_2','UNIVERSAL_AC'].includes(connector)) fail(400,'VALIDATION_FAILED','Unsupported connector.');
  return withTransaction(async c=>{
    const [[hub]] = await c.execute('SELECT id,status FROM hubs WHERE id=? FOR UPDATE',[hubId]);
    if(!hub) fail(404,'HUB_NOT_FOUND','Hub not found.');
    if(hub.status==='MAINTENANCE') fail(409,'HUB_CLOSED','Hub under maintenance.');
    if(ownershipType==='PRIVATE') {
      const [duplicates]=await c.execute(`SELECT id FROM charging_requests WHERE user_id=?
        AND ownership_type='PRIVATE' AND private_vehicle_label=? AND status IN ('QUEUED','SCHEDULED','CHARGING')
        AND scheduled_start < ? AND scheduled_end > ? LIMIT 1`,[uid,label,end,start]);
      if(duplicates.length) fail(409,'DUPLICATE_CHARGING_BOOKING','This vehicle already has a charging request in that period.');
    }
    const [installed]=await c.execute("SELECT connector_type FROM charging_points WHERE hub_id=? AND status<>'OUT_OF_SERVICE'",[hubId]);
    if(!installed.some(p=>compatible(p,label,connector))) fail(409,'NO_COMPATIBLE_CHARGER','No operational compatible charging point at this hub.');
    const point=await findFreePoint(c,hubId,start,end,label,connector);
    const status=point?'SCHEDULED':'QUEUED';
    const [[count]] = await c.execute("SELECT COUNT(*) AS n FROM charging_requests WHERE hub_id=? AND status='QUEUED'",[hubId]);
    const requestCode=`CHG-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
    const priority=priorityFor(current);
    const [result]=await c.execute(
      `INSERT INTO charging_requests (request_code,user_id,ownership_type,vehicle_id,private_vehicle_label,hub_id,
        charging_point_id,current_battery_level,target_battery_level,priority,scheduled_start,scheduled_end,queue_position,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [requestCode,uid,ownershipType,body.vehicleId || null,label || null,hubId,point?.id || null,current,target,priority,start,end,status==='QUEUED'?Number(count.n)+1:1,status]
    );
    if(point) await syncPoint(c,point.id);
    return {id:result.insertId,requestCode,status,priority,chargingPointId:point?.id || null,chargingPointCode:point?.charger_code || null,queuePosition:status==='QUEUED'?Number(count.n)+1:null,
      scheduledStart:new Date(body.scheduledStart ?? body.earliestStart).toISOString(),scheduledEnd:new Date(body.scheduledEnd ?? body.neededBy).toISOString()};
  });
}
async function cancelRequest(user,id) {
 const requestId=requiredId(id,'requestId');
 return withTransaction(async c=>{
  const [[identity]]=await c.execute('SELECT hub_id FROM charging_requests WHERE id=?',[requestId]);
  if(!identity) fail(404,'CHARGING_REQUEST_NOT_FOUND','Charging request not found.');
  await c.execute('SELECT id FROM hubs WHERE id=? FOR UPDATE',[identity.hub_id]);
  const [[record]]=await c.execute('SELECT * FROM charging_requests WHERE id=? FOR UPDATE',[requestId]);
  if(user.role!=='OPERATOR' && Number(record.user_id)!==requiredId(user.id)) fail(403,'FORBIDDEN','Not your charging request.');
  if(!['SCHEDULED','QUEUED'].includes(record.status)) fail(409,'INVALID_STATE_TRANSITION','Only queued/scheduled charging can be cancelled.');
  await c.execute("UPDATE charging_requests SET status='CANCELLED' WHERE id=?",[requestId]);
  await syncPoint(c,record.charging_point_id);
  await promoteQueue(c,identity.hub_id);
  return {id:requestId,status:'CANCELLED'};
 });
}

async function startCharging(user,id) {
 if(user.role!=='OPERATOR') fail(403,'FORBIDDEN','Operator access required.');
 const reqId=requiredId(id,'requestId');
 return withTransaction(async c=>{
  const [[meta]]=await c.execute('SELECT hub_id FROM charging_requests WHERE id=?',[reqId]);
  if(!meta) fail(404,'CHARGING_REQUEST_NOT_FOUND','Request not found.');
  await c.execute('SELECT id FROM hubs WHERE id=? FOR UPDATE',[meta.hub_id]);
  const [[row]]=await c.execute('SELECT * FROM charging_requests WHERE id=? FOR UPDATE',[reqId]);
  if(row.status!=='SCHEDULED' || !row.charging_point_id) fail(409,'INVALID_STATE_TRANSITION','Only assigned scheduled requests can start.');
  const [[cp]]=await c.execute('SELECT * FROM charging_points WHERE id=? FOR UPDATE',[row.charging_point_id]);
  if(!cp || cp.status==='OUT_OF_SERVICE' || cp.status==='CHARGING') fail(409,'CHARGER_NOT_AVAILABLE','Charging point is unavailable.');
  // A scheduled reservation cannot be started if its date has already passed.
  if(Date.now()<new Date(row.scheduled_start).getTime()) fail(409,'TOO_EARLY','Charging cannot start before its scheduled time.');
  if(Date.now()>new Date(row.scheduled_end).getTime()) fail(409,'SCHEDULE_EXPIRED','Charging window already ended.');
  const [busy]=await c.execute("SELECT id FROM charging_requests WHERE charging_point_id=? AND status='CHARGING' AND id<>? LIMIT 1",[cp.id,reqId]);
  if(busy.length) fail(409,'CHARGER_NOT_AVAILABLE','Another vehicle is charging.');
  await c.execute("UPDATE charging_requests SET status='CHARGING' WHERE id=?",[reqId]);
  await c.execute("UPDATE charging_points SET status='CHARGING', current_vehicle_id=? WHERE id=?",[row.vehicle_id || null,cp.id]);
  if(row.vehicle_id) await c.execute("UPDATE vehicles SET status='CHARGING' WHERE id=?",[row.vehicle_id]);
  return {id:reqId,status:'CHARGING',chargingPointId:cp.id};
 });
}
async function stopCharging(user,id) {
 if(user.role!=='OPERATOR') fail(403,'FORBIDDEN','Operator access required.');
 const reqId=requiredId(id,'requestId');
 return withTransaction(async c=>{
  const [[meta]]=await c.execute('SELECT hub_id FROM charging_requests WHERE id=?',[reqId]);
  if(!meta) fail(404,'CHARGING_REQUEST_NOT_FOUND','Request not found.');
  await c.execute('SELECT id FROM hubs WHERE id=? FOR UPDATE',[meta.hub_id]);
  const [[row]]=await c.execute('SELECT * FROM charging_requests WHERE id=? FOR UPDATE',[reqId]);
  if(row.status!=='CHARGING') fail(409,'INVALID_STATE_TRANSITION','Request is not charging.');
  await c.execute("UPDATE charging_requests SET status='COMPLETED' WHERE id=?",[reqId]);
  if(row.charging_point_id) {
    await c.execute("UPDATE charging_points SET status='AVAILABLE',current_vehicle_id=NULL WHERE id=?",[row.charging_point_id]);
    await syncPoint(c,row.charging_point_id);
  }
  if(row.vehicle_id) await c.execute("UPDATE vehicles SET status='AVAILABLE' WHERE id=? AND status='CHARGING'",[row.vehicle_id]);
  await promoteQueue(c,row.hub_id);
  return {id:reqId,status:'COMPLETED'};
 });
}
// The course/demo assumes customers collect their vehicles at the end of the booked
// charging period. A periodic job releases ended sessions and expires no-shows.
async function expireChargingWindows() {
 const [expired]=await pool.execute(`SELECT id,hub_id FROM charging_requests
  WHERE status IN ('SCHEDULED','QUEUED','CHARGING') AND scheduled_end <= UTC_TIMESTAMP()
  ORDER BY scheduled_end,id LIMIT 100`);
 let processed=0;
 for(const item of expired) {
  try {
   await withTransaction(async c=>{
    await c.execute('SELECT id FROM hubs WHERE id=? FOR UPDATE',[item.hub_id]);
    const [[row]]=await c.execute('SELECT * FROM charging_requests WHERE id=? FOR UPDATE',[item.id]);
    if(!row || !ACTIVE.includes(row.status) || new Date(row.scheduled_end).getTime()>Date.now()) return;
    const wasCharging=row.status==='CHARGING';
    await c.execute('UPDATE charging_requests SET status=? WHERE id=?',[wasCharging?'COMPLETED':'FAILED',row.id]);
    if(wasCharging && row.charging_point_id) {
     await c.execute("UPDATE charging_points SET status='AVAILABLE',current_vehicle_id=NULL WHERE id=? AND status='CHARGING'",[row.charging_point_id]);
     if(row.vehicle_id) await c.execute("UPDATE vehicles SET status='AVAILABLE' WHERE id=? AND status='CHARGING'",[row.vehicle_id]);
    }
    await syncPoint(c,row.charging_point_id);
    await promoteQueue(c,row.hub_id);
    processed++;
   });
  } catch(err) {console.error('[Charging expiry]',item.id,err.message);}
 }
 return processed;
}
module.exports={list,detail,schedule,cancelRequest,startCharging,stopCharging,compatible,priorityFor,expireChargingWindows};
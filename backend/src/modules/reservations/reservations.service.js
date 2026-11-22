const {pool} = require('../../config/db');
const {withTransaction} = require('../../utils/transaction');
const AppError = require('../../utils/appError');
const {MIN_BATTERY_TO_RESERVE} = require('../../config/businessRules');
const {assertTransition} = require('../state/stateMachine');
const {syncHubStatus} = require('../hubs/hubs.service');
const {requiredId,windowOf,mysqlDate,battery} = require('./reservations.validation');
const crypto=require('node:crypto');
const fail=(status,code,message)=>{throw new AppError(status,code,message)};
// VARCHAR(40) in database/schema.sql: RES-V-/RES-P- (6) + UUID without hyphens (32) = 38.
const code=(prefix)=>`${prefix}-${crypto.randomUUID().replace(/-/g, '')}`;
const isOperator=(user)=>user.role==='OPERATOR';
const userId=(user)=>requiredId(user.id,'authenticated user id');
// The ORIGINAL schema has no reservations.license_plate column. A private parking
// booking may use the existing, otherwise-unused return_condition_note field.
// Keep the API field license_plate/LicensePlate stable without any ALTER TABLE.
const PARKING_PLATE_PREFIX = 'PARKING_PLATE:';
function normalizeParkingReservation(row) {
 if (!row || row.reservation_type !== 'PARKING') return row;
 const fallback = typeof row.return_condition_note === 'string' && row.return_condition_note.startsWith(PARKING_PLATE_PREFIX)
  ? row.return_condition_note.slice(PARKING_PLATE_PREFIX.length) : null;
 const plate = row.license_plate || fallback || null;
 return {...row, license_plate:plate, licensePlate:plate};
}

async function selectOne(c,sql,params=[],err='RESOURCE_NOT_FOUND'){
 const [rows]=await c.execute(sql,params); if(!rows.length)fail(404,err,'Resource not found.'); return rows[0];
}
async function authorizedReservation(c,id,user,lock=true){
 const row=await selectOne(c,`SELECT * FROM reservations WHERE id = ? ${lock?'FOR UPDATE':''}`,[requiredId(id,'reservationId')],'RESERVATION_NOT_FOUND');
 if(!isOperator(user)&&row.user_id!==userId(user))fail(403,'FORBIDDEN','This reservation belongs to another user.');
 return row;
}
async function liveHub(c,id){
 const hub=await selectOne(c,'SELECT * FROM hubs WHERE id=? FOR UPDATE',[requiredId(id,'hubId')],'HUB_NOT_FOUND');
 if(hub.status==='MAINTENANCE')fail(409,'HUB_CLOSED','Hub is under maintenance.'); // FULL is a snapshot; time-window availability is checked per slot
 return hub;
}
async function detail(user,id){
 const r=await authorizedReservation(pool,id,user,false);
 return {...normalizeParkingReservation(r), holdExpiresAt:r.reservation_type==='VEHICLE'&&r.status==='CONFIRMED'?new Date(new Date(r.start_time).getTime()+15*60000).toISOString():null};
}
async function list(user,query={}){
 const params=[],conditions=[];
 if(!isOperator(user)){conditions.push('r.user_id=?');params.push(userId(user));}
 if(query.status){conditions.push('r.status=?');params.push(query.status);}
 if(query.hubId){conditions.push('r.hub_id=?');params.push(requiredId(query.hubId,'hubId'));}
 const [rows]=await pool.execute(`SELECT r.*,h.name AS hubName,v.code AS vehicleCode,p.slot_code AS parkingSlotCode
 FROM reservations r JOIN hubs h ON h.id=r.hub_id LEFT JOIN vehicles v ON v.id=r.vehicle_id
 LEFT JOIN parking_slots p ON p.id=r.parking_slot_id ${conditions.length?'WHERE '+conditions.join(' AND '):''}
 ORDER BY r.created_at DESC LIMIT 100`,params);
 return rows.map(normalizeParkingReservation);
}
async function reserveVehicle(user,body){
 const uid=userId(user), vid=requiredId(body.vehicleId,'vehicleId');
 return withTransaction(async c=>{
  // Serialize reservations by user before checking a vehicle. Locking only the
  // vehicle would allow simultaneous bookings of DIFFERENT vehicles by one user.
  const [[owner]]=await c.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[uid]);
  if(!owner)fail(401,'UNAUTHORIZED','Authenticated user does not exist.');
  // A vehicle row lock prevents two different users booking the SAME vehicle.
  const v=await selectOne(c,'SELECT * FROM vehicles WHERE id=? FOR UPDATE',[vid],'VEHICLE_NOT_FOUND');
  if(v.status!=='AVAILABLE')fail(409,'VEHICLE_NOT_AVAILABLE','Vehicle is not available.');
  if(v.battery_level<MIN_BATTERY_TO_RESERVE)fail(409,'BATTERY_TOO_LOW','Battery is too low.');
  if(!v.current_hub_id)fail(409,'VEHICLE_NOT_AT_HUB','Vehicle is not located at a Hub.');
  await liveHub(c,v.current_hub_id);
  if(body.hubId!=null && requiredId(body.hubId,'hubId')!==Number(v.current_hub_id))fail(422,'WRONG_PICKUP_HUB','Vehicle is at a different hub.');
  const [existing]=await c.execute(`SELECT id, vehicle_id, status FROM reservations WHERE user_id=? AND reservation_type='VEHICLE' AND status IN ('CONFIRMED','ACTIVE') FOR UPDATE`,[uid]);
  for (const prev of existing) {
    if (prev.status === 'ACTIVE') {
      fail(409,'ACTIVE_RESERVATION_EXISTS','User already has an active rental. Please return it first.');
    }
    await c.execute("UPDATE reservations SET status='CANCELLED' WHERE id=?",[prev.id]);
    if (prev.vehicle_id && Number(prev.vehicle_id) !== Number(vid)) {
      const [previousVehicle]=await c.execute('SELECT status FROM vehicles WHERE id=? FOR UPDATE',[prev.vehicle_id]);
      if(previousVehicle.length && previousVehicle[0].status==='RESERVED') {
        await c.execute("UPDATE vehicles SET status='AVAILABLE' WHERE id=? AND status='RESERVED'",[prev.vehicle_id]);
      }
    }
  }
  // Requested rental times are separate from the 15-minute reservation HOLD.
  // Keep the chosen pickup/return window for confirmation and history.
  const {start,end}=windowOf(body.startTime,body.endTime,{minMinutes:30,maxMinutes:720});
  const holdExpiresAt=new Date(new Date(body.startTime).getTime()+15*60000);

  assertTransition('vehicle',v.status,'RESERVED');
  await c.execute("UPDATE vehicles SET status='RESERVED' WHERE id=?",[vid]);
  const [rackRows]=v.parking_slot_id ? await c.execute('SELECT slot_code FROM parking_slots WHERE id=?',[v.parking_slot_id]) : [[]];
  const reservationCode=code('RES-V');
  const [result]=await c.execute(`INSERT INTO reservations (reservation_code,user_id,reservation_type,hub_id,vehicle_id,parking_slot_id,start_time,end_time,status)
  VALUES (?,?,'VEHICLE',?,?,?,?,?,'CONFIRMED')`,[reservationCode,uid,v.current_hub_id,vid,v.parking_slot_id,start,end]);
  return {id:result.insertId,reservationCode,status:'CONFIRMED',holdExpiresAt:holdExpiresAt.toISOString(),vehicleId:vid,parkingSlotCode:rackRows[0]?.slot_code || null,startTime:new Date(body.startTime).toISOString(),endTime:new Date(body.endTime).toISOString()};
 });
}
async function reserveParking(user,body){
 const uid=userId(user),hubId=requiredId(body.hubId,'hubId');
 const {start,end}=windowOf(body.startTime,body.endTime);
 return withTransaction(async c=>{
  await liveHub(c,hubId); // hub lock serializes competing interval allocations
  const [slots]=await c.execute(`SELECT s.* FROM parking_slots s WHERE s.hub_id=? AND s.slot_type IN ('PRIVATE_EV','UNIVERSAL')
   AND s.status NOT IN ('OUT_OF_SERVICE','OCCUPIED') AND (?='PRIVATE_EV' OR s.slot_type='UNIVERSAL') AND NOT EXISTS (
    SELECT 1 FROM reservations r WHERE r.parking_slot_id=s.id AND r.reservation_type='PARKING'
      AND r.status IN ('CONFIRMED','ACTIVE') AND r.start_time < ? AND r.end_time > ?)
   ORDER BY s.id FOR UPDATE`,[hubId,body.slotType||'PRIVATE_EV',end,start]);
  const slot=slots.find(s=>s.status==='FREE'||s.status==='RESERVED');
  if(!slot)fail(409,'HUB_PARKING_FULL','No compatible parking slot available in requested window.');
  const plate=body.licensePlate == null ? null : String(body.licensePlate).trim();
  if(plate && (plate.length>30 || !/^[\p{L}\p{N} .-]+$/u.test(plate)))
   fail(400,'VALIDATION_FAILED','License plate must have at most 30 letters/numbers, spaces, dots or dashes.');
  const reservationCode=code('RES-P');
  if(slot.status==='FREE'){
    assertTransition('parkingSlot',slot.status,'RESERVED');
    await c.execute("UPDATE parking_slots SET status='RESERVED' WHERE id=?",[slot.id]);
  }
  // Preserve the entered plate in the already-existing nullable field.
  // Parking requests never use vehicle-return condition notes.
  const plateNote = plate ? `${PARKING_PLATE_PREFIX}${plate}` : null;
  const [result]=await c.execute(`INSERT INTO reservations (reservation_code,user_id,reservation_type,hub_id,parking_slot_id,start_time,end_time,return_condition_note,status)
  VALUES (?,?,'PARKING',?,?,?,?,?,'CONFIRMED')`,[reservationCode,uid,hubId,slot.id,start,end,plateNote]);
  await syncHubStatus(c,hubId);
  return {id:result.insertId,reservationCode,parkingSlotId:slot.id,slotCode:slot.slot_code,parkingSlotCode:slot.slot_code,licensePlate:plate,startTime:new Date(body.startTime).toISOString(),endTime:new Date(body.endTime).toISOString(),status:'CONFIRMED'};
 });
}
async function cancel(user,id){
 return withTransaction(async c=>{
  const r=await authorizedReservation(c,id,user);
  if(r.status!=='CONFIRMED')fail(409,'INVALID_STATE_TRANSITION','Only confirmed reservations can be cancelled.');
  await c.execute("UPDATE reservations SET status='CANCELLED' WHERE id=?",[r.id]);
  if(r.reservation_type==='VEHICLE'&&r.vehicle_id){
   const v=await selectOne(c,'SELECT * FROM vehicles WHERE id=? FOR UPDATE',[r.vehicle_id]);
   assertTransition('vehicle',v.status,'AVAILABLE');
   await c.execute("UPDATE vehicles SET status='AVAILABLE' WHERE id=?",[v.id]);
  }
  if(r.reservation_type==='PARKING'&&r.parking_slot_id){
   const [others]=await c.execute(`SELECT id FROM reservations WHERE parking_slot_id=? AND id<>? AND status IN ('CONFIRMED','ACTIVE') LIMIT 1`,[r.parking_slot_id,r.id]);
   const slot=await selectOne(c,'SELECT * FROM parking_slots WHERE id=? FOR UPDATE',[r.parking_slot_id]);
   if(!others.length&&slot.status==='RESERVED')await c.execute("UPDATE parking_slots SET status='FREE' WHERE id=?",[slot.id]);
   await syncHubStatus(c,r.hub_id);
  }
  return {id:r.id,status:'CANCELLED'};
 });
}
async function pickup(user,id,body={}){
 return withTransaction(async c=>{
  const r=await authorizedReservation(c,id,user);
  if(r.reservation_type!=='VEHICLE'||r.status!=='CONFIRMED')fail(409,'INVALID_STATE_TRANSITION','Reservation is not ready for pickup.');
  const pickupAt=new Date(r.start_time).getTime();
  if(Date.now()<pickupAt-15*60000)fail(409,'PICKUP_TOO_EARLY','Pickup opens 15 minutes before the scheduled start.');
  if(Date.now()>pickupAt+15*60000)fail(409,'RESERVATION_EXPIRED','Pickup grace period expired.');
  const v=await selectOne(c,'SELECT * FROM vehicles WHERE id=? FOR UPDATE',[r.vehicle_id]);
  if(body.hubId!=null&&requiredId(body.hubId,'hubId')!==v.current_hub_id)fail(422,'WRONG_PICKUP_HUB','Vehicle is at another hub.');
  if(v.current_hub_id!==r.hub_id)fail(409,'WRONG_PICKUP_HUB','Vehicle moved from reservation hub.');
  assertTransition('vehicle',v.status,'IN_USE');
  if(v.parking_slot_id){
   const slot=await selectOne(c,'SELECT * FROM parking_slots WHERE id=? FOR UPDATE',[v.parking_slot_id]);
   if(slot.status==='OCCUPIED'){
    assertTransition('parkingSlot',slot.status,'FREE');
    await c.execute("UPDATE parking_slots SET status='FREE' WHERE id=?",[slot.id]);
   }
  }
  await c.execute("UPDATE vehicles SET status='IN_USE', current_hub_id=NULL, parking_slot_id=NULL WHERE id=?",[v.id]);
  await c.execute("UPDATE reservations SET status='ACTIVE',actual_pickup_time=UTC_TIMESTAMP() WHERE id=?",[r.id]);
  await syncHubStatus(c,r.hub_id);
  return {id:r.id,vehicleId:v.id,status:'ACTIVE'};
 });
}
async function returnVehicle(user,id,body={}){
 const hubId=requiredId(body.hubId??body.returnHubId,'hubId');
 return withTransaction(async c=>{
  const r=await authorizedReservation(c,id,user);
  if(r.reservation_type!=='VEHICLE'||r.status!=='ACTIVE')fail(409,'INVALID_STATE_TRANSITION','No active rental for this reservation.');
  await liveHub(c,hubId);
  const v=await selectOne(c,'SELECT * FROM vehicles WHERE id=? FOR UPDATE',[r.vehicle_id]);
  // After a breakdown mid-rental, the rider can still return the vehicle,
  // but only maintenance/incident closure may restore AVAILABLE.
  const isDamaged = v.status==='OUT_OF_SERVICE';
  if(!isDamaged) assertTransition('vehicle',v.status,'AVAILABLE');
  const [slots]=await c.execute(`SELECT * FROM parking_slots s WHERE s.hub_id=? AND s.slot_type IN ('SHARED_EV','UNIVERSAL') AND s.status='FREE'
    AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.parking_slot_id=s.id AND r.reservation_type='PARKING'
      AND r.status IN ('CONFIRMED','ACTIVE')) ORDER BY s.id FOR UPDATE`,[hubId]);
  if(!slots.length)fail(409,'HUB_PARKING_FULL','No free rental-vehicle parking slot.');
  const slot=slots[0];
  const requestedLevel=body.remainingBattery ?? body.batteryLevel;
  const level=requestedLevel===undefined?v.battery_level:battery(requestedLevel);
  assertTransition('parkingSlot',slot.status,'OCCUPIED');
  await c.execute("UPDATE parking_slots SET status='OCCUPIED' WHERE id=?",[slot.id]);
  await c.execute('UPDATE vehicles SET status=?,current_hub_id=?,parking_slot_id=?,battery_level=? WHERE id=?',[isDamaged?'OUT_OF_SERVICE':'AVAILABLE',hubId,slot.id,level,v.id]);
  await c.execute("UPDATE reservations SET status='COMPLETED',actual_return_time=UTC_TIMESTAMP(),return_hub_id=?,return_condition_note=? WHERE id=?",
    [hubId,body.conditionNote ?? body.returnConditionNote ?? (level<MIN_BATTERY_TO_RESERVE?'LOW_BATTERY_REQUIRES_CHARGING':null),r.id]);
  await syncHubStatus(c,hubId);
  return {id:r.id,status:'COMPLETED',returnHubId:hubId,parkingSlotId:slot.id,batteryLevel:level,needsCharging:!isDamaged&&level<MIN_BATTERY_TO_RESERVE,needsRepair:isDamaged};
 });
}
async function parkingCheckIn(user,id){
 return withTransaction(async c=>{
  const r=await authorizedReservation(c,id,user);
  if(r.reservation_type!=='PARKING'||r.status!=='CONFIRMED')fail(409,'INVALID_STATE_TRANSITION','Reservation cannot be checked in.');
  // The application stores UTC instants in a timezone-less MySQL DATETIME.
  // Comparing a mysql2 Date object against Date.now() would interpret the
  // DATETIME using the connection's local timezone (e.g. Asia/Ho_Chi_Minh).
  const [windowRows]=await c.execute(
   'SELECT TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), start_time) AS seconds_until_start FROM reservations WHERE id=?',
   [r.id]
  );
  const secondsUntilStart=Number(windowRows[0].seconds_until_start);
  if(!Number.isFinite(secondsUntilStart)||Math.abs(secondsUntilStart)>15*60)
   fail(409,'CHECK_IN_WINDOW_CLOSED','Check-in allowed within 15 minutes of start.');
  const s=await selectOne(c,'SELECT * FROM parking_slots WHERE id=? FOR UPDATE',[r.parking_slot_id]);
  if(!['FREE','RESERVED'].includes(s.status))fail(409,'SLOT_UNAVAILABLE','Slot is occupied.');
  assertTransition('parkingSlot',s.status,'OCCUPIED');
  await c.execute("UPDATE parking_slots SET status='OCCUPIED' WHERE id=?",[s.id]);
  await c.execute("UPDATE reservations SET status='ACTIVE',actual_pickup_time=UTC_TIMESTAMP() WHERE id=?",[r.id]);
  await syncHubStatus(c,r.hub_id);
  return {id:r.id,status:'ACTIVE',parkingSlotId:s.id};
 });
}
async function parkingCheckOut(user,id){
 return withTransaction(async c=>{
  const r=await authorizedReservation(c,id,user);
  if(r.reservation_type!=='PARKING'||r.status!=='ACTIVE')fail(409,'INVALID_STATE_TRANSITION','Parking booking is not checked in.');
  const [charging]=await c.execute(`SELECT id FROM charging_requests WHERE user_id=? AND hub_id=? AND status='CHARGING' LIMIT 1`,[r.user_id,r.hub_id]);
  if(charging.length)fail(409,'CHARGING_IN_PROGRESS','Stop charging before parking checkout.');
  const s=await selectOne(c,'SELECT * FROM parking_slots WHERE id=? FOR UPDATE',[r.parking_slot_id]);
  // If the slot was marked OUT_OF_SERVICE while occupied, checkout must
  // finish the reservation without overriding the incident state.
  if(s.status!=='OUT_OF_SERVICE'){
   assertTransition('parkingSlot',s.status,'FREE');
   await c.execute("UPDATE parking_slots SET status='FREE' WHERE id=?",[s.id]);
  }
  await c.execute("UPDATE reservations SET status='COMPLETED',actual_return_time=UTC_TIMESTAMP() WHERE id=?",[r.id]);
  await syncHubStatus(c,r.hub_id);
  return {id:r.id,status:'COMPLETED'};
 });
}
async function expireVehicleHolds(){
 const [rows]=await pool.execute(`SELECT id,user_id FROM reservations WHERE reservation_type='VEHICLE' AND status='CONFIRMED'
 AND start_time < DATE_SUB(UTC_TIMESTAMP(),INTERVAL 15 MINUTE) ORDER BY id LIMIT 100`);
 let expired=0;
 for(const row of rows){
  try {await withTransaction(async c=>{
   const r=await authorizedReservation(c,row.id,{id:row.user_id,role:'USER'});
   if(r.status!=='CONFIRMED'||Date.now()<new Date(r.start_time).getTime()+15*60000)return;
   const v=await selectOne(c,'SELECT * FROM vehicles WHERE id=? FOR UPDATE',[r.vehicle_id]);
   if(v.status==='RESERVED')await c.execute("UPDATE vehicles SET status='AVAILABLE' WHERE id=?",[v.id]);
   await c.execute("UPDATE reservations SET status='EXPIRED' WHERE id=?",[r.id]); expired++;
  });}catch(err){console.error('[Reservation expiry]',row.id,err.message);}
 }
 return expired;
}
module.exports={detail,list,reserveVehicle,reserveParking,cancel,pickup,returnVehicle,parkingCheckIn,parkingCheckOut,expireVehicleHolds,normalizeParkingReservation};
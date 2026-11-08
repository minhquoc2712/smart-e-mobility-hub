const crypto=require('node:crypto');
const {pool}=require('../../config/db');
const {withTransaction}=require('../../utils/transaction');
const AppError=require('../../utils/appError');
const {requiredId,windowOf,battery}=require('../reservations/reservations.validation');
const error=(status,code,message)=>{throw new AppError(status,code,message)};
async function list(user){
 const [rows]=user.role==='OPERATOR'?await pool.execute('SELECT * FROM charging_requests ORDER BY created_at DESC LIMIT 100'):
 await pool.execute('SELECT * FROM charging_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 100',[requiredId(user.id)]);
 return rows;
}
async function detail(user,id){
 const [rows]=await pool.execute('SELECT * FROM charging_requests WHERE id=?',[requiredId(id)]);
 if(!rows.length)error(404,'CHARGING_REQUEST_NOT_FOUND','Request not found.');
 if(user.role!=='OPERATOR'&&rows[0].user_id!==requiredId(user.id))error(403,'FORBIDDEN','Not your request.');
 return rows[0];
}
async function schedule(user,body){
 const uid=requiredId(user.id),hubId=requiredId(body.hubId,'hubId');
 const ownershipType=body.ownershipType||'PRIVATE';
 if(ownershipType!=='PRIVATE')error(422,'NOT_PRIVATE_VEHICLE','Private scheduling must use PRIVATE ownership.');
 const current=battery(body.currentBatteryLevel??body.batteryAtRequest),target=battery(body.targetBatteryLevel??body.targetBattery);
 if(target<=current)error(422,'TARGET_BATTERY_INVALID','Target must exceed current battery.');
 const {start,end}=windowOf(body.scheduledStart??body.earliestStart,body.scheduledEnd??body.neededBy);
 return withTransaction(async c=>{
  // Task 3.2b diagnostic: identify which statement fails without changing DB schema.
  async function checkedExecute(step, sql, params) {
   try { return await c.execute(sql, params); }
   catch (err) {
    console.error(`[Charging schedule] Failed at ${step}:`, {
     code: err.code, errno: err.errno, sqlState: err.sqlState,
     sqlMessage: err.sqlMessage || err.message,
     parameterTypes: params?.map(v => v === null ? 'null' : typeof v)
    });
    throw err;
   }
  }
  const [users]=await checkedExecute('user lookup', 'SELECT private_vehicle_plate,private_vehicle_model FROM users WHERE id=? FOR UPDATE',[uid]);
  if(!users.length)error(404,'USER_NOT_FOUND','User not found.');
  if(!users[0].private_vehicle_plate)error(403,'PRIVATE_VEHICLE_NOT_REGISTERED','Add your private vehicle plate in profile first.');
  const [hubs]=await checkedExecute('hub lookup', 'SELECT id,status FROM hubs WHERE id=? FOR UPDATE',[hubId]);
  if(!hubs.length)error(404,'HUB_NOT_FOUND','Hub not found.');
  if(['MAINTENANCE','FULL'].includes(hubs[0].status))error(409,'HUB_CLOSED','Hub unavailable.');
  const [parking]=await checkedExecute('parking coverage query', `SELECT id FROM reservations WHERE user_id=? AND hub_id=? AND reservation_type='PARKING'
   AND status IN ('CONFIRMED','ACTIVE') AND start_time<=? AND end_time>=? LIMIT 1`,[uid,hubId,start,end]);
  if(!parking.length)error(409,'PARKING_RESERVATION_REQUIRED','Reserve parking for the charging period first.');
  const [points]=await checkedExecute('charging point availability query', `SELECT cp.* FROM charging_points cp WHERE cp.hub_id=? AND cp.status <> 'OUT_OF_SERVICE'
   AND NOT EXISTS (SELECT 1 FROM charging_requests cr WHERE cr.charging_point_id=cp.id
     AND cr.status IN ('SCHEDULED','CHARGING') AND cr.scheduled_start < ? AND cr.scheduled_end > ?)
   ORDER BY cp.id FOR UPDATE`,[hubId,end,start]);
  const point=points.find(p=>p.status==='AVAILABLE');
  if(!point)error(409,'NO_CHARGING_POINT_AVAILABLE','No charging point available for that interval.');
  const requestCode=`CHG-${crypto.randomUUID()}`;
  const [result]=await checkedExecute('charging request insert', `INSERT INTO charging_requests
   (request_code,user_id,ownership_type,vehicle_id,private_vehicle_label,hub_id,charging_point_id,
   current_battery_level,target_battery_level,scheduled_start,scheduled_end,status)
   VALUES (?,?,'PRIVATE',NULL,?,?,?,?,?,? ,?,'SCHEDULED')`,
   [requestCode,uid,users[0].private_vehicle_plate,hubId,point.id,current,target,start,end]);
  if(new Date(start).getTime()<=Date.now()+60000&&point.status==='AVAILABLE')
   await checkedExecute('charging point status update', "UPDATE charging_points SET status='RESERVED' WHERE id=?",[point.id]);
  return {id:result.insertId,requestCode,status:'SCHEDULED',chargingPointId:point.id};
 });
}
module.exports={list,detail,schedule};
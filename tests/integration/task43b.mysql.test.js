/**
 * OPTIONAL real-InnoDB Task 4.3b concurrency checks.
 * Requires seeded schema and a disposable test database; creates and cleans up
 * uniquely named fixtures. Run ONLY with RUN_DB_INTEGRATION=1.
 *
 * From repository root:
 *   cd backend && npm ci && cd ..
 *   RUN_DB_INTEGRATION=1 node --test tests/integration/task43b.mysql.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {resolve} = require('node:path');

const enabled = process.env.RUN_DB_INTEGRATION === '1';
if (enabled) require('../../backend/node_modules/dotenv').config({path:resolve(__dirname,'../../backend/.env')});
const {pool} = enabled ? require('../../backend/src/config/db') : {pool:null};
const reservations = enabled ? require('../../backend/src/modules/reservations/reservations.service') : null;
const dispatch = enabled ? require('../../backend/src/modules/operator/dispatch.service') : null;

function futureHours(hours) {return new Date(Date.now()+hours*3600000).toISOString();}
async function fixture({users=2,vehicles=1,sourceSlots=1,destinationSlots=0,privateSlots=0}={}) {
  const suffix = randomUUID().slice(0,8);
  const state = {users:[],hubs:[],vehicles:[],parking:[]};
  const add = async(sql,args)=>{const [result]=await pool.execute(sql,args);return result.insertId;};
  async function newHub(label) {
    const id=await add(`INSERT INTO hubs (code,name,campus_zone,address,latitude,longitude,status)
      VALUES (?,?,'Task43b Test Zone','Temporary DB fixture',10.5,106.5,'ACTIVE')`,[`IT-${label}-${suffix}`,`Test ${label} ${suffix}`]);
    state.hubs.push(id);return id;
  }
  async function newSlot(hubId,kind,index) {
    const id=await add('INSERT INTO parking_slots (hub_id,slot_code,slot_type,status) VALUES (?,?,?,?)',
      [hubId,`IT-${suffix}-${index}`,kind,kind==='SHARED_EV'?'OCCUPIED':'FREE']);
    state.parking.push(id);return id;
  }
  try {
    const src=await newHub('SRC');
    const dst=destinationSlots?await newHub('DST'):null;
    for(let i=0;i<users;i++) {
      state.users.push(await add("INSERT INTO users (email,full_name,role) VALUES (?,?,'USER')",[`it-${suffix}-${i}@example.test`, `IT User ${i}`]));
    }
    const oldSlots=[];
    for(let i=0;i<sourceSlots;i++)oldSlots.push(await newSlot(src,'SHARED_EV',i));
    for(let i=0;i<privateSlots;i++)await newSlot(src,'PRIVATE_EV',100+i);
    for(let i=0;i<destinationSlots;i++)await newSlot(dst,'UNIVERSAL',200+i);
    for(let i=0;i<vehicles;i++) {
      const id=await add(`INSERT INTO vehicles (code,type,model,current_hub_id,parking_slot_id,battery_level,status)
        VALUES (?,'ELECTRIC_BIKE','Task 4.3b Fixture',?, ?,80,'AVAILABLE')`, [`IT-EV-${suffix}-${i}`,src,oldSlots[i]||null]);
      state.vehicles.push(id);
    }
    return {...state,src,dst};
  } catch(err) { await clean(state);throw err; }
}
async function clean(state) {
  const hubs=state.hubs||[],users=state.users||[];
  if(hubs.length) {
    const q=hubs.map(()=>'?').join(',');
    await pool.execute(`DELETE FROM charging_requests WHERE hub_id IN (${q})`,hubs);
    await pool.execute(`DELETE FROM reservations WHERE hub_id IN (${q})`,hubs);
    await pool.execute(`DELETE FROM incidents WHERE hub_id IN (${q})`,hubs);
    await pool.execute(`DELETE FROM dispatch_orders WHERE source_hub_id IN (${q}) OR destination_hub_id IN (${q})`,[...hubs,...hubs]);
  }
  for (const id of state.vehicles||[]) await pool.execute('DELETE FROM vehicles WHERE id=?',[id]);
  for (const id of state.parking||[]) await pool.execute('DELETE FROM parking_slots WHERE id=?',[id]);
  for (const id of hubs) await pool.execute('DELETE FROM hubs WHERE id=?',[id]);
  for (const id of users) await pool.execute('DELETE FROM users WHERE id=?',[id]);
}

// These tests assert actual InnoDB locking, NOT simulated JS mocks.
test('MySQL: two users simultaneously booking one vehicle -> exactly one success', {skip:!enabled}, async()=>{
  const fx=await fixture({users:2,vehicles:1,sourceSlots:1});
  try {
    const payload={hubId:fx.src,vehicleId:fx.vehicles[0],startTime:futureHours(1),endTime:futureHours(2)};
    const attempts=await Promise.allSettled(fx.users.map(id=>reservations.reserveVehicle({id,role:'USER'},payload)));
    assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
    assert.ok(attempts.some(x=>x.status==='rejected' && x.reason.statusCode===409));
    const [[row]]=await pool.execute("SELECT COUNT(*) AS n FROM reservations WHERE vehicle_id=? AND status='CONFIRMED'",[fx.vehicles[0]]);
    assert.equal(Number(row.n),1);
  } finally {await clean(fx);}
});

test('MySQL: same user concurrent different-vehicle bookings -> one confirmed reservation', {skip:!enabled}, async()=>{
  const fx=await fixture({users:1,vehicles:2,sourceSlots:2});
  try {
    const payload={hubId:fx.src,startTime:futureHours(1),endTime:futureHours(2)};
    const attempts=await Promise.allSettled(fx.vehicles.map(vehicleId=>reservations.reserveVehicle({id:fx.users[0],role:'USER'},{...payload,vehicleId})));
    assert.equal(attempts.filter(x=>x.status==='fulfilled').length,2);
    const [[row]]=await pool.execute("SELECT COUNT(*) AS n FROM reservations WHERE user_id=? AND status='CONFIRMED' AND reservation_type='VEHICLE'",[fx.users[0]]);
    assert.equal(Number(row.n),1);
    const [rows]=await pool.execute('SELECT status FROM vehicles WHERE id IN (?,?)',fx.vehicles);
    assert.deepEqual(rows.map(v=>v.status).sort(),['AVAILABLE','RESERVED']);
  } finally {await clean(fx);}
});

test('MySQL: one parking slot, concurrent overlapping requests -> one success', {skip:!enabled}, async()=>{
  const fx=await fixture({users:2,vehicles:0,sourceSlots:0,privateSlots:1});
  try {
    const body={hubId:fx.src,startTime:futureHours(1),endTime:futureHours(2),slotType:'PRIVATE_EV'};
    const attempts=await Promise.allSettled(fx.users.map(id=>reservations.reserveParking({id,role:'USER'},body)));
    assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
    const [[row]]=await pool.execute("SELECT COUNT(*) AS n FROM reservations WHERE hub_id=? AND status='CONFIRMED' AND reservation_type='PARKING'",[fx.src]);
    assert.equal(Number(row.n),1);
  } finally {await clean(fx);}
});

test('MySQL: insufficient dispatch destination capacity -> rollback with no vehicle moved', {skip:!enabled}, async()=>{
  const fx=await fixture({users:1,vehicles:2,sourceSlots:2,destinationSlots:1});
  try {
    await assert.rejects(dispatch.redistribute({id:fx.users[0],role:'OPERATOR'},{sourceHubId:fx.src,destinationHubId:fx.dst,vehicleCount:2}),
      err=>err.statusCode===409 && err.code==='HUB_PARKING_FULL');
    const [rows]=await pool.execute('SELECT current_hub_id FROM vehicles WHERE id IN (?,?)',fx.vehicles);
    assert.ok(rows.every(v=>Number(v.current_hub_id)===fx.src));
  } finally {await clean(fx);}
});
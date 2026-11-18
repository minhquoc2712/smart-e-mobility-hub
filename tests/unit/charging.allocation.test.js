
/** Deterministic service-level tests using a small in-memory SQL adapter.
 * Real MySQL locking must ALSO be exercised using docs/TASK_3_2B_TEST_GUIDE.md.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../../backend/src/config/db');
const charging = require('../../backend/src/modules/charging/charging.service');

// mysqlDate() persists UTC DATETIME values as `YYYY-MM-DD HH:mm:ss`.
// Node interprets that format in the host's LOCAL timezone, so the fake adapter
// must explicitly parse it as UTC to match mysql2's timezone: 'Z' configuration.
function utcMillis(value) {
  if (value instanceof Date) return value.getTime();
  const iso = String(value).trim().replace(' ', 'T');
  return new Date(/(?:Z|[+-]\d\d:\d\d)$/i.test(iso) ? iso : `${iso}Z`).getTime();
}

function dbWithPoints() {
  const state = {
    points: [
      {id:1,hub_id:1,connector_type:'E_BIKE_DC',charger_code:'BK-C01',status:'AVAILABLE'},
      {id:2,hub_id:1,connector_type:'UNIVERSAL_AC',charger_code:'BK-C02',status:'AVAILABLE'},
    ], requests: [], nextId:1,
  };
  const run = async (statement, args=[]) => {
    const q = statement.replace(/\s+/g,' ').trim();
    if(q.startsWith('SELECT id,status FROM hubs')) return [[{id:1,status:'ACTIVE'}]];
    if(q.startsWith('SELECT id FROM hubs')) return [[{id:1}]];
    if(q.startsWith('SELECT hub_id FROM charging_requests')) return [state.requests.filter(r=>r.id===args[0]).map(r=>({hub_id:r.hub_id}))];
    if(q.startsWith('SELECT * FROM charging_requests WHERE id=')) return [state.requests.filter(r=>r.id===args[0])];
    if(q.includes('FROM charging_requests WHERE user_id=')) return [[]];
    if(q.startsWith('SELECT * FROM charging_requests WHERE hub_id=')) return [state.requests.filter(r=>r.hub_id===args[0] && r.status==='QUEUED' && utcMillis(r.scheduled_end)>Date.now())];
    if(q.startsWith('SELECT connector_type FROM charging_points WHERE hub_id=')) return [state.points.filter(p=>p.hub_id===args[0] && p.status!=='OUT_OF_SERVICE').map(p=>({connector_type:p.connector_type}))];
    if(q.startsWith('SELECT * FROM charging_points WHERE hub_id=')) return [state.points.filter(p=>p.hub_id===args[0] && p.status!=='OUT_OF_SERVICE')];
    if(q.startsWith('SELECT * FROM charging_points WHERE id=')) return [state.points.filter(p=>p.id===args[0])];
    if(q.includes('SELECT id FROM charging_requests') && q.includes("status IN ('SCHEDULED','CHARGING')")) return [state.requests.filter(r=> r.charging_point_id===args[0] && ['SCHEDULED','CHARGING'].includes(r.status) && utcMillis(r.scheduled_start)<utcMillis(args[1]) && utcMillis(r.scheduled_end)>utcMillis(args[2])).map(r=>({id:r.id})).slice(0,1)];
    if(q.includes('SELECT id FROM charging_requests') && q.includes("status='SCHEDULED'")) return [state.requests.filter(r=>r.charging_point_id===args[0] && r.status==='SCHEDULED' && utcMillis(r.scheduled_end)>Date.now()).map(r=>({id:r.id})).slice(0,1)];
    if(q.startsWith('SELECT COUNT(*) AS n FROM charging_requests')) return [[{n:state.requests.filter(r=>r.hub_id===args[0] && r.status==='QUEUED').length}]];
    if(q.startsWith('INSERT INTO charging_requests')) {
      if (/charging_point_id,connector_type/.test(q)) throw new Error('Request INSERT must not require an extra connector_type column.');
      const [request_code,user_id,ownership_type,vehicle_id,private_vehicle_label,hub_id,charging_point_id,current_battery_level,target_battery_level,priority,scheduled_start,scheduled_end,queue_position,status]=args;
      const id=state.nextId++;
      state.requests.push({id,request_code,user_id,ownership_type,vehicle_id,private_vehicle_label,hub_id,charging_point_id,current_battery_level,target_battery_level,priority,scheduled_start,scheduled_end,queue_position,status});
      return [{insertId:id}];
    }
    if(q.startsWith('UPDATE charging_points SET status=?')) { const p=state.points.find(p=>p.id===args[1]);p.status=args[0];return [{affectedRows:1}]; }
    if(q.startsWith("UPDATE charging_requests SET status='CANCELLED'")) { state.requests.find(r=>r.id===args[0]).status='CANCELLED';return [{affectedRows:1}]; }
    if(q.startsWith("UPDATE charging_requests SET charging_point_id=?")) {const r=state.requests.find(r=>r.id===args[1]);r.charging_point_id=args[0];r.status='SCHEDULED';return [{affectedRows:1}];}
    throw new Error('SQL not supported by unit fake: '+q);
  };
  const connection={execute:run,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{}};
  return {state,connection};
}
function period(hoursFromNow=1) {
  const start=new Date(Date.now()+hoursFromNow*3600_000);
  const end=new Date(start.getTime()+3600_000);
  return {scheduledStart:start.toISOString(),scheduledEnd:end.toISOString()};
}
function payload(window,uid) { return {hubId:1,ownershipType:'PRIVATE',privateVehicleLabel:`Bike ${uid}`,currentBatteryLevel:30,targetBatteryLevel:90,connectorType:'E_BIKE_DC',...window}; }

test('auto allocation excludes overlapping bookings; queues overflow and promotes on cancellation', async()=>{
  const original=pool.getConnection;
  const {state,connection}=dbWithPoints(); pool.getConnection=async()=>connection;
  try {
    const window=period(), first=await charging.schedule({id:1,role:'USER'},payload(window,'A'));
    const second=await charging.schedule({id:2,role:'USER'},payload(window,'B'));
    const third=await charging.schedule({id:3,role:'USER'},payload(window,'C'));
    assert.equal(first.chargingPointCode,'BK-C01');assert.equal(second.chargingPointCode,'BK-C02');
    assert.equal(third.status,'QUEUED');assert.equal(third.chargingPointId,null);
    const cancelled=await charging.cancelRequest({id:1,role:'USER'},first.id);
    assert.equal(cancelled.status,'CANCELLED');
    assert.equal(state.requests.find(r=>r.id===first.id).status,'CANCELLED');
    assert.equal(state.requests.find(r=>r.id===third.id).status,'SCHEDULED');
    assert.equal(state.requests.find(r=>r.id===third.id).charging_point_id,1);
    await assert.rejects(charging.cancelRequest({id:1,role:'USER'},first.id),err=>err.code==='INVALID_STATE_TRANSITION');
  } finally { pool.getConnection=original; }
});

test('non-overlapping times can use the same charger; private bookings cannot pick a point manually',async()=>{
  const original=pool.getConnection;const {connection}=dbWithPoints();pool.getConnection=async()=>connection;
  try {
    const a=await charging.schedule({id:1,role:'USER'},payload(period(1),'A'));
    const b=await charging.schedule({id:2,role:'USER'},payload(period(3),'B'));
    assert.equal(a.chargingPointId,b.chargingPointId);
    await assert.rejects(charging.schedule({id:3,role:'USER'},{...payload(period(1),'C'),chargingPointId:1}),e=>e.code==='AUTO_ASSIGNMENT_ONLY');
  } finally {pool.getConnection=original;}
});

test('compatibility and battery priority',()=>{
  assert.equal(charging.priorityFor(15),'URGENT');assert.equal(charging.priorityFor(24),'HIGH');
  assert.equal(charging.priorityFor(50),'NORMAL');assert.equal(charging.priorityFor(90),'LOW');
  assert.equal(charging.compatible({connector_type:'E_BIKE_DC'},'My scooter','TYPE_2'),false);
  assert.equal(charging.compatible({connector_type:'UNIVERSAL_AC'},'My scooter','TYPE_2'),true);
});

test('SQL DATETIME values are interpreted as UTC regardless of local TZ', () => {
  assert.equal(utcMillis('2026-11-17 08:00:00'), Date.parse('2026-11-17T08:00:00Z'));
  assert.equal(utcMillis('2026-11-17T08:00:00Z'), Date.parse('2026-11-17T08:00:00Z'));
  assert.equal(utcMillis('2026-11-17T15:00:00+07:00'), Date.parse('2026-11-17T08:00:00Z'));
});

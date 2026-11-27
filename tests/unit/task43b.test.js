const test = require('node:test');
const assert = require('node:assert/strict');
const { requiredId, battery, dateTime, windowOf } = require('../../backend/src/modules/reservations/reservations.validation');
const { normalizeError } = require('../../backend/src/middlewares/error.middleware');
const AppError = require('../../backend/src/utils/appError');

// Stub only the DB connection and hub synchronization; run the actual service.
// This verifies the SQL call ordering/guards, not real InnoDB lock semantics.
const base = '../../backend/src/';
let execute;
let transactionCalls = 0;
const connection = { execute: (...args) => execute(...args) };
function stub(path, exports) { require.cache[require.resolve(base + path)] = { exports }; }
stub('config/db', { pool: connection });
stub('utils/transaction', { withTransaction: async work => { transactionCalls++; return work(connection); } });
stub('modules/hubs/hubs.service', { syncHubStatus: async () => 'ACTIVE' });
const reservations = require(base + 'modules/reservations/reservations.service');
const charging = require(base + 'modules/charging/charging.service');
const user = { id: 1, role: 'USER' };
const range = () => ({ startTime: new Date(Date.now()+60000).toISOString(), endTime: new Date(Date.now()+3600000).toISOString() });
const errorCode = code => err => err.code === code;

test('IDs and battery reject boolean, empty strings, null, fractional and unsafe values', () => {
  for (const bad of [true, false, '', ' ', null, [], {}, 1.5, Infinity]) {
    assert.throws(() => requiredId(bad, 'id'));
    assert.throws(() => battery(bad));
  }
  assert.throws(() => requiredId(Number.MAX_SAFE_INTEGER+1));
  assert.equal(battery(0), 0); assert.equal(battery(100), 100);
});
test('invalid dates and reverse windows are rejected', () => {
  for (const bad of ['2026-02-30T10:00','2026-11-24T24:00','not-date']) assert.throws(() => dateTime(bad, 'startTime'));
  const {startTime,endTime} = range();
  assert.throws(() => windowOf(endTime,startTime), errorCode('INVALID_TIME_WINDOW'));
});
test('error mapping returns 409 for lock/deadlock, hides internal SQL, preserves business codes', () => {
  assert.equal(normalizeError({code:'ER_LOCK_DEADLOCK'}).status,409);
  assert.equal(normalizeError({code:'ER_DUP_ENTRY'}).status,409);
  assert.equal(normalizeError({type:'entity.parse.failed'}).status,400);
  assert.equal(normalizeError(new AppError(409,'USER_HAS_ACTIVE_RENTAL','existing')).code,'USER_HAS_ACTIVE_RENTAL');
  assert.equal(normalizeError(new Error('secret query')).message,'An unexpected server error occurred.');
});
for (const status of ['PENDING','CONFIRMED','ACTIVE']) test(`existing ${status} rental blocks any other vehicle before writes`, async () => {
  const calls=[];
  execute = async (sql,params) => {
    calls.push(sql);
    if (sql.includes('FROM users')) { assert.match(sql,/FOR UPDATE/); assert.deepEqual(params,[1]); return [[{id:1}]]; }
    if (sql.includes('FROM reservations')) { assert.match(sql,/PENDING.*CONFIRMED.*ACTIVE/); assert.match(sql,/FOR UPDATE/); return [[{id:99,status}]]; }
    assert.fail('Unexpected read/write after conflict');
  };
  await assert.rejects(reservations.reserveVehicle(user,{vehicleId:2,...range()}),errorCode('USER_HAS_ACTIVE_RENTAL'));
  assert.equal(calls.length,2);
});
test('valid reservation locks user then checks same vehicle overlap and inserts PENDING', async () => {
  const calls=[];
  execute=async (sql,params)=>{
    calls.push(sql);
    if(sql.includes('FROM users')) return [[{id:1}]];
    if(sql.includes('FROM reservations')) return [[]];
    if(sql.includes('FROM vehicles')) return [[{id:2,status:'AVAILABLE',battery_level:80,current_hub_id:1}]];
    if(sql.includes('FROM hubs')) return [[{id:1,status:'ACTIVE'}]];
    if(sql.includes('UPDATE vehicles')) return [{affectedRows:1}];
    if(sql.includes('INSERT INTO reservations')) {assert.equal(params[1],1);assert.equal(params[6],'PENDING');return [{insertId:42}];}
    assert.fail(sql);
  };
  const result=await reservations.reserveVehicle(user,{vehicleId:2,hubId:1,...range()});
  assert.equal(result.status,'PENDING');assert.equal(result.id,42);
  assert.match(calls[0],/users.*FOR UPDATE/);assert.match(calls[1],/user_id/);
  assert.match(calls[4],/start_time < \?/); assert.match(calls[4],/end_time > \?/);
});
test('operator approves PENDING reservation into CONFIRMED and pickup requires approval', async () => {
  const operator = { id: 9, role: 'OPERATOR' };
  execute = async (sql) => {
    if (sql.includes('SELECT * FROM reservations')) return [[{ id: 42, user_id: 1, reservation_type: 'VEHICLE', status: 'PENDING' }]];
    if (sql.includes('UPDATE reservations SET status = \'CONFIRMED\'')) return [{ affectedRows: 1 }];
    assert.fail(sql);
  };
  const approved = await reservations.approve(operator, 42);
  assert.equal(approved.status, 'CONFIRMED');

  execute = async (sql) => {
    if (sql.includes('FROM users')) return [[{ id: 1 }]];
    if (sql.includes('SELECT * FROM reservations')) return [[{ id: 42, user_id: 1, reservation_type: 'VEHICLE', status: 'PENDING' }]];
    if (sql.includes('FROM reservations WHERE user_id')) return [[]];
    assert.fail(sql);
  };
  await assert.rejects(reservations.pickup(user, 42), errorCode('AWAITING_OPERATOR_APPROVAL'));
});
test('other user overlapping same vehicle is blocked before insert',async()=>{
  execute=async sql=>{
    if(sql.includes('FROM users'))return [[{id:1}]];
    if(sql.includes('FROM reservations'))return [sql.includes('vehicle_id = ?')?[{id:77}]:[]];
    if(sql.includes('FROM vehicles'))return [[{id:2,status:'RESERVED',battery_level:80,current_hub_id:1}]];
    if(sql.includes('FROM hubs'))return [[{id:1,status:'ACTIVE'}]];
    assert.fail(sql);
  };
  await assert.rejects(reservations.reserveVehicle(user,{vehicleId:2,...range()}),errorCode('VEHICLE_TIME_SLOT_BOOKED'));
});
test('invalid rental date rejected before transaction',async()=>{
  const before=transactionCalls;
  await assert.rejects(reservations.reserveVehicle(user,{vehicleId:2,startTime:'bad',endTime:'bad'}),errorCode('VALIDATION_FAILED'));
  assert.equal(transactionCalls,before);
});
test('charging targets below 100 rejected before transaction',async()=>{
  const before=transactionCalls;
  await assert.rejects(charging.schedule(user,{hubId:1,targetBatteryLevel:95,currentBatteryLevel:30}),errorCode('TARGET_BATTERY_INVALID'));
  assert.equal(transactionCalls,before);
});
test('private charging defaults to 100 and persists it in INSERT',async()=>{
  const {startTime,endTime}=range();
  execute=async(sql,params)=>{
    if(sql.includes('FROM users'))return [[{private_vehicle_plate:'PV-018'}]];
    if(sql.includes('FROM hubs'))return [[{id:1,status:'ACTIVE'}]];
    if(sql.includes('FROM charging_points'))return [[{id:1,status:'AVAILABLE',charger_code:'BK-C02'}]];
    if(sql.includes('FROM charging_requests'))return [[]];
    if(sql.includes('INSERT INTO charging_requests')){assert.equal(params[8],100);return [{insertId:55}];}
    if(sql.includes('UPDATE charging_points'))return [{affectedRows:1}];
    assert.fail(sql);
  };
  const result=await charging.schedule(user,{hubId:1,currentBatteryLevel:30,scheduledStart:startTime,scheduledEnd:endTime});
  assert.equal(result.status,'SCHEDULED');
});
test('cannot cancel charging in progress or a completed request', async()=>{
  for(const status of ['CHARGING','COMPLETED']){
    execute=async sql=>{assert.match(sql,/SELECT/);return [[{id:1,user_id:1,status}]];};
    await assert.rejects(charging.cancelRequest(user,1),errorCode('INVALID_STATE_TRANSITION'));
  }
});
test('student parking cancellation always records STUDENT_CANCELLED, never OPERATOR_REJECTED', async () => {
  let savedNote = null;
  const operatorInStudentView = { id: 4, role: 'OPERATOR' };
  execute = async (sql, params) => {
    if (sql.includes('SELECT * FROM reservations')) {
      return [[{ id: 88, user_id: 4, hub_id: 1, parking_slot_id: 5, reservation_type: 'PARKING', status: 'CONFIRMED' }]];
    }
    if (sql.includes("UPDATE reservations SET status = 'CANCELLED'")) {
      savedNote = params[0];
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM reservations')) return [[]];
    if (sql.includes('SELECT * FROM parking_slots')) return [[{ id: 5, status: 'RESERVED' }]];
    if (sql.includes("UPDATE parking_slots SET status = 'FREE'")) return [{ affectedRows: 1 }];
    assert.fail(sql);
  };
  const cancelled = await reservations.cancel(operatorInStudentView, 88, {});
  assert.equal(cancelled.cancellationSource, 'STUDENT_CANCELLED');
  assert.match(savedNote, /^CANCELLED_BY_STUDENT:/);
});
test('two different students can book charging in the exact same time window on a 2-free-charger hub', async () => {
  const { startTime, endTime } = range();
  const student1 = { id: 10, role: 'USER' };
  const student2 = { id: 11, role: 'USER' };
  const bookedOnHub = [];

  execute = async (sql, params) => {
    if (sql.includes('FROM users')) return [[{ private_vehicle_plate: `PV-0${params[0]}` }]];
    if (sql.includes('FROM hubs')) return [[{ id: 1, status: 'ACTIVE' }]];
    if (sql.includes('FROM charging_points')) {
      return [[
        { id: 1, status: 'CHARGING', charger_code: 'BK-C01' },
        { id: 2, status: bookedOnHub.includes(2) ? 'RESERVED' : 'AVAILABLE', charger_code: 'BK-C02' },
        { id: 3, status: bookedOnHub.includes(3) ? 'RESERVED' : 'AVAILABLE', charger_code: 'BK-C03' },
      ]];
    }
    if (sql.includes('SELECT id FROM charging_requests')) return [[]];
    if (sql.includes('SELECT charging_point_id')) {
      return [bookedOnHub.map((id) => ({ charging_point_id: id }))];
    }
    if (sql.includes('INSERT INTO charging_requests')) {
      const assignedId = params[6];
      if (assignedId) bookedOnHub.push(assignedId);
      return [{ insertId: 100 + bookedOnHub.length }];
    }
    if (sql.includes('UPDATE charging_points')) return [{ affectedRows: 1 }];
    assert.fail(sql);
  };

  const res1 = await charging.schedule(student1, {
    hubId: 1,
    chargingPointId: null,
    currentBatteryLevel: 35,
    scheduledStart: startTime,
    scheduledEnd: endTime,
  });
  const res2 = await charging.schedule(student2, {
    hubId: 1,
    chargingPointId: null,
    currentBatteryLevel: 40,
    scheduledStart: startTime,
    scheduledEnd: endTime,
  });

  assert.equal(res1.status, 'SCHEDULED');
  assert.equal(res1.chargerCode, 'BK-C02');
  assert.equal(res2.status, 'SCHEDULED');
  assert.equal(res2.chargerCode, 'BK-C03');
});
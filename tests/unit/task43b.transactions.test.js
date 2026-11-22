/** Pure in-memory transaction tests. Real InnoDB concurrent verification still required. */
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const load = Module._load;
const pool = {getConnection: null};
Module._load = function(name, ...args) {
  if (name === 'mysql2/promise') return { createPool: () => pool };
  return load.call(this,name,...args);
};
const {redistribute} = require('../../backend/src/modules/operator/dispatch.service');
const {ingestTelemetry} = require('../../backend/src/modules/operator/telemetry.service');
Module._load = load;

function fixture({destCapacity=1}={}) {
  let data = {
    hubs: [{id:1,status:'ACTIVE'},{id:2,status:'ACTIVE'}],
    vehicles: [
      {id:11,current_hub_id:1,parking_slot_id:1,status:'AVAILABLE',code:'EB-11',battery_level:50},
      {id:12,current_hub_id:1,parking_slot_id:2,status:'AVAILABLE',code:'EB-12',battery_level:60},
    ],
    slots: [
      {id:1,hub_id:1,slot_type:'SHARED_EV',status:'OCCUPIED'},
      {id:2,hub_id:1,slot_type:'SHARED_EV',status:'OCCUPIED'},
      {id:3,hub_id:2,slot_type:'SHARED_EV',status:'FREE'},
      {id:4,hub_id:2,slot_type:'UNIVERSAL',status:destCapacity>=2?'FREE':'OCCUPIED'},
    ],
    orders:[],
  };
  let backup;
  let committed=0, rolledBack=0;
  const conn = {
    beginTransaction:async()=>{backup=structuredClone(data);},
    commit:async()=>{committed++;},
    rollback:async()=>{data=backup;rolledBack++;},
    release:()=>{},
    execute:async(sql,params=[])=>{
      const s=sql.replace(/\s+/g,' ').trim().toUpperCase();
      if(s.startsWith('SELECT ID,STATUS FROM HUBS') || s.startsWith('SELECT ID, STATUS FROM HUBS')) return [data.hubs.filter(h=>params.includes(h.id))];
      if(s.startsWith('SELECT COALESCE(SUM(STATUS')) {
        const slots=data.slots.filter(v=>v.hub_id===params[0]);
        return [[{usable:slots.filter(v=>v.status!=='OUT_OF_SERVICE').length,used:slots.filter(v=>['RESERVED','OCCUPIED'].includes(v.status)).length}]];
      }
      if(s.startsWith('UPDATE HUBS SET STATUS=' ) || s.startsWith('UPDATE HUBS SET STATUS =')) {data.hubs.find(h=>h.id===params[1]).status=params[0];return [{affectedRows:1}];}
      if(s.startsWith('SELECT ID,CURRENT_HUB_ID,PARKING_SLOT_ID,STATUS FROM VEHICLES')) {
        if(s.includes('WHERE ID IN')) return [data.vehicles.filter(v=>params.includes(v.id))];
        return [data.vehicles.filter(v=>v.current_hub_id===params[0] && v.status==='AVAILABLE').slice(0,params[1])];
      }
      if(s.startsWith('SELECT ID FROM PARKING_SLOTS')) return [data.slots.filter(v=>v.hub_id===params[0] && v.status==='FREE' && ['SHARED_EV','UNIVERSAL'].includes(v.slot_type))];
      if(s.startsWith('SELECT ID,HUB_ID,SLOT_TYPE,STATUS FROM PARKING_SLOTS')) return [data.slots.filter(s=>params.includes(s.id))];
      if(s.startsWith('SELECT PARKING_SLOT_ID FROM RESERVATIONS')) return [[]];
      if(s.startsWith('UPDATE PARKING_SLOTS SET STATUS=')) {
        const target = s.includes("STATUS='FREE'")?'FREE':'OCCUPIED';
        for(const id of params) data.slots.find(s=>s.id===id).status=target;
        return [{affectedRows:params.length}];
      }
      if(s.startsWith('UPDATE VEHICLES SET CURRENT_HUB_ID=')) {
        const v=data.vehicles.find(v=>v.id===params[2]);v.current_hub_id=params[0];v.parking_slot_id=params[1];
        return [{affectedRows:1}];
      }
      if(s.startsWith('INSERT INTO DISPATCH_ORDERS')) {
        data.orders.push({count:params[4],source:params[2],dest:params[3]});
        return [{insertId:data.orders.length}];
      }
      if(s.startsWith('SELECT ID,STATUS FROM VEHICLES WHERE CODE=')) {
        return [data.vehicles.filter(v=>v.code===params[0]).map(v=>({id:v.id,status:v.status}))];
      }
      if(s.startsWith('UPDATE VEHICLES SET BATTERY_LEVEL=')) {
        const v=data.vehicles.find(v=>v.id===params[1]);v.battery_level=params[0];return [{affectedRows:1}];
      }
      throw new Error('Fake adapter does not support SQL: '+s);
    }
  };
  pool.getConnection=async()=>conn;
  return {read:()=>data,commits:()=>committed,rollbacks:()=>rolledBack};
}

test('4.3b: count dispatch rejects insufficient destination capacity with rollback',async()=>{
  const db=fixture({destCapacity:1});
  await assert.rejects(redistribute({id:1},{sourceHubId:1,destinationHubId:2,vehicleCount:2}),e=>e.code==='HUB_PARKING_FULL');
  assert.equal(db.rollbacks(),1);assert.equal(db.commits(),0);
  assert.deepEqual(db.read().vehicles.map(v=>v.current_hub_id),[1,1]);
  assert.equal(db.read().orders.length,0);
});
test('4.3b: valid dispatch moves exact fleet count and fills exact slots atomically',async()=>{
  const db=fixture({destCapacity:2});
  const outcome=await redistribute({id:1},{sourceHubId:1,destinationHubId:2,vehicleCount:2,reason:'Balance Fleet'});
  assert.equal(outcome.movedCount,2);assert.equal(db.commits(),1);assert.equal(db.rollbacks(),0);
  assert.deepEqual(db.read().vehicles.map(v=>v.parking_slot_id),[3,4]);
  assert.deepEqual(db.read().slots.map(s=>s.status),['FREE','FREE','OCCUPIED','OCCUPIED']);
  assert.equal(db.read().orders.length,1);
});
test('4.3b: a selected vehicle cannot be allocated twice',async()=>{
  const db=fixture({destCapacity:2});
  await assert.rejects(redistribute({id:1},{sourceHubId:1,destinationHubId:2,allocations:[{vehicleId:11,toSlotId:3},{vehicleId:11,toSlotId:4}]}),e=>e.code==='VALIDATION_ERROR');
  assert.equal(db.commits(),0);
});
test('4.3b: telemetry rejects unknown vehicle and rolls back all proposed updates',async()=>{
  const db=fixture();
  await assert.rejects(ingestTelemetry({vehicleUpdates:[{vehicleCode:'EB-11',batteryLevel:9},{vehicleCode:'ZZ-ZZ',batteryLevel:60}]}),e=>e.code==='VEHICLE_NOT_FOUND');
  assert.equal(db.rollbacks(),1);
  assert.equal(db.read().vehicles[0].battery_level,50);
});
test('4.3b: telemetry rejects lifecycle overwrite and updates permitted battery values atomically',async()=>{
  const db=fixture();
  await assert.rejects(ingestTelemetry({vehicleUpdates:[{vehicleCode:'EB-11',batteryLevel:9,status:'CHARGING'}]}),e=>e.code==='STATE_UPDATE_REQUIRES_WORKFLOW');
  assert.equal(db.read().vehicles[0].status,'AVAILABLE');
  const outcome=await ingestTelemetry({vehicleUpdates:[{vehicleCode:'EB-11',batteryLevel:40},{vehicleCode:'EB-12',batteryLevel:45}]});
  assert.equal(outcome.updatedCount,2);assert.equal(db.read().vehicles[0].battery_level,40);
  assert.equal(db.read().vehicles[1].battery_level,45);
});
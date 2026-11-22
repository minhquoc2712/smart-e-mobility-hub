const test = require('node:test');
const assert = require('node:assert/strict');
const { validators } = require('../../backend/src/middlewares/validateRequest.middleware');
const { dateTime } = require('../../backend/src/modules/reservations/reservations.validation');
const { parseId } = require('../../backend/src/utils/validators');
const future = (hours=1)=>new Date(Date.now()+hours*60*60*1000).toISOString();
const errorCode = (fn, code='VALIDATION_ERROR')=>assert.throws(fn,err=>err.code===code);

test('4.3b: request validation requires vehicle reservation fields and valid timezones',()=>{
  validators.reservationVehicle({vehicleId:1,hubId:1,startTime:future(),endTime:future(2)});
  errorCode(()=>validators.reservationVehicle({vehicleId:1,startTime:future()}));
  errorCode(()=>validators.reservationVehicle({vehicleId:'1',startTime:future(),endTime:future(2)}));
  errorCode(()=>dateTime('2026-11-17 12:30:00', 'startTime'),'VALIDATION_FAILED');
  assert.ok(dateTime('2026-11-17T12:30:00+07:00','startTime'));
});
test('4.3b: private booking validates slot and plate',()=>{
  validators.reservationParking({hubId:1,slotType:'PRIVATE_EV',startTime:future(),endTime:future(2),licensePlate:'59-MD1 123.45'});
  errorCode(()=>validators.reservationParking({hubId:1,slotType:'BOGUS',startTime:future(),endTime:future(2)}));
  errorCode(()=>validators.reservationParking({hubId:1,startTime:future(),endTime:future(2),licensePlate:'x'.repeat(31)}));
});
test('4.3b: returns accept documented remainingBattery & alias',()=>{
  validators.returnVehicle({returnHubId:1,remainingBattery:0,conditionNote:''});
  validators.returnVehicle({hubId:1,batteryLevel:100});
  errorCode(()=>validators.returnVehicle({returnHubId:1,remainingBattery:101}));
  errorCode(()=>validators.returnVehicle({returnHubId:1,remainingBattery:'90'}));
});
test('4.3b: charging rejects invalid battery, vehicle ids and manual point selection',()=>{
  const body={hubId:1,ownershipType:'PRIVATE',privateVehicleLabel:'E-bike',scheduledStart:future(),scheduledEnd:future(2),currentBatteryLevel:20,targetBatteryLevel:80};
  validators.charging(body);
  errorCode(()=>validators.charging({...body,chargingPointId:1}));
  errorCode(()=>validators.charging({...body,targetBatteryLevel:101}));
  errorCode(()=>validators.charging({...body,vehicleId:'4'}));
  errorCode(()=>validators.charging({...body,privateVehicleLabel:''}));
});
test('4.3b: incident enforces target ids, severity, title and nonmixed targets',()=>{
  validators.incident({hubId:1,targetType:'VEHICLE',vehicleId:2,title:'Damaged tire',description:'Reported damage',severity:'HIGH'});
  errorCode(()=>validators.incident({hubId:1,targetType:'VEHICLE',title:'Tire',description:'Fault'}));
  errorCode(()=>validators.incident({hubId:1,targetType:'HUB',vehicleId:2,title:'Hub',description:'Fault'}));
  errorCode(()=>validators.incident({hubId:1,targetType:'HUB',title:'Hub',description:'Fault',severity:'UNKNOWN'}));
});
test('4.3b: dispatch checks exact count and duplicate ids',()=>{
  validators.dispatch({sourceHubId:1,destinationHubId:1,vehicleCount:1,allocations:[{vehicleId:1,toSlotId:2}]});
  errorCode(()=>validators.dispatch({sourceHubId:1,destinationHubId:2,vehicleCount:0}));
  errorCode(()=>validators.dispatch({sourceHubId:1,destinationHubId:2,vehicleCount:3,allocations:[{vehicleId:1,toSlotId:2}]}));
  errorCode(()=>validators.dispatch({sourceHubId:1,destinationHubId:2,vehicleCount:2,allocations:[{vehicleId:1,toSlotId:2},{vehicleId:2,toSlotId:-1}]}));
});
test('4.3b: telemetry checks duplicates, battery bounds, array size',()=>{
  validators.telemetry({vehicleUpdates:[{vehicleCode:'EB-102',batteryLevel:99}]});
  errorCode(()=>validators.telemetry({vehicleUpdates:[{vehicleCode:'EB-102',batteryLevel:-1}]}));
  errorCode(()=>validators.telemetry({vehicleUpdates:[{vehicleCode:'EB-102',batteryLevel:80},{vehicleCode:'EB-102',batteryLevel:80}]}));
  errorCode(()=>validators.telemetry({vehicleUpdates:'not an array'}));
});
test('4.3b: integer and safe identifier boundaries',()=>{
  assert.equal(parseId(1),1); assert.equal(parseId('12'),12);
  errorCode(()=>parseId(Number.MAX_SAFE_INTEGER+1,'id'),'INVALID_ID');
  errorCode(()=>parseId(null,'id'),'INVALID_ID');
});
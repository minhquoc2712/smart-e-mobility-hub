const AppError = require('../utils/appError');
const { dateTime } = require('../modules/reservations/reservations.validation');
const fail = (message) => { throw new AppError(400, 'VALIDATION_ERROR', message); };
const present = (v) => v !== undefined && v !== null && v !== '';

function object(value, field = 'body') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${field} must be a JSON object.`);
  return value;
}
function required(value, field) { if (!present(value)) fail(`${field} is required.`); return value; }
function id(value, field, mandatory = true) {
  if (!mandatory && !present(value)) return;
  if (!Number.isSafeInteger(value) || value <= 0) fail(`${field} must be a positive integer.`);
}
function integer(value, field, min, max, mandatory = true) {
  if (!mandatory && !present(value)) return;
  if (!Number.isInteger(value) || value < min || value > max) fail(`${field} must be an integer in [${min}, ${max}].`);
}
function str(value, field, { max = 255, mandatory = true, min = 1 } = {}) {
  if (!mandatory && !present(value)) return;
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) fail(`${field} must be a string (${min}-${max} characters).`);
}
function choice(value, field, allowed, mandatory = true) {
  if (!mandatory && !present(value)) return;
  if (!allowed.includes(value)) fail(`${field} must be one of: ${allowed.join(', ')}.`);
}
function time(value, field) { required(value, field); dateTime(value, field); }
function reservationVehicle(b) {
  id(b.vehicleId, 'vehicleId');
  id(b.hubId, 'hubId', false); // legacy POST /reservations accepts vehicleId only
  time(b.startTime, 'startTime'); time(b.endTime, 'endTime');
}
function reservationParking(b) {
  id(b.hubId, 'hubId'); time(b.startTime, 'startTime'); time(b.endTime, 'endTime');
  choice(b.slotType, 'slotType', ['PRIVATE_EV', 'UNIVERSAL'], false);
  str(b.licensePlate, 'licensePlate', { max: 30, mandatory: false });
}
function returnVehicle(b) {
  id(b.returnHubId ?? b.hubId, 'returnHubId');
  integer(b.remainingBattery ?? b.batteryLevel, 'remainingBattery', 0, 100, false);
  str(b.conditionNote ?? b.returnConditionNote, 'conditionNote', { max: 255, min: 0, mandatory: false });
}
function charging(b) {
  id(b.hubId, 'hubId');
  choice(b.ownershipType ?? 'PRIVATE', 'ownershipType', ['PRIVATE', 'RENTAL']);
  time(b.scheduledStart ?? b.earliestStart, 'scheduledStart');
  time(b.scheduledEnd ?? b.neededBy, 'scheduledEnd');
  integer(b.currentBatteryLevel ?? b.batteryAtRequest ?? 35, 'currentBatteryLevel', 0, 100);
  integer(b.targetBatteryLevel ?? b.targetBattery ?? 85, 'targetBatteryLevel', 0, 100);
  id(b.vehicleId, 'vehicleId', false);
  str(b.privateVehicleLabel, 'privateVehicleLabel', {max:100, mandatory:(b.ownershipType ?? 'PRIVATE') === 'PRIVATE'});
  choice(b.connectorType, 'connectorType', ['TYPE_2','E_BIKE_DC','UNIVERSAL_AC'], false);
  if (present(b.chargingPointId)) fail('Charging point is assigned automatically, not by the client.');
}
function incident(b) {
  id(b.hubId, 'hubId');
  choice(b.targetType, 'targetType', ['VEHICLE', 'CHARGING_POINT', 'PARKING_SLOT', 'HUB']);
  choice(b.severity ?? 'MEDIUM', 'severity', ['LOW','MEDIUM','HIGH','CRITICAL']);
  str(b.title, 'title', { max:160 }); str(b.description, 'description', {max:5000});
  const field = { VEHICLE:'vehicleId', CHARGING_POINT:'chargingPointId', PARKING_SLOT:'parkingSlotId' }[b.targetType];
  if (field) id(b[field], field);
  for (const f of ['vehicleId','chargingPointId','parkingSlotId']) if (f !== field && present(b[f])) fail(`${f} must not be set for ${b.targetType}.`);
}
function dispatch(b) {
  id(b.sourceHubId, 'sourceHubId'); id(b.destinationHubId, 'destinationHubId');
    const hasAllocations = Array.isArray(b.allocations) && b.allocations.length > 0;
  if (hasAllocations) {
    if (b.allocations.length > 100) fail('allocations cannot contain more than 100 items.');
    for (const [i, item] of b.allocations.entries()) {
      object(item, `allocations[${i}]`); id(item.vehicleId, `allocations[${i}].vehicleId`);
      id(item.toSlotId, `allocations[${i}].toSlotId`); id(item.fromSlotId, `allocations[${i}].fromSlotId`, false);
    }
    integer(b.vehicleCount, 'vehicleCount', 1, 100, false);
    if (present(b.vehicleCount) && b.vehicleCount !== b.allocations.length) fail('vehicleCount does not match allocations.length.');
  } else {
    if (present(b.allocations) && !Array.isArray(b.allocations)) fail('allocations must be an array.');
    integer(b.vehicleCount, 'vehicleCount', 1, 100);
  }
  str(b.reason, 'reason', {max:255, min:0, mandatory:false});
  str(b.assignedStaff, 'assignedStaff', {max:120, mandatory:false});
}
function telemetry(b) {
  if (present(b.simulatorKey)) str(b.simulatorKey, 'simulatorKey', {max:255});
  if (!Array.isArray(b.vehicleUpdates) || b.vehicleUpdates.length > 200) fail('vehicleUpdates must be an array with at most 200 items.');
  const seen = new Set();
  for (const [i, update] of b.vehicleUpdates.entries()) {
    object(update, `vehicleUpdates[${i}]`);
    str(update.vehicleCode, `vehicleUpdates[${i}].vehicleCode`, {max:32});
    integer(update.batteryLevel, `vehicleUpdates[${i}].batteryLevel`, 0, 100);
    if (present(update.status)) choice(update.status, `vehicleUpdates[${i}].status`, ['AVAILABLE', 'RESERVED', 'IN_USE', 'CHARGING', 'OUT_OF_SERVICE']);
    if (seen.has(update.vehicleCode)) fail('vehicleUpdates contains duplicate vehicleCode values.');
    seen.add(update.vehicleCode);
  }
}
function simulation(b) {
  str(b.scenarioCode, 'scenarioCode', {max:50}); object(b.params, 'params');
}
function priority(b) { choice(b.priority, 'priority', ['LOW', 'NORMAL', 'HIGH', 'URGENT']); }

const validators = {
  reservationVehicle, reservationParking, returnVehicle, charging, incident,
  dispatch, telemetry, simulation, priority,
};
function validateRequest(name) {
  const validator = validators[name];
  if (!validator) throw new Error(`Unknown request validation: ${name}`);
  return (req, _res, next) => {
    try { validator(object(req.body)); next(); } catch (err) { next(err); }
  };
}
module.exports = { validateRequest, validators };
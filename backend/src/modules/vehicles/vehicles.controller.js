const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/appError');
const { parseId, parseOptionalId, parseStatus, parseOptionalStatus } = require('../../utils/validators');
const service = require('./vehicles.service');

const VEHICLE_TYPES = ['ELECTRIC_BIKE', 'ELECTRIC_SCOOTER'];

const list = asyncHandler(async (req, res) => {
  const hubId = parseOptionalId(req.query.hubId, 'hubId');
  const status = parseOptionalStatus('vehicle', req.query.status);
  const type = req.query.type ? String(req.query.type).toUpperCase() : null;
  if (type && !VEHICLE_TYPES.includes(type)) {
    throw new AppError(400, 'INVALID_VEHICLE_TYPE', `type must be one of: ${VEHICLE_TYPES.join(', ')}.`);
  }
  const minBattery = req.query.minBattery === undefined ? 0 : Number(req.query.minBattery);
  if (!Number.isFinite(minBattery) || minBattery < 0 || minBattery > 100) {
    throw new AppError(400, 'INVALID_MIN_BATTERY', 'minBattery must be a number between 0 and 100.');
  }
  res.json({ success: true, data: await service.listVehicles({ hubId, type, minBattery, status }) });
});

const getOne = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getVehicle(parseId(req.params.vehicleId, 'vehicleId')) });
});

const availability = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.checkAvailability(parseId(req.params.vehicleId, 'vehicleId')) });
});

const changeStatus = asyncHandler(async (req, res) => {
  const vehicleId = parseId(req.params.vehicleId, 'vehicleId');
  const status = parseStatus('vehicle', req.body && req.body.status);
  res.json({ success: true, data: await service.changeVehicleStatus(vehicleId, status) });
});

module.exports = { list, getOne, availability, changeStatus };

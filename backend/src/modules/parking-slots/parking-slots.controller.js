const asyncHandler = require('../../utils/asyncHandler');
const { parseId, parseOptionalId, parseStatus, parseOptionalStatus } = require('../../utils/validators');
const AppError = require('../../utils/appError');
const service = require('./parking-slots.service');

const SLOT_TYPES = ['SHARED_EV', 'PRIVATE_EV', 'UNIVERSAL'];

const list = asyncHandler(async (req, res) => {
  const hubId = parseOptionalId(req.query.hubId, 'hubId');
  const status = parseOptionalStatus('parkingSlot', req.query.status);
  const slotType = req.query.slotType ? String(req.query.slotType).toUpperCase() : null;
  if (slotType && !SLOT_TYPES.includes(slotType)) {
    throw new AppError(400, 'INVALID_SLOT_TYPE', `slotType must be one of: ${SLOT_TYPES.join(', ')}.`);
  }
  res.json({ success: true, data: await service.listParkingSlots({ hubId, status, slotType }) });
});

const getOne = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getParkingSlot(parseId(req.params.slotId, 'slotId')) });
});

const changeStatus = asyncHandler(async (req, res) => {
  const slotId = parseId(req.params.slotId, 'slotId');
  const status = parseStatus('parkingSlot', req.body && req.body.status);
  const extra = {
    vehiclePlate: req.body?.vehiclePlate || req.body?.vehicleCode || null,
    vehicleType: req.body?.vehicleType || null,
  };
  res.json({ success: true, data: await service.changeParkingSlotStatus(slotId, status, null, extra) });
});

module.exports = { list, getOne, changeStatus };

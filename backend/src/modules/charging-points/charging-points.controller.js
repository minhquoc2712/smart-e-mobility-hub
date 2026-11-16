const asyncHandler = require('../../utils/asyncHandler');
const { parseId, parseOptionalId, parseStatus, parseOptionalStatus } = require('../../utils/validators');
const service = require('./charging-points.service');

const list = asyncHandler(async (req, res) => {
  const hubId = parseOptionalId(req.query.hubId, 'hubId');
  const status = parseOptionalStatus('chargingPoint', req.query.status);
  res.json({ success: true, data: await service.listChargingPoints({ hubId, status }) });
});

const getOne = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getChargingPoint(parseId(req.params.chargerId, 'chargerId')) });
});

const changeStatus = asyncHandler(async (req, res) => {
  const chargerId = parseId(req.params.chargerId, 'chargerId');
  const body = req.body || {};
  const status = parseStatus('chargingPoint', body.status);
  const vehicleId = parseOptionalId(body.vehicleId, 'vehicleId');
  res.json({ success: true, data: await service.changeChargingPointStatus(chargerId, status, { vehicleId }) });
});

module.exports = { list, getOne, changeStatus };

const asyncHandler = require('../../utils/asyncHandler');
const { parseId, parseStatus, parseOptionalStatus } = require('../../utils/validators');
const hubsService = require('./hubs.service');

const list = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await hubsService.listHubs() });
});

const getOne = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await hubsService.getHub(parseId(req.params.hubId, 'hubId')) });
});

const listParkingSlots = asyncHandler(async (req, res) => {
  const hubId = parseId(req.params.hubId, 'hubId');
  const status = parseOptionalStatus('parkingSlot', req.query.status);
  res.json({ success: true, data: await hubsService.listParkingSlots(hubId, { status }) });
});

const listChargingPoints = asyncHandler(async (req, res) => {
  const hubId = parseId(req.params.hubId, 'hubId');
  const status = parseOptionalStatus('chargingPoint', req.query.status);
  res.json({ success: true, data: await hubsService.listChargingPoints(hubId, { status }) });
});

const changeStatus = asyncHandler(async (req, res) => {
  const hubId = parseId(req.params.hubId, 'hubId');
  const status = parseStatus('hub', req.body && req.body.status);
  res.json({ success: true, data: await hubsService.changeHubStatus(hubId, status) });
});

module.exports = { list, getOne, listParkingSlots, listChargingPoints, changeStatus };

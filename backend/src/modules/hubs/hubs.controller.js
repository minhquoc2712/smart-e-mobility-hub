const asyncHandler = require('../../utils/asyncHandler');
const { parseId, parseStatus, parseOptionalStatus } = require('../../utils/validators');
const hubsService = require('./hubs.service');

const list = asyncHandler(async (req, res) => {
  const search = req.query.search ? String(req.query.search).trim() : '';
  const vehicleType = req.query.vehicleType ? String(req.query.vehicleType).trim().toUpperCase() : '';
  res.json({ success: true, data: await hubsService.listHubs({ search, vehicleType }) });
});

const suggestions = asyncHandler(async (req, res) => {
  const q = req.query.q ? String(req.query.q).trim() : '';
  res.json({ success: true, data: await hubsService.getSearchSuggestions(q) });
});

const getOne = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await hubsService.getHub(parseId(req.params.hubId, 'hubId')) });
});

const bookedWindows = asyncHandler(async (req, res) => {
  const hubId = parseId(req.params.hubId, 'hubId');
  res.json({ success: true, data: await hubsService.getBookedWindows(hubId) });
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

module.exports = {
  list,
  suggestions,
  getOne,
  bookedWindows,
  listParkingSlots,
  listChargingPoints,
  changeStatus,
};

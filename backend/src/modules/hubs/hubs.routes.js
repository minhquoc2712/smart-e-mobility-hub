/**
 * Module: Hubs (Task 3.1 + AJAX Search & Autocomplete)
 * UC01 (View Hubs & resources), UC03 (View parking and charging).
 *
 * GET   /hubs                       ?search=&vehicleType=
 * GET   /hubs/suggestions           ?q= (AJAX live autocomplete suggestions)
 * GET   /hubs/:hubId                chi tiết hub
 * GET   /hubs/:hubId/parking-slots  slot của hub (?status=FREE)
 * GET   /hubs/:hubId/charging-points charger của hub (?status=AVAILABLE)
 * PATCH /hubs/:hubId/status         [OPERATOR] ACTIVE <-> MAINTENANCE
 */
const express = require('express');
const { authenticateToken, requireRole } = require('../../middlewares/auth.middleware');
const controller = require('./hubs.controller');

const router = express.Router();

router.get('/', controller.list);
router.get('/suggestions', controller.suggestions);
router.get('/:hubId', controller.getOne);
router.get('/:hubId/booked-windows', controller.bookedWindows);
router.get('/:hubId/parking-slots', controller.listParkingSlots);
router.get('/:hubId/charging-points', controller.listChargingPoints);
router.patch('/:hubId/status', authenticateToken, requireRole('OPERATOR'), controller.changeStatus);

module.exports = router;

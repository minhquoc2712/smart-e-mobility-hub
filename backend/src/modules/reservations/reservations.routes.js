const express=require('express');
const {authenticateToken}=require('../../middlewares/auth.middleware');
const c=require('./reservations.controller');
const { validateRequest: validate } = require('../../middlewares/validateRequest.middleware');
const router=express.Router();router.use(authenticateToken);
router.get('/',c.list);
router.get('/my',c.list);
router.post('/',validate('reservationVehicle'),c.reserveVehicle); // API 2B.6
router.post('/vehicles',validate('reservationVehicle'),c.reserveVehicle); // Existing frontend compatibility
router.post('/parking',validate('reservationParking'),c.reserveParking); // Existing frontend compatibility
router.get('/:reservationId',c.detail);
router.post('/:reservationId/cancel',c.cancel); // API 2B.6
router.patch('/:reservationId/cancel',c.cancel); // Existing frontend compatibility
router.post('/:reservationId/pickup',c.pickup);
router.post('/:reservationId/return',validate('returnVehicle'),c.returnVehicle);
router.post('/:reservationId/check-in',c.parkingCheckIn);
router.post('/:reservationId/check-out',c.parkingCheckOut);
module.exports=router;
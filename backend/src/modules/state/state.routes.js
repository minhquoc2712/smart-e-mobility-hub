/**
 * GET /api/v1/state-machine — trả bảng chuyển trạng thái hợp lệ (cho frontend & báo cáo).
 */
const express = require('express');
const { TRANSITIONS } = require('./stateMachine');

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({ success: true, data: TRANSITIONS });
});

module.exports = router;

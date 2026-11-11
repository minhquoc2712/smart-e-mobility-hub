/**
 * Module: Authentication & Role-Based Access (Task 3.1c : Pham Tuan Minh)
 * Verifies Google ID token, maps configured emails to OPERATOR (others -> USER), and issues JWT.
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { pool } = require('../../config/db');
const { authenticateToken } = require('../../middlewares/auth.middleware');

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function resolveRoleByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const operatorList = (process.env.OPERATOR_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (operatorList.includes(normalized) || normalized.includes('operator') || normalized.includes('staff')) {
    return 'OPERATOR';
  }
  return 'USER';
}

function signSessionToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, fullName: user.full_name || user.fullName, role: user.role },
    process.env.JWT_SECRET || 'dev-only-fallback-secret',
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

router.post('/google', async (req, res, next) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Google credential token is required.' },
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const role = resolveRoleByEmail(payload.email);

    await pool.execute(
      `INSERT INTO users (email, full_name, google_sub, avatar_url, role)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), avatar_url = VALUES(avatar_url), role = VALUES(role)`,
      [payload.email, payload.name || payload.email, payload.sub, payload.picture || null, role]
    );

    const [rows] = await pool.execute('SELECT * FROM users WHERE email = ? LIMIT 1', [payload.email]);
    const user = rows[0];
    const token = signSessionToken(user);

    return res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          avatarUrl: user.avatar_url,
          privateVehiclePlate: user.private_vehicle_plate,
          privateVehicleModel: user.private_vehicle_model,
        },
      },
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/dev-login', async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Dev login is disabled in production.',
        },
      });
    }

    const email = String(req.body?.email || 'student@hcmut.edu.vn').trim().toLowerCase();
    const role = resolveRoleByEmail(email);

    let [rows] = await pool.execute(
      `SELECT id, email, full_name, role, private_vehicle_plate, private_vehicle_model
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email]
    );

    if (rows.length === 0) {
      const defaultName = role === 'OPERATOR' ? 'Lê Điều Phối Viên' : email.split('@')[0];
      await pool.execute(
        `INSERT INTO users (email, full_name, role, private_vehicle_plate, private_vehicle_model)
         VALUES (?, ?, ?, ?, ?)`,
        [email, defaultName, role, role === 'USER' ? 'PV-018' : null, role === 'USER' ? 'My e-bike (Private electric bike)' : null]
      );
      [rows] = await pool.execute(
        `SELECT id, email, full_name, role, private_vehicle_plate, private_vehicle_model
         FROM users
         WHERE email = ?
         LIMIT 1`,
        [email]
      );
    }

    const user = rows[0];
    const token = signSessionToken(user);

    return res.status(200).json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          privateVehiclePlate: user.private_vehicle_plate,
          privateVehicleModel: user.private_vehicle_model,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/private-vehicle', authenticateToken, async (req, res, next) => {
  try {
    const plate = String(req.body?.privateVehiclePlate || req.body?.id || 'PV-018').trim();
    const model = String(req.body?.privateVehicleModel || req.body?.name || 'Private electric bike').trim();
    await pool.execute(
      `UPDATE users SET private_vehicle_plate = ?, private_vehicle_model = ? WHERE id = ?`,
      [plate, model, req.user.id]
    );
    return res.json({
      success: true,
      data: {
        userId: req.user.id,
        privateVehiclePlate: plate,
        privateVehicleModel: model,
      },
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, email, full_name AS fullName, role, private_vehicle_plate AS privateVehiclePlate, private_vehicle_model AS privateVehicleModel
       FROM users WHERE id = ? LIMIT 1`,
      [req.user.id]
    );
    res.json({ success: true, data: { user: rows[0] || req.user } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

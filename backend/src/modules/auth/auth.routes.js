/**
 * Module: Authentication & Role-Based Access (Task 3.1c : Pham Tuan Minh)
 * Verifies Google ID token, maps configured emails to OPERATOR (others -> USER), and issues JWT.
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { pool } = require('../../config/db');
const authConfig = require('../../config/auth');
const AppError = require('../../utils/appError');
const { authenticateToken } = require('../../middlewares/auth.middleware');

const router = express.Router();
const googleClient = new OAuth2Client(authConfig.googleClientId);

function resolveRoleByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const operatorList = (process.env.OPERATOR_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (
    operatorList.includes(normalized) ||
    normalized.includes('operator') ||
    normalized.includes('staff')
  ) {
    return 'OPERATOR';
  }
  return 'USER';
}

function signSessionToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, fullName: user.full_name || user.fullName, role: user.role },
    authConfig.jwtSecret,
    { expiresIn: authConfig.jwtExpiresIn }
  );
}

async function verifyGoogleCredential(credential) {
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: authConfig.googleClientId,
    });
    payload = ticket.getPayload();
  } catch {
    throw new AppError(401, 'INVALID_GOOGLE_TOKEN', 'Google token is invalid or expired.');
  }
  if (!payload || !payload.email || payload.email_verified !== true) {
    throw new AppError(401, 'EMAIL_NOT_VERIFIED', 'Google account email is not verified.');
  }
  return payload;
}

router.post('/google', async (req, res, next) => {
  try {
    const { credential } = req.body || {};
    if (!credential || typeof credential !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Google credential token is required.' },
      });
    }

    const payload = await verifyGoogleCredential(credential);
    const email = payload.email.toLowerCase();
    const role = resolveRoleByEmail(email);

    const [existing] = await pool.execute('SELECT google_sub FROM users WHERE email = ? LIMIT 1', [
      email,
    ]);
    if (existing[0]?.google_sub && existing[0].google_sub !== payload.sub) {
      throw new AppError(
        403,
        'ACCOUNT_MISMATCH',
        'This email is linked to a different Google account.'
      );
    }

    await pool.execute(
      `INSERT INTO users (email, full_name, google_sub, avatar_url, role)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         full_name  = VALUES(full_name),
         avatar_url = VALUES(avatar_url),
         role       = VALUES(role),
         google_sub = COALESCE(google_sub, VALUES(google_sub))`,
      [email, payload.name || email, payload.sub, payload.picture || null, role]
    );

    const [rows] = await pool.execute('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
    const user = rows[0];
    const token = signSessionToken(user);

    return res.json({
      success: true,
      data: {
        token,
        // true when this Google sign-in created the account (first visit), so the UI can welcome the user.
        isNewUser: existing.length === 0,
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
    if (process.env.NODE_ENV !== 'development') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Endpoint does not exist.' },
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
        [
          email,
          defaultName,
          role,
          role === 'USER' ? 'PV-018' : null,
          role === 'USER' ? 'My e-bike (Private electric bike)' : null,
        ]
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
    return next(err);
  }
});

router.patch('/private-vehicle', authenticateToken, async (req, res, next) => {
  try {
    const plate = String(req.body?.privateVehiclePlate || req.body?.id || 'PV-018').trim();
    const model = String(
      req.body?.privateVehicleModel || req.body?.name || 'Private electric bike'
    ).trim();
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

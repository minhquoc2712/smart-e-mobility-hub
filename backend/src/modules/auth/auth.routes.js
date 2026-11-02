/**
 * Module: Authentication & Role-Based Access (Task 3.1c — Owner: Phạm Tuấn Minh)
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
  const operatorList = (process.env.OPERATOR_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return operatorList.includes(email.toLowerCase()) ? 'OPERATOR' : 'USER';
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

// Safe Dev-Login endpoint (ONLY active when NODE_ENV=development)
router.post('/dev-login', async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Dev login is disabled in production.' },
      });
    }
    const { email = 'student@hcmut.edu.vn', fullName = 'Demo User' } = req.body;
    const role = resolveRoleByEmail(email);

    const demoUser = { id: role === 'OPERATOR' ? 3 : 1, email, fullName, role };
    const token = signSessionToken(demoUser);
    return res.json({ success: true, data: { token, user: demoUser } });
  } catch (err) {
    return next(err);
  }
});

router.get('/me', authenticateToken, (req, res) => {
  res.json({ success: true, data: { user: req.user } });
});

module.exports = router;

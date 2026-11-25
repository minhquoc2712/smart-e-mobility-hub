/**
 * Module: Authentication & Role-Based Access (Task 3.1c & 4.3a : Pham Tuan Minh)
 * Verifies Google ID token, maps configured emails to OPERATOR (others -> USER), and issues JWT.
 * Also supports simple email + password sign up / log in (USER accounts only).
 */
const crypto = require('crypto');
const { promisify } = require('util');
const express = require('express');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { pool } = require('../../config/db');
const authConfig = require('../../config/auth');
const AppError = require('../../utils/appError');
const { authenticateToken } = require('../../middlewares/auth.middleware');

const router = express.Router();
const googleClient = new OAuth2Client(authConfig.googleClientId);

// ---------------------------------------------------------------------------
// Email + password accounts (Node built-in scrypt, no extra npm dependency).
// Self-heals existing DBs that were initialized before password_hash existed.
// ---------------------------------------------------------------------------
const scrypt = promisify(crypto.scrypt);
const PASSWORD_MIN_LENGTH = 6;
let passwordHashColumnChecked = false;

async function ensurePasswordHashColumn() {
  if (passwordHashColumnChecked) return;
  const [cols] = await pool.execute("SHOW COLUMNS FROM users LIKE 'password_hash'");
  if (!cols.length) {
    await pool.execute(
      'ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL AFTER google_sub'
    );
  }
  passwordHashColumnChecked = true;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, salt, hashHex] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, salt, expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    avatarUrl: user.avatar_url || null,
    privateVehiclePlate: user.private_vehicle_plate,
    privateVehicleModel: user.private_vehicle_model,
  };
}

function validationError(message) {
  return new AppError(400, 'VALIDATION_ERROR', message);
}

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
        isNewUser: existing.length === 0,
        user: toPublicUser(user),
      },
    });
  } catch (err) {
    return next(err);
  }
});

// Sign up with email + password. Always creates a USER account:
// Operator access is only granted through Google sign-in.
router.post('/register', async (req, res, next) => {
  try {
    await ensurePasswordHashColumn();
    const fullName = String(req.body?.fullName || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!fullName) throw validationError('Full name is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw validationError('Enter a valid email address.');
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      throw validationError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
    }
    if (resolveRoleByEmail(email) === 'OPERATOR') {
      throw new AppError(403, 'STAFF_USE_GOOGLE', 'Staff accounts must sign in with Google.');
    }

    const [existing] = await pool.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (existing.length) {
      throw new AppError(
        409,
        'EMAIL_TAKEN',
        'An account with this email already exists. Log in with your password or with Google.'
      );
    }

    const passwordHash = await hashPassword(password);
    const [result] = await pool.execute(
      `INSERT INTO users (email, full_name, password_hash, role, private_vehicle_plate, private_vehicle_model)
       VALUES (?, ?, ?, 'USER', 'PV-018', 'My e-bike (Private electric bike)')`,
      [email, fullName, passwordHash]
    );
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [result.insertId]);
    const user = rows[0];

    return res.status(201).json({
      success: true,
      data: {
        token: signSessionToken(user),
        isNewUser: true,
        user: toPublicUser(user),
      },
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return next(
        new AppError(
          409,
          'EMAIL_TAKEN',
          'An account with this email already exists. Log in with your password or with Google.'
        )
      );
    }
    return next(err);
  }
});

// Log in with email + password. Accounts created through Google have no password and must use Google.
router.post('/login', async (req, res, next) => {
  try {
    await ensurePasswordHashColumn();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) throw validationError('Email and password are required.');

    const [rows] = await pool.execute('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
    const user = rows[0];
    const ok = user && user.password_hash && (await verifyPassword(password, user.password_hash));
    if (!ok) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Wrong email or password.');
    }

    return res.json({
      success: true,
      data: { token: signSessionToken(user), isNewUser: false, user: toPublicUser(user) },
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
      `SELECT id, email, full_name, role, avatar_url, private_vehicle_plate, private_vehicle_model
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email]
    );

    const isNewUser = rows.length === 0;
    if (isNewUser) {
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
        `SELECT id, email, full_name, role, avatar_url, private_vehicle_plate, private_vehicle_model
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
        isNewUser,
        user: toPublicUser(user),
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

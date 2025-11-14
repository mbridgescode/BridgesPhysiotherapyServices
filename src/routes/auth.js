const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const User = require('../models/user');
const Counter = require('../models/counter');
const RefreshToken = require('../models/refreshToken');
const { authenticate, authorize } = require('../middleware/auth');
const { recordAuditEvent } = require('../utils/audit');
const { sendTransactionalEmail } = require('../services/emailService');
const {
  accessTokenSecret,
  refreshTokenSecret,
  accessTokenExpiresIn,
  refreshTokenExpiresIn,
  nodeEnv,
} = require('../config/env');

const router = express.Router();

const REFRESH_COOKIE_NAME = 'bridges_rt';

const buildRefreshCookieOptions = (expiresAt) => ({
  httpOnly: true,
  secure: nodeEnv !== 'development',
  sameSite: 'strict',
  expires: expiresAt,
  path: '/auth',
});

const setRefreshCookie = (res, token, expiresAt) => {
  res.cookie(REFRESH_COOKIE_NAME, token, buildRefreshCookieOptions(expiresAt));
};

const clearRefreshCookie = (res) => {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: nodeEnv !== 'development',
    sameSite: 'strict',
    path: '/auth',
  });
};

const readRefreshToken = (req, bodyToken) => {
  if (req.cookies && req.cookies[REFRESH_COOKIE_NAME]) {
    return req.cookies[REFRESH_COOKIE_NAME];
  }
  return bodyToken;
};

const normalizeTwoFactorToken = (token) => (token
  ? token.toString().replace(/\s+/g, '')
  : '');

const verifyTwoFactorCode = (secret, token) => {
  const normalizedToken = normalizeTwoFactorToken(token);
  if (!secret || !normalizedToken) {
    return false;
  }

  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: normalizedToken,
    window: 1,
  });
};

const parseTtl = (ttl) => {
  // Supports m, h, d suffix or plain milliseconds
  const match = /^(\d+)(m|h|d)?$/i.exec(ttl);
  if (!match) {
    const numericTtl = Number(ttl);
    if (Number.isNaN(numericTtl)) {
      throw new Error(`Invalid TTL format: ${ttl}`);
    }
    return numericTtl;
  }
  const value = Number(match[1]);
  const unit = (match[2] || '').toLowerCase();
  switch (unit) {
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return value;
  }
};

const sanitizeUser = (user) => ({
  id: user.id,
  name: user.name,
  username: user.username,
  email: user.email,
  role: user.role,
  employeeID: user.employeeID,
  administrator: user.administrator,
  active: user.active,
  lastLoginAt: user.lastLoginAt,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  twoFactorEnabled: Boolean(user.twoFactorEnabled),
});

const signAccessToken = (user) => jwt.sign(
  { userId: user.id, role: user.role, employeeID: user.employeeID ?? null },
  accessTokenSecret,
  { expiresIn: accessTokenExpiresIn },
);

const createRefreshToken = async (userId) => {
  const tokenId = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + parseTtl(refreshTokenExpiresIn));

  await RefreshToken.create({
    user: userId,
    tokenId,
    expiresAt,
  });

  const refreshToken = jwt.sign(
    { userId, tokenId },
    refreshTokenSecret,
    { expiresIn: refreshTokenExpiresIn },
  );

  return { refreshToken, tokenId, expiresAt };
};

router.post('/login', async (req, res, next) => {
  try {
    const { username, password, twoFactorCode } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    const user = await User.findOne({ username: username.toLowerCase(), active: true })
      .select('+twoFactorSecret +twoFactorTempSecret');
    const ipAddress = req.headers['x-forwarded-for']
      ? req.headers['x-forwarded-for'].split(',')[0].trim()
      : req.ip;

    if (!user) {
      await recordAuditEvent({
        event: 'auth.login',
        success: false,
        ipAddress,
        metadata: { username },
      });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.lockedAt) {
      await recordAuditEvent({
        event: 'auth.login.locked',
        success: false,
        userId: user.id,
        userRole: user.role,
        ipAddress,
      });
      return res.status(403).json({ success: false, message: 'Account locked. Contact an administrator.' });
    }

    const passwordMatch = await user.comparePassword(password);

    if (!passwordMatch) {
      await user.incrementFailedLogins();
      await recordAuditEvent({
        event: 'auth.login',
        success: false,
        userId: user.id,
        userRole: user.role,
        ipAddress,
        metadata: { reason: 'invalid_password' },
      });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.twoFactorEnabled) {
      if (!twoFactorCode) {
        await recordAuditEvent({
          event: 'auth.login',
          success: false,
          userId: user.id,
          userRole: user.role,
          ipAddress,
          metadata: { reason: 'two_factor_required' },
        });
        return res.status(401).json({
          success: false,
          message: 'Two-factor authentication code required',
          twoFactorRequired: true,
        });
      }

      const secret = user.get('twoFactorSecret');
      if (!verifyTwoFactorCode(secret, twoFactorCode)) {
        await recordAuditEvent({
          event: 'auth.login',
          success: false,
          userId: user.id,
          userRole: user.role,
          ipAddress,
          metadata: { reason: 'invalid_two_factor' },
        });
        return res.status(401).json({
          success: false,
          message: 'Invalid two-factor authentication code',
          twoFactorRequired: true,
        });
      }
    }

    await user.resetFailedLoginAttempts();
    user.lastLoginAt = new Date();
    await user.save();

    const accessToken = signAccessToken(user);
    const { refreshToken, expiresAt } = await createRefreshToken(user.id);
    setRefreshCookie(res, refreshToken, expiresAt);

    await recordAuditEvent({
      event: 'auth.login',
      success: true,
      userId: user.id,
      userRole: user.role,
      ipAddress,
    });

    return res.json({
      success: true,
      accessToken,
      user: sanitizeUser(user),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const incomingToken = readRefreshToken(req, req.body?.refreshToken);

    if (!incomingToken) {
      return res.status(400).json({ success: false, message: 'Refresh token is required' });
    }

    const decoded = jwt.verify(incomingToken, refreshTokenSecret);

    const tokenRecord = await RefreshToken.findOne({ tokenId: decoded.tokenId, user: decoded.userId });

    if (!tokenRecord || tokenRecord.revokedAt) {
      return res.status(401).json({ success: false, message: 'Refresh token is invalid or revoked' });
    }

    if (tokenRecord.expiresAt < new Date()) {
      return res.status(401).json({ success: false, message: 'Refresh token expired' });
    }

    const user = await User.findById(decoded.userId);

    if (!user || !user.active) {
      await recordAuditEvent({
        event: 'auth.refresh',
        success: false,
        userId: decoded.userId,
        metadata: { reason: 'user_inactive' },
      });
      return res.status(401).json({ success: false, message: 'User no longer active' });
    }

    tokenRecord.revokedAt = new Date();
    const nextToken = await createRefreshToken(user.id);
    tokenRecord.replacedByTokenId = nextToken.tokenId;
    await tokenRecord.save();

    const accessToken = signAccessToken(user);

    await recordAuditEvent({
      event: 'auth.refresh',
      success: true,
      userId: user.id,
      userRole: user.role,
    });

    setRefreshCookie(res, nextToken.refreshToken, nextToken.expiresAt);

    return res.json({
      success: true,
      accessToken,
      user: sanitizeUser(user),
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Refresh token is invalid or expired' });
    }
    return next(error);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const incomingToken = readRefreshToken(req, req.body?.refreshToken);

    if (!incomingToken) {
      clearRefreshCookie(res);
      return res.json({ success: true });
    }

    let decoded;
    try {
      decoded = jwt.verify(incomingToken, refreshTokenSecret);
    } catch (error) {
      clearRefreshCookie(res);
      if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
        return res.status(200).json({ success: true });
      }
      throw error;
    }

    const tokenRecord = await RefreshToken.findOne({ tokenId: decoded.tokenId, user: decoded.userId });

    if (tokenRecord && !tokenRecord.revokedAt) {
      tokenRecord.revokedAt = new Date();
      await tokenRecord.save();
    }

    clearRefreshCookie(res);

    await recordAuditEvent({
      event: 'auth.logout',
      success: true,
      userId: decoded.userId,
    });

    return res.json({ success: true });
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      clearRefreshCookie(res);
      return res.status(200).json({ success: true });
    }
    return next(error);
  }
});

router.post('/2fa/setup', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('+twoFactorSecret +twoFactorTempSecret');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const secret = speakeasy.generateSecret({
      length: 32,
      name: `Bridges Physiotherapy (${user.name || user.username})`,
    });

    user.twoFactorTempSecret = secret.base32;
    await user.save();

    await recordAuditEvent({
      event: 'auth.2fa.setup',
      success: true,
      actorId: req.user.id,
      actorRole: req.user.role,
    });

    return res.json({
      success: true,
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/2fa/verify', authenticate, async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: 'A verification token is required' });
    }

    const user = await User.findById(req.user.id).select('+twoFactorSecret +twoFactorTempSecret');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const secret = user.get('twoFactorTempSecret') || user.get('twoFactorSecret');
    if (!secret) {
      return res.status(400).json({ success: false, message: 'Start setup before verifying' });
    }

    if (!verifyTwoFactorCode(secret, token)) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
    }

    user.twoFactorSecret = secret;
    user.twoFactorTempSecret = undefined;
    user.twoFactorEnabled = true;
    user.twoFactorVerifiedAt = new Date();
    await user.save();

    await recordAuditEvent({
      event: 'auth.2fa.enable',
      success: true,
      actorId: req.user.id,
      actorRole: req.user.role,
    });

    return res.json({
      success: true,
      user: sanitizeUser(user),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/2fa/disable', authenticate, async (req, res, next) => {
  try {
    const { token } = req.body;
    const user = await User.findById(req.user.id).select('+twoFactorSecret');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.twoFactorEnabled) {
      return res.json({ success: true, user: sanitizeUser(user) });
    }

    if (!token || !verifyTwoFactorCode(user.get('twoFactorSecret'), token)) {
      return res.status(400).json({ success: false, message: 'A valid authentication code is required to disable 2FA' });
    }

    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    user.twoFactorTempSecret = undefined;
    user.twoFactorVerifiedAt = undefined;
    await user.save();

    await recordAuditEvent({
      event: 'auth.2fa.disable',
      success: true,
      actorId: req.user.id,
      actorRole: req.user.role,
    });

    return res.json({
      success: true,
      user: sanitizeUser(user),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  const normalizedEmail = email.toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });

  if (user) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = new Date(Date.now() + (60 * 60 * 1000)); // 1 hour
    await user.save();

    const resetLinkBase = process.env.FRONTEND_BASE_URL
      || 'http://localhost:3000/reset-password';
    const resetLink = `${resetLinkBase}?token=${rawToken}&email=${encodeURIComponent(normalizedEmail)}`;

    await sendTransactionalEmail({
      to: normalizedEmail,
      subject: 'Reset your Bridges Physiotherapy password',
      html: `<p>Hello ${user.name || user.username},</p>
        <p>We received a request to reset your password. Click the button below to continue.</p>
        <p><a href="${resetLink}">Reset my password</a></p>
        <p>If you did not request this change you can ignore this email.</p>`,
      text: `Reset your password: ${resetLink}`,
      patientId: undefined,
      metadata: { type: 'password_reset' },
    });

    await recordAuditEvent({
      event: 'auth.password_reset.request',
      success: true,
      userId: user.id,
    });
  }

  return res.status(202).json({
    success: true,
    message: 'If the account exists, a password reset link will be sent',
  });
});

router.post('/reset-password', async (req, res) => {
  const { email, token, newPassword } = req.body;

  if (!email || !token || !newPassword) {
    return res.status(400).json({ success: false, message: 'email, token and newPassword are required' });
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    email: email.toLowerCase(),
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: new Date() },
  });

  if (!user) {
    await recordAuditEvent({
      event: 'auth.password_reset.confirm',
      success: false,
      metadata: { reason: 'invalid_or_expired_token' },
    });
    return res.status(400).json({ success: false, message: 'Reset link invalid or expired' });
  }

  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.failedLoginAttempts = 0;
  user.active = true;
  await user.save();

  await recordAuditEvent({
    event: 'auth.password_reset.confirm',
    success: true,
    userId: user.id,
  });

  return res.json({ success: true });
});

router.post('/register', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const {
      name,
      username,
      email,
      password,
      role = 'therapist',
      administrator = false,
    } = req.body;

    if (!name || !username || !password || !email) {
      return res.status(400).json({ success: false, message: 'name, username, email and password are required' });
    }

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const normalizedUsername = username.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();
    const MIN_PASSWORD_LENGTH = 8;
    if (!trimmedName) {
      return res.status(400).json({ success: false, message: 'Name cannot be blank' });
    }
    if (!normalizedUsername) {
      return res.status(400).json({ success: false, message: 'Username cannot be blank' });
    }
    if (!normalizedEmail) {
      return res.status(400).json({ success: false, message: 'Email cannot be blank' });
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
      });
    }

    const allowedRoles = ['admin', 'therapist', 'receptionist'];
    const normalizeRole = (value) => (allowedRoles.includes(value) ? value : 'therapist');
    let resolvedRole = normalizeRole(role);
    if (administrator || resolvedRole === 'admin') {
      resolvedRole = 'admin';
    }
    const isAdministrator = resolvedRole === 'admin';

    const employeeIdValue = await Counter.next('employee_id', 1);

    const user = await User.create({
      name: trimmedName,
      username: normalizedUsername,
      email: normalizedEmail,
      password,
      role: resolvedRole,
      employeeID: employeeIdValue,
      administrator: isAdministrator,
    });

    await recordAuditEvent({
      event: 'user.create',
      success: true,
      actorId: req.user.id,
      actorRole: req.user.role,
      userId: user.id,
      userRole: user.role,
    });

    return res.status(201).json({
      success: true,
      user: sanitizeUser(user),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Username or email already in use' });
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors || {}).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: messages[0] || 'Invalid user data',
      });
    }
    return next(error);
  }
});

module.exports = router;

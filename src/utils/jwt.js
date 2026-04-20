import jwt from 'jsonwebtoken';

/**
 * Generate access token with multi-tenant payload.
 * @param {Object} payload - { accountId, userId, tenantId, role, companies }
 */
export const generateAccessToken = (payload) => {
  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '8h' }
  );
};

export const generateRefreshToken = (accountId) => {
  return jwt.sign(
    { accountId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d' }
  );
};

export const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

export const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

export const setTokenCookies = (res, accessToken, refreshToken) => {
  const isProduction = process.env.NODE_ENV === 'production';
  // If COOKIE_SECURE is explicitly false, respect it (useful for local testing with HTTPS if needed)
  const cookieSecure = process.env.COOKIE_SECURE !== 'false' && isProduction;

  const cookieOptions = {
    httpOnly: true, // Prevents JS access (XSS protection)
    secure: cookieSecure, // Only sends over HTTPS
    sameSite: isProduction ? 'strict' : 'lax', // CSRF protection
  };

  res.cookie('accessToken', accessToken, {
    ...cookieOptions,
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
  });

  res.cookie('refreshToken', refreshToken, {
    ...cookieOptions,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/api/auth/refresh',
  });
};

export const clearTokenCookies = (res) => {
  res.cookie('accessToken', '', {
    httpOnly: true,
    expires: new Date(0),
  });

  res.cookie('refreshToken', '', {
    httpOnly: true,
    expires: new Date(0),
    path: '/api/auth/refresh',
  });
};

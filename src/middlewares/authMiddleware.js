const userModel = require('../models/userModel');

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const val = decodeURIComponent(pair.slice(idx + 1).trim());
    cookies[key] = val;
  }
  return cookies;
}

function extractToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.kult_session) {
    return cookies.kult_session;
  }
  return null;
}

function getAuthenticatedUser(req) {
  const token = extractToken(req);
  if (!token) return null;
  const user = userModel.getSessionUser(token);
  if (user) {
    req.user = user;
    req.sessionToken = token;
  }
  return user;
}

function requireAuth(req, res, allowedRoles = ['admin', 'barber']) {
  const user = getAuthenticatedUser(req);
  if (!user) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      error: 'No autenticado. Inicia sesión para acceder a las funciones administrativas.'
    }));
    return null;
  }
  if (Array.isArray(allowedRoles) && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      error: 'Permisos insuficientes para realizar esta operación.'
    }));
    return null;
  }
  return user;
}

module.exports = {
  parseCookies,
  extractToken,
  getAuthenticatedUser,
  requireAuth
};

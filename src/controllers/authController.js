const userModel = require('../models/userModel');
const { sendJson, readJsonBody } = require('../utils/http');
const { getAuthenticatedUser, extractToken } = require('../middlewares/authMiddleware');
const env = require('../config/env');

const authController = {
  async login(req, res) {
    try {
      const body = await readJsonBody(req);
      const email = (body.email || '').trim();
      const password = body.password || '';

      if (!email || !password) {
        return sendJson(res, 400, { error: 'Ingresa tu correo electrónico y contraseña.' });
      }

      const user = userModel.authenticate(email, password);
      if (!user) {
        return sendJson(res, 401, { error: 'Credenciales inválidas. Verifica tu correo y contraseña.' });
      }

      const { token, expiresAt } = userModel.createSession(user.id);
      const maxAge = env.sessionTtlHours * 3600;
      const cookie = `kult_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;

      sendJson(
        res,
        200,
        {
          message: `Bienvenido, ${user.name}`,
          user,
          token,
          expiresAt
        },
        { 'Set-Cookie': cookie }
      );
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  },

  logout(req, res) {
    const token = extractToken(req);
    if (token) {
      userModel.deleteSession(token);
    }
    const clearCookie = `kult_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
    sendJson(res, 200, { message: 'Sesión cerrada correctamente.' }, { 'Set-Cookie': clearCookie });
  },

  me(req, res) {
    const user = getAuthenticatedUser(req);
    if (!user) {
      return sendJson(res, 401, { authenticated: false, user: null });
    }
    sendJson(res, 200, { authenticated: true, user });
  }
};

module.exports = authController;

const { db } = require('../database/connection');
const { hashPassword, verifyPassword, generateSessionToken } = require('../utils/security');
const env = require('../config/env');

const userModel = {
  findByEmail(email) {
    return db.prepare(`
      SELECT u.*, b.name as barber_name
      FROM users u
      LEFT JOIN barbers b ON u.barber_id = b.id
      WHERE lower(u.email) = lower(?) AND u.active = 1
    `).get(email);
  },

  findById(id) {
    return db.prepare(`
      SELECT u.id, u.name, u.email, u.role, u.barber_id, u.active, u.created_at, b.name as barber_name
      FROM users u
      LEFT JOIN barbers b ON u.barber_id = b.id
      WHERE u.id = ?
    `).get(id);
  },

  authenticate(email, password) {
    const user = this.findByEmail(email);
    if (!user) return null;
    if (!verifyPassword(password, user.password_hash)) return null;
    const { password_hash, ...safeUser } = user;
    return safeUser;
  },

  createSession(userId) {
    // Cleanup expired sessions first
    db.prepare(`DELETE FROM sessions WHERE datetime(expires_at) <= datetime('now')`).run();
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + env.sessionTtlHours * 3600 * 1000).toISOString();
    db.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`).run(token, userId, expiresAt);
    return { token, expiresAt };
  },

  getSessionUser(token) {
    if (!token) return null;
    const row = db.prepare(`
      SELECT s.token, s.expires_at, u.id, u.name, u.email, u.role, u.barber_id, u.active, b.name as barber_name
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN barbers b ON u.barber_id = b.id
      WHERE s.token = ? AND u.active = 1
    `).get(token);
    if (!row) return null;
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      this.deleteSession(token);
      return null;
    }
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      barber_id: row.barber_id,
      barber_name: row.barber_name
    };
  },

  deleteSession(token) {
    if (!token) return;
    db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
  },

  listUsers() {
    return db.prepare(`
      SELECT u.id, u.name, u.email, u.role, u.barber_id, u.active, u.created_at, b.name as barber_name
      FROM users u
      LEFT JOIN barbers b ON u.barber_id = b.id
      ORDER BY u.id ASC
    `).all();
  },

  updateAccount(userId, { name, email, currentPassword, newPassword }) {
    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(Number(userId));
    if (!user) {
      const err = new Error('Usuario no encontrado.');
      err.statusCode = 404;
      throw err;
    }

    if (!currentPassword || !verifyPassword(currentPassword, user.password_hash)) {
      const err = new Error('La contraseña actual es incorrecta.');
      err.statusCode = 400;
      throw err;
    }

    const nextName = name && name.trim() ? name.trim() : user.name;
    const nextEmail = email && email.trim() ? email.trim() : user.email;
    const nextHash = newPassword && newPassword.trim() ? hashPassword(newPassword.trim()) : user.password_hash;

    db.prepare(`
      UPDATE users
      SET name = ?, email = ?, password_hash = ?
      WHERE id = ?
    `).run(nextName, nextEmail, nextHash, Number(userId));

    return this.findById(userId);
  },

  upsertBarberUser({ barberId, name, email, password, active = 1 }) {
    if (!email) return null;
    const existing = db.prepare(`SELECT id FROM users WHERE barber_id = ? OR lower(email) = lower(?)`).get(barberId, email);
    if (existing) {
      if (password) {
        db.prepare(`
          UPDATE users SET name = ?, email = ?, password_hash = ?, barber_id = ?, active = ? WHERE id = ?
        `).run(name, email, hashPassword(password), barberId, active ? 1 : 0, existing.id);
      } else {
        db.prepare(`
          UPDATE users SET name = ?, email = ?, barber_id = ?, active = ? WHERE id = ?
        `).run(name, email, barberId, active ? 1 : 0, existing.id);
      }
      return existing.id;
    } else if (password) {
      const res = db.prepare(`
        INSERT INTO users (name, email, password_hash, role, barber_id, active)
        VALUES (?, ?, ?, 'barber', ?, ?)
      `).run(name, email, hashPassword(password), barberId, active ? 1 : 0);
      return res.lastInsertRowid;
    }
    return null;
  }
};

module.exports = userModel;

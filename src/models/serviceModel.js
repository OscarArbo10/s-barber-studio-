const { db } = require('../database/connection');

const serviceModel = {
  listCategories({ onlyActive = false } = {}) {
    const sql = onlyActive
      ? `SELECT * FROM categories WHERE active = 1 ORDER BY sort_order ASC, id ASC`
      : `SELECT * FROM categories ORDER BY sort_order ASC, id ASC`;
    return db.prepare(sql).all();
  },

  createCategory({ name, slug, sort_order = 10, active = 1 }) {
    const cleanSlug = (slug || name)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const res = db.prepare(`
      INSERT INTO categories (slug, name, sort_order, active) VALUES (?, ?, ?, ?)
    `).run(cleanSlug, name.trim(), Number(sort_order) || 10, active ? 1 : 0);
    return db.prepare(`SELECT * FROM categories WHERE id = ?`).get(res.lastInsertRowid);
  },

  listServices({ onlyActive = false } = {}) {
    const where = onlyActive ? `WHERE s.active = 1 AND c.active = 1` : ``;
    return db.prepare(`
      SELECT
        s.*,
        c.name as category_name,
        c.slug as category_slug
      FROM services s
      JOIN categories c ON s.category_id = c.id
      ${where}
      ORDER BY s.sort_order ASC, s.id ASC
    `).all();
  },

  getById(id) {
    return db.prepare(`
      SELECT
        s.*,
        c.name as category_name,
        c.slug as category_slug
      FROM services s
      JOIN categories c ON s.category_id = c.id
      WHERE s.id = ?
    `).get(id);
  },

  create(data) {
    const res = db.prepare(`
      INSERT INTO services (
        category_id, name, description, price, duration_minutes,
        badge, feature_icon, feature_label, image_url, active, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      Number(data.category_id),
      data.name.trim(),
      data.description.trim(),
      Number(data.price),
      Number(data.duration_minutes),
      (data.badge || '').trim(),
      (data.feature_icon || 'brush').trim(),
      (data.feature_label || 'Acabado premium').trim(),
      (data.image_url || '').trim(),
      data.active !== undefined ? (data.active ? 1 : 0) : 1,
      Number(data.sort_order || 10)
    );
    const serviceId = res.lastInsertRowid;

    // If barber_ids provided, link them; otherwise assign all active barbers by default
    const barberIds = Array.isArray(data.barber_ids)
      ? data.barber_ids
      : db.prepare(`SELECT id FROM barbers WHERE active = 1`).all().map(b => b.id);

    const insertLink = db.prepare(`INSERT OR IGNORE INTO barber_services (barber_id, service_id) VALUES (?, ?)`);
    for (const bId of barberIds) {
      insertLink.run(Number(bId), serviceId);
    }

    return this.getById(serviceId);
  },

  update(id, data) {
    const existing = this.getById(id);
    if (!existing) return null;

    db.prepare(`
      UPDATE services
      SET
        category_id = ?,
        name = ?,
        description = ?,
        price = ?,
        duration_minutes = ?,
        badge = ?,
        feature_icon = ?,
        feature_label = ?,
        image_url = ?,
        active = ?,
        sort_order = ?
      WHERE id = ?
    `).run(
      data.category_id !== undefined ? Number(data.category_id) : existing.category_id,
      data.name !== undefined ? data.name.trim() : existing.name,
      data.description !== undefined ? data.description.trim() : existing.description,
      data.price !== undefined ? Number(data.price) : existing.price,
      data.duration_minutes !== undefined ? Number(data.duration_minutes) : existing.duration_minutes,
      data.badge !== undefined ? data.badge.trim() : existing.badge,
      data.feature_icon !== undefined ? data.feature_icon.trim() : existing.feature_icon,
      data.feature_label !== undefined ? data.feature_label.trim() : existing.feature_label,
      data.image_url !== undefined ? data.image_url.trim() : existing.image_url,
      data.active !== undefined ? (data.active ? 1 : 0) : existing.active,
      data.sort_order !== undefined ? Number(data.sort_order) : existing.sort_order,
      Number(id)
    );

    return this.getById(id);
  },

  deleteOrDeactivate(id) {
    const hasBookings = db.prepare(`SELECT COUNT(*) as cnt FROM bookings WHERE service_id = ?`).get(id);
    if (hasBookings && hasBookings.cnt > 0) {
      db.prepare(`UPDATE services SET active = 0 WHERE id = ?`).run(id);
      return { deleted: false, deactivated: true };
    }
    db.prepare(`DELETE FROM barber_services WHERE service_id = ?`).run(id);
    db.prepare(`DELETE FROM services WHERE id = ?`).run(id);
    return { deleted: true, deactivated: false };
  }
};

module.exports = serviceModel;

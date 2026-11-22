const { db } = require('../database/connection');

const clientModel = {
  listClients({ search = '' } = {}) {
    const params = [];
    let where = '';
    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      where = `WHERE c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?`;
      params.push(q, q, q);
    }

    return db.prepare(`
      SELECT
        c.*,
        COUNT(b.id) as total_bookings,
        SUM(CASE WHEN b.status IN ('confirmed', 'completed') THEN 1 ELSE 0 END) as active_bookings,
        COALESCE(SUM(CASE WHEN b.status IN ('confirmed', 'completed') THEN b.price ELSE 0 END), 0) as total_spent,
        MAX(b.date) as last_visit_date
      FROM clients c
      LEFT JOIN bookings b ON b.client_id = c.id
      ${where}
      GROUP BY c.id
      ORDER BY c.updated_at DESC, c.id DESC
    `).all(...params);
  },

  getById(id) {
    const client = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(Number(id));
    if (!client) return null;

    const bookings = db.prepare(`
      SELECT
        bk.*,
        s.name as service_name,
        c.name as category_name,
        br.name as barber_name,
        br.specialty as barber_specialty
      FROM bookings bk
      JOIN services s ON bk.service_id = s.id
      JOIN categories c ON s.category_id = c.id
      JOIN barbers br ON bk.barber_id = br.id
      WHERE bk.client_id = ?
      ORDER BY bk.date DESC, bk.start_time DESC
    `).all(Number(id));

    return {
      ...client,
      bookings
    };
  },

  findOrCreate({ name, phone, email = '', notes = '' }) {
    const cleanPhone = phone.trim();
    const cleanName = name.trim();
    const cleanEmail = (email || '').trim();
    const existing = db.prepare(`
      SELECT * FROM clients
      WHERE replace(replace(phone, ' ', ''), '-', '') = replace(replace(?, ' ', ''), '-', '')
      LIMIT 1
    `).get(cleanPhone);

    if (existing) {
      db.prepare(`
        UPDATE clients
        SET
          name = ?,
          email = CASE WHEN ? != '' THEN ? ELSE email END,
          notes = CASE WHEN ? != '' THEN ? ELSE notes END,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(cleanName, cleanEmail, cleanEmail, notes, notes, existing.id);
      return db.prepare(`SELECT * FROM clients WHERE id = ?`).get(existing.id);
    }

    const res = db.prepare(`
      INSERT INTO clients (name, phone, email, notes)
      VALUES (?, ?, ?, ?)
    `).run(cleanName, cleanPhone, cleanEmail, notes);

    return db.prepare(`SELECT * FROM clients WHERE id = ?`).get(res.lastInsertRowid);
  },

  update(id, data) {
    const existing = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(Number(id));
    if (!existing) return null;
    db.prepare(`
      UPDATE clients
      SET
        name = ?,
        phone = ?,
        email = ?,
        notes = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      data.name !== undefined ? data.name.trim() : existing.name,
      data.phone !== undefined ? data.phone.trim() : existing.phone,
      data.email !== undefined ? data.email.trim() : existing.email,
      data.notes !== undefined ? data.notes.trim() : existing.notes,
      Number(id)
    );
    return this.getById(id);
  }
};

module.exports = clientModel;

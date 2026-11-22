const { db, withTransaction } = require('../database/connection');
const userModel = require('./userModel');

const barberModel = {
  listBarbers({ onlyActive = false } = {}) {
    const where = onlyActive ? `WHERE b.active = 1` : ``;
    const barbers = db.prepare(`
      SELECT
        b.*,
        (
          SELECT COUNT(*) FROM bookings bk
          WHERE bk.barber_id = b.id AND bk.status IN ('confirmed', 'completed')
        ) as total_bookings
      FROM barbers b
      ${where}
      ORDER BY b.sort_order ASC, b.id ASC
    `).all();

    const serviceLinks = db.prepare(`
      SELECT bs.barber_id, bs.service_id, s.name as service_name
      FROM barber_services bs
      JOIN services s ON bs.service_id = s.id
    `).all();

    const hours = db.prepare(`
      SELECT * FROM working_hours WHERE barber_id IS NOT NULL ORDER BY day_of_week ASC
    `).all();

    return barbers.map(b => {
      const bServices = serviceLinks.filter(l => l.barber_id === b.id);
      const bHours = hours.filter(h => h.barber_id === b.id);
      return {
        ...b,
        service_ids: bServices.map(s => s.service_id),
        services: bServices,
        working_hours: bHours
      };
    });
  },

  getById(id) {
    const barber = db.prepare(`SELECT * FROM barbers WHERE id = ?`).get(id);
    if (!barber) return null;
    const bServices = db.prepare(`
      SELECT bs.service_id, s.name as service_name
      FROM barber_services bs
      JOIN services s ON bs.service_id = s.id
      WHERE bs.barber_id = ?
    `).all(id);
    const bHours = db.prepare(`
      SELECT * FROM working_hours WHERE barber_id = ? ORDER BY day_of_week ASC
    `).all(id);
    return {
      ...barber,
      service_ids: bServices.map(s => s.service_id),
      services: bServices,
      working_hours: bHours
    };
  },

  create(data) {
    return withTransaction(() => {
      const res = db.prepare(`
        INSERT INTO barbers (
          name, specialty, bio, avatar_url, rating, reviews_count,
          email, phone, active, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.name.trim(),
        data.specialty.trim(),
        (data.bio || '').trim(),
        (data.avatar_url || '').trim(),
        Number(data.rating || 5.0),
        Number(data.reviews_count || 1),
        (data.email || '').trim(),
        (data.phone || '').trim(),
        data.active !== undefined ? (data.active ? 1 : 0) : 1,
        Number(data.sort_order || 10)
      );
      const barberId = res.lastInsertRowid;

      // Assign services
      const serviceIds = Array.isArray(data.service_ids) && data.service_ids.length > 0
        ? data.service_ids
        : db.prepare(`SELECT id FROM services WHERE active = 1`).all().map(s => s.id);
      const insertBS = db.prepare(`INSERT OR IGNORE INTO barber_services (barber_id, service_id) VALUES (?, ?)`);
      for (const sId of serviceIds) {
        insertBS.run(barberId, Number(sId));
      }

      // Copy default studio hours if working_hours not provided
      const generalHours = db.prepare(`SELECT * FROM working_hours WHERE barber_id IS NULL ORDER BY day_of_week ASC`).all();
      const insertWH = db.prepare(`
        INSERT INTO working_hours (barber_id, day_of_week, is_working, start_time, end_time, break_start, break_end)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      if (Array.isArray(data.working_hours) && data.working_hours.length === 7) {
        for (const wh of data.working_hours) {
          insertWH.run(
            barberId,
            Number(wh.day_of_week),
            wh.is_working ? 1 : 0,
            wh.start_time || '09:30',
            wh.end_time || '20:00',
            wh.break_start || '14:00',
            wh.break_end || '15:00'
          );
        }
      } else {
        for (const gh of generalHours) {
          insertWH.run(
            barberId,
            gh.day_of_week,
            gh.is_working,
            gh.start_time,
            gh.end_time,
            gh.break_start,
            gh.break_end
          );
        }
      }

      if (data.email) {
        userModel.upsertBarberUser({
          barberId,
          name: data.name.trim(),
          email: data.email.trim(),
          password: data.password || 'KultBarber2026!',
          active: data.active !== undefined ? data.active : 1
        });
      }

      return this.getById(barberId);
    });
  },

  update(id, data) {
    const existing = this.getById(id);
    if (!existing) return null;

    return withTransaction(() => {
      db.prepare(`
        UPDATE barbers
        SET
          name = ?,
          specialty = ?,
          bio = ?,
          avatar_url = ?,
          rating = ?,
          email = ?,
          phone = ?,
          active = ?,
          sort_order = ?
        WHERE id = ?
      `).run(
        data.name !== undefined ? data.name.trim() : existing.name,
        data.specialty !== undefined ? data.specialty.trim() : existing.specialty,
        data.bio !== undefined ? data.bio.trim() : existing.bio,
        data.avatar_url !== undefined ? data.avatar_url.trim() : existing.avatar_url,
        data.rating !== undefined ? Number(data.rating) : existing.rating,
        data.email !== undefined ? data.email.trim() : existing.email,
        data.phone !== undefined ? data.phone.trim() : existing.phone,
        data.active !== undefined ? (data.active ? 1 : 0) : existing.active,
        data.sort_order !== undefined ? Number(data.sort_order) : existing.sort_order,
        Number(id)
      );

      if (Array.isArray(data.service_ids)) {
        db.prepare(`DELETE FROM barber_services WHERE barber_id = ?`).run(Number(id));
        const insertBS = db.prepare(`INSERT OR IGNORE INTO barber_services (barber_id, service_id) VALUES (?, ?)`);
        for (const sId of data.service_ids) {
          insertBS.run(Number(id), Number(sId));
        }
      }

      if (Array.isArray(data.working_hours)) {
        const upsertWH = db.prepare(`
          INSERT INTO working_hours (barber_id, day_of_week, is_working, start_time, end_time, break_start, break_end)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(barber_id, day_of_week) DO UPDATE SET
            is_working = excluded.is_working,
            start_time = excluded.start_time,
            end_time = excluded.end_time,
            break_start = excluded.break_start,
            break_end = excluded.break_end
        `);
        for (const wh of data.working_hours) {
          upsertWH.run(
            Number(id),
            Number(wh.day_of_week),
            wh.is_working ? 1 : 0,
            wh.start_time || '09:30',
            wh.end_time || '20:00',
            wh.break_start || '',
            wh.break_end || ''
          );
        }
      }

      if (data.email || existing.email) {
        userModel.upsertBarberUser({
          barberId: Number(id),
          name: data.name !== undefined ? data.name.trim() : existing.name,
          email: data.email !== undefined ? data.email.trim() : existing.email,
          password: data.password || null,
          active: data.active !== undefined ? data.active : existing.active
        });
      }

      return this.getById(id);
    });
  }
};

module.exports = barberModel;

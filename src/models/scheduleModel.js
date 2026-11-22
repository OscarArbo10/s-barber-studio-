const { db, withTransaction } = require('../database/connection');

const scheduleModel = {
  getStudioWorkingHours() {
    return db.prepare(`
      SELECT * FROM working_hours
      WHERE barber_id IS NULL
      ORDER BY day_of_week ASC
    `).all();
  },

  getBarberWorkingHours(barberId) {
    return db.prepare(`
      SELECT * FROM working_hours
      WHERE barber_id = ?
      ORDER BY day_of_week ASC
    `).all(Number(barberId));
  },

  updateWorkingHours(barberId, hoursArray) {
    return withTransaction(() => {
      const targetBarberId = barberId ? Number(barberId) : null;
      db.prepare(`
        DELETE FROM working_hours
        WHERE (barber_id = ? OR (? IS NULL AND barber_id IS NULL))
      `).run(targetBarberId, targetBarberId);

      const insert = db.prepare(`
        INSERT INTO working_hours (barber_id, day_of_week, is_working, start_time, end_time, break_start, break_end)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const h of hoursArray) {
        insert.run(
          targetBarberId,
          Number(h.day_of_week),
          h.is_working ? 1 : 0,
          h.start_time || '09:30',
          h.end_time || '20:00',
          h.break_start || '',
          h.break_end || ''
        );
      }

      return targetBarberId
        ? this.getBarberWorkingHours(targetBarberId)
        : this.getStudioWorkingHours();
    });
  },

  listBlocks({ barberId, fromDate, toDate } = {}) {
    const conditions = [];
    const params = [];

    if (barberId !== undefined && barberId !== '' && barberId !== null) {
      conditions.push(`(ab.barber_id IS NULL OR ab.barber_id = ?)`);
      params.push(Number(barberId));
    }
    if (fromDate) {
      conditions.push(`ab.end_date >= ?`);
      params.push(fromDate);
    }
    if (toDate) {
      conditions.push(`ab.start_date <= ?`);
      params.push(toDate);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return db.prepare(`
      SELECT
        ab.*,
        b.name as barber_name
      FROM availability_blocks ab
      LEFT JOIN barbers b ON ab.barber_id = b.id
      ${where}
      ORDER BY ab.start_date ASC, ab.start_time ASC
    `).all(...params);
  },

  createBlock(data) {
    const barberId = data.barber_id ? Number(data.barber_id) : null;
    const res = db.prepare(`
      INSERT INTO availability_blocks (
        barber_id, type, title, start_date, end_date, start_time, end_time, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      barberId,
      data.type || 'special',
      data.title.trim(),
      data.start_date,
      data.end_date || data.start_date,
      data.start_time || null,
      data.end_time || null,
      (data.notes || '').trim()
    );
    return db.prepare(`
      SELECT ab.*, b.name as barber_name
      FROM availability_blocks ab
      LEFT JOIN barbers b ON ab.barber_id = b.id
      WHERE ab.id = ?
    `).get(res.lastInsertRowid);
  },

  deleteBlock(id) {
    const res = db.prepare(`DELETE FROM availability_blocks WHERE id = ?`).run(Number(id));
    return res.changes > 0;
  }
};

module.exports = scheduleModel;

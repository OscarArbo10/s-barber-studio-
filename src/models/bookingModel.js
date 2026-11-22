const { db } = require('../database/connection');

const bookingModel = {
  listBookings({ search = '', date = '', fromDate = '', toDate = '', barberId = '', serviceId = '', status = '' } = {}) {
    const conditions = [];
    const params = [];

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push(`(cl.name LIKE ? OR cl.phone LIKE ? OR cl.email LIKE ? OR bk.booking_code LIKE ?)`);
      params.push(q, q, q, q);
    }
    if (date) {
      conditions.push(`bk.date = ?`);
      params.push(date);
    }
    if (fromDate) {
      conditions.push(`bk.date >= ?`);
      params.push(fromDate);
    }
    if (toDate) {
      conditions.push(`bk.date <= ?`);
      params.push(toDate);
    }
    if (barberId) {
      conditions.push(`bk.barber_id = ?`);
      params.push(Number(barberId));
    }
    if (serviceId) {
      conditions.push(`bk.service_id = ?`);
      params.push(Number(serviceId));
    }
    if (status) {
      conditions.push(`bk.status = ?`);
      params.push(status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return db.prepare(`
      SELECT
        bk.*,
        cl.name as client_name,
        cl.phone as client_phone,
        cl.email as client_email,
        s.name as service_name,
        s.category_id,
        cat.name as category_name,
        br.name as barber_name,
        br.specialty as barber_specialty,
        br.avatar_url as barber_avatar
      FROM bookings bk
      JOIN clients cl ON bk.client_id = cl.id
      JOIN services s ON bk.service_id = s.id
      JOIN categories cat ON s.category_id = cat.id
      JOIN barbers br ON bk.barber_id = br.id
      ${where}
      ORDER BY bk.date DESC, bk.start_time ASC, bk.id DESC
    `).all(...params);
  },

  getById(id) {
    const booking = db.prepare(`
      SELECT
        bk.*,
        cl.name as client_name,
        cl.phone as client_phone,
        cl.email as client_email,
        s.name as service_name,
        s.category_id,
        cat.name as category_name,
        br.name as barber_name,
        br.specialty as barber_specialty,
        br.avatar_url as barber_avatar
      FROM bookings bk
      JOIN clients cl ON bk.client_id = cl.id
      JOIN services s ON bk.service_id = s.id
      JOIN categories cat ON s.category_id = cat.id
      JOIN barbers br ON bk.barber_id = br.id
      WHERE bk.id = ?
    `).get(Number(id));

    if (!booking) return null;

    const history = db.prepare(`
      SELECT * FROM booking_history
      WHERE booking_id = ?
      ORDER BY id DESC
    `).all(booking.id);

    return {
      ...booking,
      history
    };
  },

  getByCodeOrPhone(query) {
    if (!query || !query.trim()) return [];
    const clean = query.trim();
    const rows = db.prepare(`
      SELECT
        bk.*,
        cl.name as client_name,
        cl.phone as client_phone,
        cl.email as client_email,
        s.name as service_name,
        cat.name as category_name,
        br.name as barber_name,
        br.specialty as barber_specialty,
        br.avatar_url as barber_avatar
      FROM bookings bk
      JOIN clients cl ON bk.client_id = cl.id
      JOIN services s ON bk.service_id = s.id
      JOIN categories cat ON s.category_id = cat.id
      JOIN barbers br ON bk.barber_id = br.id
      WHERE upper(bk.booking_code) = upper(?)
         OR replace(replace(cl.phone, ' ', ''), '-', '') LIKE '%' || replace(replace(?, ' ', ''), '-', '') || '%'
      ORDER BY bk.date DESC, bk.start_time DESC
      LIMIT 15
    `).all(clean, clean);
    return rows;
  },

  addHistory({ bookingId, action, previousStatus = '', newStatus = '', details = '', performedBy = 'Sistema' }) {
    db.prepare(`
      INSERT INTO booking_history (booking_id, action, previous_status, new_status, details, performed_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(Number(bookingId), action, previousStatus, newStatus, details, performedBy);
  }
};

module.exports = bookingModel;

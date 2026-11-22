const { db } = require('../database/connection');

const portfolioModel = {
  listItems({ onlyActive = false, barberId = null, mediaType = null, categorySlug = null } = {}) {
    const conditions = [];
    const params = [];

    if (onlyActive) {
      conditions.push(`p.active = 1`);
    }
    if (barberId && barberId !== 'all') {
      conditions.push(`p.barber_id = ?`);
      params.push(Number(barberId));
    }
    if (mediaType && mediaType !== 'all') {
      conditions.push(`p.media_type = ?`);
      params.push(mediaType);
    }
    if (categorySlug && categorySlug !== 'all') {
      conditions.push(`p.category_slug = ?`);
      params.push(categorySlug);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return db.prepare(`
      SELECT
        p.*,
        b.name as barber_name,
        b.specialty as barber_specialty,
        b.avatar_url as barber_avatar,
        b.rating as barber_rating,
        s.name as service_name,
        s.price as service_price,
        s.duration_minutes as service_duration
      FROM portfolio_items p
      JOIN barbers b ON p.barber_id = b.id
      LEFT JOIN services s ON p.service_id = s.id
      ${where}
      ORDER BY p.featured DESC, p.sort_order ASC, p.id DESC
    `).all(...params);
  },

  getById(id) {
    return db.prepare(`
      SELECT
        p.*,
        b.name as barber_name,
        b.specialty as barber_specialty,
        b.avatar_url as barber_avatar,
        b.rating as barber_rating,
        s.name as service_name,
        s.price as service_price,
        s.duration_minutes as service_duration
      FROM portfolio_items p
      JOIN barbers b ON p.barber_id = b.id
      LEFT JOIN services s ON p.service_id = s.id
      WHERE p.id = ?
    `).get(Number(id));
  },

  create(data) {
    const res = db.prepare(`
      INSERT INTO portfolio_items (
        title, description, media_type, media_url, thumbnail_url,
        category_slug, barber_id, service_id, technique_tag, duration_label,
        featured, likes_count, active, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.title.trim(),
      (data.description || '').trim(),
      data.media_type === 'video' ? 'video' : 'image',
      data.media_url.trim(),
      (data.thumbnail_url || '').trim(),
      (data.category_slug || 'cortes').trim(),
      Number(data.barber_id),
      data.service_id ? Number(data.service_id) : null,
      (data.technique_tag || 'Precision Craft').trim(),
      (data.duration_label || '').trim(),
      data.featured ? 1 : 0,
      Number(data.likes_count || 0),
      data.active !== undefined ? (data.active ? 1 : 0) : 1,
      Number(data.sort_order || 10)
    );
    return this.getById(res.lastInsertRowid);
  },

  update(id, data) {
    const existing = this.getById(id);
    if (!existing) return null;

    db.prepare(`
      UPDATE portfolio_items
      SET
        title = ?,
        description = ?,
        media_type = ?,
        media_url = ?,
        thumbnail_url = ?,
        category_slug = ?,
        barber_id = ?,
        service_id = ?,
        technique_tag = ?,
        duration_label = ?,
        featured = ?,
        active = ?,
        sort_order = ?
      WHERE id = ?
    `).run(
      data.title !== undefined ? data.title.trim() : existing.title,
      data.description !== undefined ? data.description.trim() : existing.description,
      data.media_type !== undefined ? (data.media_type === 'video' ? 'video' : 'image') : existing.media_type,
      data.media_url !== undefined ? data.media_url.trim() : existing.media_url,
      data.thumbnail_url !== undefined ? data.thumbnail_url.trim() : existing.thumbnail_url,
      data.category_slug !== undefined ? data.category_slug.trim() : existing.category_slug,
      data.barber_id !== undefined ? Number(data.barber_id) : existing.barber_id,
      data.service_id !== undefined ? (data.service_id ? Number(data.service_id) : null) : existing.service_id,
      data.technique_tag !== undefined ? data.technique_tag.trim() : existing.technique_tag,
      data.duration_label !== undefined ? data.duration_label.trim() : existing.duration_label,
      data.featured !== undefined ? (data.featured ? 1 : 0) : existing.featured,
      data.active !== undefined ? (data.active ? 1 : 0) : existing.active,
      data.sort_order !== undefined ? Number(data.sort_order) : existing.sort_order,
      Number(id)
    );
    return this.getById(id);
  },

  delete(id) {
    const res = db.prepare(`DELETE FROM portfolio_items WHERE id = ?`).run(Number(id));
    return res.changes > 0;
  },

  incrementLike(id) {
    db.prepare(`UPDATE portfolio_items SET likes_count = likes_count + 1 WHERE id = ?`).run(Number(id));
    return this.getById(id);
  }
};

module.exports = portfolioModel;

const { db } = require('../database/connection');

const settingsModel = {
  getSettings() {
    return db.prepare(`SELECT * FROM business_settings WHERE id = 1`).get();
  },

  updateSettings(data) {
    const current = this.getSettings();
    db.prepare(`
      UPDATE business_settings
      SET
        commercial_name = ?,
        tagline = ?,
        logo_url = ?,
        address = ?,
        phone = ?,
        email = ?,
        instagram = ?,
        whatsapp = ?,
        tiktok = ?,
        currency = ?,
        currency_symbol = ?,
        timezone = ?,
        slot_interval_minutes = ?,
        booking_policy = ?,
        cancellation_policy = ?,
        hygiene_title = ?,
        hygiene_description = ?,
        updated_at = datetime('now')
      WHERE id = 1
    `).run(
      data.commercial_name !== undefined ? data.commercial_name.trim() : current.commercial_name,
      data.tagline !== undefined ? data.tagline.trim() : current.tagline,
      data.logo_url !== undefined ? data.logo_url.trim() : current.logo_url,
      data.address !== undefined ? data.address.trim() : current.address,
      data.phone !== undefined ? data.phone.trim() : current.phone,
      data.email !== undefined ? data.email.trim() : current.email,
      data.instagram !== undefined ? data.instagram.trim() : current.instagram,
      data.whatsapp !== undefined ? data.whatsapp.trim() : current.whatsapp,
      data.tiktok !== undefined ? data.tiktok.trim() : current.tiktok,
      data.currency !== undefined ? data.currency.trim() : current.currency,
      data.currency_symbol !== undefined ? data.currency_symbol.trim() : current.currency_symbol,
      data.timezone !== undefined ? data.timezone.trim() : current.timezone,
      data.slot_interval_minutes !== undefined ? Number(data.slot_interval_minutes) : current.slot_interval_minutes,
      data.booking_policy !== undefined ? data.booking_policy.trim() : current.booking_policy,
      data.cancellation_policy !== undefined ? data.cancellation_policy.trim() : current.cancellation_policy,
      data.hygiene_title !== undefined ? data.hygiene_title.trim() : current.hygiene_title,
      data.hygiene_description !== undefined ? data.hygiene_description.trim() : current.hygiene_description
    );
    return this.getSettings();
  }
};

module.exports = settingsModel;

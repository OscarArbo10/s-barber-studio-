const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const env = require('../config/env');
const { db } = require('../database/connection');

/**
 * External Integrations Service (Email SMTP, WhatsApp Business API, Image Storage).
 * Never fakes external dispatch when credentials are absent; clearly reports configuration status.
 */
const integrationService = {
  getStatus() {
    const smtpConfigured = Boolean(env.smtp.host && env.smtp.user && env.smtp.pass);
    const whatsappConfigured = Boolean(env.whatsapp.apiUrl && env.whatsapp.phoneNumberId && env.whatsapp.accessToken);
    const storageConfigured = true; // Local filesystem upload is always active; cloud provider optional

    return {
      email: {
        configured: smtpConfigured,
        provider: smtpConfigured ? env.smtp.host : 'No configurado (Variables SMTP_HOST, SMTP_USER, SMTP_PASS pendientes)',
        from: env.smtp.from
      },
      whatsapp: {
        configured: whatsappConfigured,
        provider: whatsappConfigured ? 'WhatsApp Business Cloud API' : 'No configurado (Variables WHATSAPP_API_URL, WHATSAPP_ACCESS_TOKEN pendientes)'
      },
      storage: {
        configured: storageConfigured,
        provider: env.storage.provider,
        uploadDir: '/uploads'
      }
    };
  },

  async notifyBookingCreated(booking) {
    const status = this.getStatus();
    const notifications = {
      email: { sent: false, reason: 'SMTP no configurado en .env' },
      whatsapp: { sent: false, reason: 'WhatsApp Business API no configurada en .env' }
    };

    if (status.whatsapp.configured && booking.client_phone) {
      try {
        const endpoint = `${env.whatsapp.apiUrl.replace(/\/$/, '')}/${env.whatsapp.phoneNumberId}/messages`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.whatsapp.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: booking.client_phone.replace(/[^0-9]/g, ''),
            type: 'text',
            text: {
              body: `KULT BARBER STUDIO — Tu cita (${booking.booking_code}) para ${booking.service_name} con ${booking.barber_name} está confirmada el ${booking.date} a las ${booking.start_time}.`
            }
          })
        });
        notifications.whatsapp = {
          sent: response.ok,
          reason: response.ok ? 'Enviado vía WhatsApp Business API' : `HTTP ${response.status}`
        };
      } catch (err) {
        notifications.whatsapp = { sent: false, reason: err.message };
      }
    }

    return notifications;
  },

  saveBase64Image(dataUrl, prefix = 'img') {
    if (!dataUrl || typeof dataUrl !== 'string') {
      throw new Error('Archivo multimedia inválido.');
    }
    const matches = dataUrl.match(/^data:(image\/(png|jpeg|jpg|webp|gif|svg\+xml)|video\/(mp4|webm|quicktime));base64,(.+)$/i);
    if (!matches) {
      throw new Error('Formato no soportado. Usa PNG, JPG, WEBP, MP4 o WEBM.');
    }

    const mimeFull = matches[1].toLowerCase();
    let ext = (matches[2] || matches[3] || 'bin').toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
    if (ext === 'svg+xml') ext = 'svg';
    if (ext === 'quicktime') ext = 'mov';
    const base64Data = matches[4];
    const buffer = Buffer.from(base64Data, 'base64');

    const maxBytes = mimeFull.startsWith('video/') ? 25 * 1024 * 1024 : 8 * 1024 * 1024;
    if (buffer.length > maxBytes) {
      throw new Error('El archivo supera el límite de tamaño permitido (8MB fotos / 25MB videos).');
    }

    const filename = `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;

    if (db.isSupabase && typeof db.uploadMedia === 'function') {
      return db.uploadMedia(filename, mimeFull, base64Data);
    }

    if (!fs.existsSync(env.storage.uploadDir)) {
      fs.mkdirSync(env.storage.uploadDir, { recursive: true });
    }
    const filePath = path.join(env.storage.uploadDir, filename);
    fs.writeFileSync(filePath, buffer);

    return `/uploads/${filename}`;
  }
};

module.exports = integrationService;

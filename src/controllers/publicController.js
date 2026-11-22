const { db } = require('../database/connection');
const env = require('../config/env');
const settingsModel = require('../models/settingsModel');
const serviceModel = require('../models/serviceModel');
const barberModel = require('../models/barberModel');
const scheduleModel = require('../models/scheduleModel');
const bookingModel = require('../models/bookingModel');
const portfolioModel = require('../models/portfolioModel');
const availabilityService = require('../services/availabilityService');
const integrationService = require('../services/integrationService');
const validators = require('../validation/validators');
const { sendJson, readJsonBody } = require('../utils/http');
const { getNowInTimezone, addDays } = require('../utils/dateUtils');
const { getAuthenticatedUser, extractToken } = require('../middlewares/authMiddleware');

const publicController = {
  async getBootstrap(req, res) {
    try {
      if (db.isSupabase && typeof db.callRpcAsync === 'function') {
        const token = extractToken(req);
        const { dateStr: today } = getNowInTimezone(env.defaultTimezone);
        const pDates = [];
        for (let i = 0; i < 14; i++) {
          pDates.push(addDays(today, i));
        }

        const boot = await db.callRpcAsync('sbarber_get_bootstrap', {
          session_token: token || null,
          p_dates: pDates
        });

        const settings = boot.settings || {};
        const categories = boot.categories || [];
        const services = boot.services || [];
        const barbers = boot.barbers || [];
        const studioHours = boot.studioHours || [];
        const portfolio = boot.portfolio || [];
        const user = boot.user || null;

        const firstService = services[0] || null;
        const initialAvailability = firstService
          ? availabilityService.getAvailability({
              serviceId: firstService.id,
              barberId: 'any',
              daysCount: 14,
              preloadedSettings: settings,
              preloadedService: firstService,
              preloadedSnapshot: boot.availabilitySnapshot || null
            })
          : null;

        return sendJson(res, 200, {
          settings,
          categories,
          services,
          barbers,
          studioHours,
          portfolio,
          initialAvailability,
          user
        }, {}, req);
      }

      const settings = settingsModel.getSettings();
      const categories = serviceModel.listCategories({ onlyActive: true });
      const services = serviceModel.listServices({ onlyActive: true });
      const barbers = barberModel.listBarbers({ onlyActive: true });
      const studioHours = scheduleModel.getStudioWorkingHours();
      const portfolio = portfolioModel.listItems({ onlyActive: true });
      const user = getAuthenticatedUser(req);

      const firstServiceId = services[0] ? services[0].id : null;
      const initialAvailability = firstServiceId
        ? availabilityService.getAvailability({
            serviceId: firstServiceId,
            barberId: 'any',
            daysCount: 14
          })
        : null;

      sendJson(res, 200, {
        settings,
        categories,
        services,
        barbers,
        studioHours,
        portfolio,
        initialAvailability,
        user
      });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  },

  likePortfolioItem(req, res, id) {
    try {
      const item = portfolioModel.incrementLike(id);
      if (!item) {
        return sendJson(res, 404, { error: 'Elemento no encontrado.' });
      }
      sendJson(res, 200, { item });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
  },

  async getAvailability(req, res, urlObj) {
    try {
      const serviceId = urlObj.searchParams.get('serviceId');
      const barberId = urlObj.searchParams.get('barberId') || 'any';
      const date = urlObj.searchParams.get('date') || '';
      const startDate = urlObj.searchParams.get('startDate') || '';
      const daysCount = urlObj.searchParams.get('daysCount') || 14;
      const excludeBookingId = urlObj.searchParams.get('excludeBookingId') || null;

      const data = await availabilityService.getAvailabilityAsync({
        serviceId,
        barberId,
        date,
        startDate,
        daysCount,
        excludeBookingId
      });
      sendJson(res, 200, data);
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
  },

  async createBooking(req, res) {
    try {
      const body = await readJsonBody(req);
      const errors = validators.validateBookingInput(body);
      if (errors.length > 0) {
        return sendJson(res, 400, { error: errors[0], errors });
      }

      const booking = availabilityService.createBookingAtomic(body, body.client_name.trim());
      const notifications = await integrationService.notifyBookingCreated(booking);

      sendJson(res, 201, {
        message: 'Reserva confirmada con éxito.',
        booking,
        notifications
      });
    } catch (err) {
      sendJson(res, err.statusCode || 500, { error: err.message });
    }
  },

  lookupBookings(req, res, urlObj) {
    const q = (urlObj.searchParams.get('q') || '').trim();
    const digits = q.replace(/[^0-9]/g, '');
    const isCode = /^(SBS|KLT)-[A-Z0-9]+$/i.test(q);
    if (!isCode && digits.length < 7) {
      return sendJson(res, 400, {
        error: 'Ingresa tu código completo de reserva (ej. SBS-841920) o tu número de teléfono completo (mínimo 7 dígitos).'
      });
    }
    const rawBookings = bookingModel.getByCodeOrPhone(q);
    // Mask sensitive client info in public lookup
    const bookings = rawBookings.map(bk => {
      const phoneStr = String(bk.client_phone || '');
      const maskedPhone = phoneStr.length > 4 ? `•••• ${phoneStr.slice(-4)}` : '••••';
      return {
        booking_code: bk.booking_code,
        date: bk.date,
        start_time: bk.start_time,
        end_time: bk.end_time,
        duration_minutes: bk.duration_minutes,
        price: bk.price,
        status: bk.status,
        service_name: bk.service_name,
        category_name: bk.category_name,
        barber_name: bk.barber_name,
        barber_specialty: bk.barber_specialty,
        barber_avatar: bk.barber_avatar,
        client_name: bk.client_name,
        client_phone_masked: maskedPhone
      };
    });
    sendJson(res, 200, { bookings });
  },

  async cancelClientBooking(req, res) {
    return sendJson(res, 403, {
      error: 'Por seguridad y control de agenda, las cancelaciones solo pueden ser gestionadas directamente por el barbero o administrador de S BARBER STUDIO.'
    });
  }
};

module.exports = publicController;

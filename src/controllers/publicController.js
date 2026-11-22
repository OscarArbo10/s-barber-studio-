const { db } = require('../database/connection');
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
const { getAuthenticatedUser, extractToken } = require('../middlewares/authMiddleware');

const publicController = {
  getBootstrap(req, res) {
    if (db.isSupabase && typeof db.callRpc === 'function') {
      const token = extractToken(req);
      const boot = db.callRpc('sbarber_get_bootstrap', {
        session_token: token || null
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
            preloadedService: firstService
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
      });
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

  getAvailability(req, res, urlObj) {
    try {
      const serviceId = urlObj.searchParams.get('serviceId');
      const barberId = urlObj.searchParams.get('barberId') || 'any';
      const date = urlObj.searchParams.get('date') || '';
      const startDate = urlObj.searchParams.get('startDate') || '';
      const daysCount = urlObj.searchParams.get('daysCount') || 14;
      const excludeBookingId = urlObj.searchParams.get('excludeBookingId') || null;

      const data = availabilityService.getAvailability({
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
    const q = urlObj.searchParams.get('q') || '';
    if (!q.trim() || q.trim().length < 4) {
      return sendJson(res, 400, { error: 'Ingresa tu código de reserva (ej. KLT-841920) o tu número de teléfono.' });
    }
    const bookings = bookingModel.getByCodeOrPhone(q);
    sendJson(res, 200, { bookings });
  },

  async cancelClientBooking(req, res, bookingCode) {
    try {
      const body = await readJsonBody(req);
      const phone = (body.phone || '').replace(/[^0-9]/g, '');
      const matches = bookingModel.getByCodeOrPhone(bookingCode);
      const booking = matches.find(b => b.booking_code.toUpperCase() === bookingCode.toUpperCase());

      if (!booking) {
        return sendJson(res, 404, { error: 'No se encontró una reserva con ese código.' });
      }

      const bookingPhone = (booking.client_phone || '').replace(/[^0-9]/g, '');
      if (!phone || !bookingPhone.endsWith(phone.slice(-7))) {
        return sendJson(res, 403, { error: 'El teléfono ingresado no coincide con el titular de la reserva.' });
      }

      if (booking.status === 'cancelled') {
        return sendJson(res, 400, { error: 'Esta reserva ya se encuentra cancelada.' });
      }

      const updated = availabilityService.updateBookingAtomic(
        booking.id,
        { status: 'cancelled' },
        `Cliente (${booking.client_name})`
      );

      sendJson(res, 200, {
        message: 'Tu reserva ha sido cancelada y el horario fue liberado.',
        booking: updated
      });
    } catch (err) {
      sendJson(res, err.statusCode || 500, { error: err.message });
    }
  }
};

module.exports = publicController;

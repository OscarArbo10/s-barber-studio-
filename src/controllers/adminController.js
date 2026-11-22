const { db } = require('../database/connection');
const env = require('../config/env');
const dashboardService = require('../services/dashboardService');
const availabilityService = require('../services/availabilityService');
const integrationService = require('../services/integrationService');
const bookingModel = require('../models/bookingModel');
const serviceModel = require('../models/serviceModel');
const barberModel = require('../models/barberModel');
const scheduleModel = require('../models/scheduleModel');
const clientModel = require('../models/clientModel');
const settingsModel = require('../models/settingsModel');
const portfolioModel = require('../models/portfolioModel');
const validators = require('../validation/validators');
const { sendJson, readJsonBody } = require('../utils/http');
const { extractToken } = require('../middlewares/authMiddleware');
const { getNowInTimezone, addDays, formatDateLabelEs } = require('../utils/dateUtils');

const adminController = {
  async getOverview(req, res, user) {
    try {
      if (db.isSupabase && typeof db.callRpcAsync === 'function') {
        const token = extractToken(req);
        const { dateStr: today } = getNowInTimezone(env.defaultTimezone);
        const rpcData = await db.callRpcAsync('sbarber_get_admin_overview', {
          session_token: token || null,
          p_today: today,
          p_chart_start: addDays(today, -3),
          p_chart_end: addDays(today, 3)
        });

        if (!rpcData || !rpcData.authenticated || !rpcData.user) {
          return sendJson(res, 401, {
            error: 'No autenticado. Inicia sesión para acceder a las funciones administrativas.'
          }, {}, req);
        }
        if (!['admin', 'barber'].includes(rpcData.user.role)) {
          return sendJson(res, 403, {
            error: 'Permisos insuficientes para realizar esta operación.'
          }, {}, req);
        }

        const settings = rpcData.settings || {};
        const chartMap = new Map((rpcData.chartRows || []).map(r => [r.date, r]));
        const dailyChart = [];
        for (let offset = -3; offset <= 3; offset++) {
          const d = addDays(today, offset);
          const row = chartMap.get(d) || { count: 0, revenue: 0 };
          const lbl = formatDateLabelEs(d);
          dailyChart.push({
            date: d,
            label: `${lbl.dayName} ${lbl.dayNum}`,
            isToday: d === today,
            bookings: Number(row.count) || 0,
            revenue: Number(row.revenue) || 0
          });
        }

        const dashboard = {
          today,
          currencySymbol: settings.currency_symbol || env.defaultCurrencySymbol || '$',
          kpis: rpcData.kpis || {
            todayBookings: 0,
            pendingBookings: 0,
            confirmedBookings: 0,
            cancelledBookings: 0,
            totalRevenue: 0,
            todayRevenue: 0
          },
          topServices: rpcData.topServices || [],
          barberPerformance: rpcData.barberPerformance || [],
          upcomingAppointments: rpcData.upcomingAppointments || [],
          dailyChart
        };

        return sendJson(res, 200, {
          user: rpcData.user,
          dashboard,
          categories: rpcData.categories || [],
          services: rpcData.services || [],
          barbers: rpcData.barbers || [],
          studioHours: rpcData.studioHours || [],
          blocks: rpcData.blocks || [],
          portfolio: rpcData.portfolio || [],
          bookings: rpcData.bookings || [],
          clients: rpcData.clients || [],
          settings,
          integrations: integrationService.getStatus()
        }, {}, req);
      }

      const barberScope = user.role === 'barber' ? user.barber_id : null;
      const dashboard = dashboardService.getDashboardMetrics({ barberId: barberScope });
      const categories = serviceModel.listCategories();
      const services = serviceModel.listServices();
      const barbers = barberModel.listBarbers();
      const studioHours = scheduleModel.getStudioWorkingHours();
      const blocks = scheduleModel.listBlocks({ barberId: barberScope });
      const portfolio = portfolioModel.listItems({ barberId: barberScope });
      const settings = settingsModel.getSettings();
      const integrations = integrationService.getStatus();

      sendJson(res, 200, {
        user,
        dashboard,
        categories,
        services,
        barbers,
        studioHours,
        blocks,
        portfolio,
        settings,
        integrations
      }, {}, req);
    } catch (err) {
      sendJson(res, 500, { error: err.message }, {}, req);
    }
  },

  // --- BOOKINGS MANAGEMENT ---
  listBookings(req, res, urlObj, user) {
    const search = urlObj.searchParams.get('search') || '';
    const date = urlObj.searchParams.get('date') || '';
    const fromDate = urlObj.searchParams.get('fromDate') || '';
    const toDate = urlObj.searchParams.get('toDate') || '';
    const serviceId = urlObj.searchParams.get('serviceId') || '';
    const status = urlObj.searchParams.get('status') || '';
    let barberId = urlObj.searchParams.get('barberId') || '';

    if (user.role === 'barber') {
      barberId = String(user.barber_id);
    }

    const bookings = bookingModel.listBookings({
      search,
      date,
      fromDate,
      toDate,
      barberId,
      serviceId,
      status
    });
    sendJson(res, 200, { bookings });
  },

  getBookingDetail(req, res, id, user) {
    const booking = bookingModel.getById(id);
    if (!booking) {
      return sendJson(res, 404, { error: 'Reserva no encontrada.' });
    }
    if (user.role === 'barber' && booking.barber_id !== user.barber_id) {
      return sendJson(res, 403, { error: 'No tienes permiso para consultar reservas de otro barbero.' });
    }
    sendJson(res, 200, { booking });
  },

  async createBooking(req, res, user) {
    try {
      const body = await readJsonBody(req);
      if (user.role === 'barber') {
        body.barber_id = user.barber_id;
      }
      const errors = validators.validateBookingInput(body);
      if (errors.length > 0) {
        return sendJson(res, 400, { error: errors[0], errors });
      }
      const booking = availabilityService.createBookingAtomic(body, `${user.name} (${user.role})`);
      sendJson(res, 201, { message: 'Reserva registrada correctamente.', booking });
    } catch (err) {
      sendJson(res, err.statusCode || 500, { error: err.message });
    }
  },

  async updateBooking(req, res, id, user) {
    try {
      const existing = bookingModel.getById(id);
      if (!existing) {
        return sendJson(res, 404, { error: 'Reserva no encontrada.' });
      }
      if (user.role === 'barber' && existing.barber_id !== user.barber_id) {
        return sendJson(res, 403, { error: 'Solo puedes gestionar tus propias reservas.' });
      }
      const body = await readJsonBody(req);
      if (user.role === 'barber') {
        body.barber_id = user.barber_id;
      }
      const updated = availabilityService.updateBookingAtomic(id, body, `${user.name} (${user.role})`);
      sendJson(res, 200, { message: 'Reserva actualizada correctamente.', booking: updated });
    } catch (err) {
      sendJson(res, err.statusCode || 500, { error: err.message });
    }
  },

  // --- SERVICES & CATEGORIES MANAGEMENT ---
  async createCategory(req, res) {
    try {
      const body = await readJsonBody(req);
      if (!body.name || !body.name.trim()) {
        return sendJson(res, 400, { error: 'El nombre de la categoría es obligatorio.' });
      }
      const category = serviceModel.createCategory(body);
      sendJson(res, 201, { message: 'Categoría creada.', category });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
  },

  async createService(req, res) {
    try {
      const body = await readJsonBody(req);
      const errors = validators.validateServiceInput(body);
      if (errors.length > 0) {
        return sendJson(res, 400, { error: errors[0], errors });
      }
      const service = serviceModel.create(body);
      sendJson(res, 201, { message: 'Servicio creado correctamente.', service });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
  },

  async updateService(req, res, id) {
    try {
      const body = await readJsonBody(req);
      const service = serviceModel.update(id, body);
      if (!service) {
        return sendJson(res, 404, { error: 'Servicio no encontrado.' });
      }
      sendJson(res, 200, { message: 'Servicio actualizado correctamente.', service });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
  },

  deleteService(req, res, id) {
    try {
      const result = serviceModel.deleteOrDeactivate(id);
      sendJson(res, 200, {
        message: result.deleted
          ? 'Servicio eliminado permanentemente.'
          : 'El servicio tiene reservas históricas asociadas; ha sido desactivado del catálogo.',
        ...result
      });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
  },

  // --- BARBERS MANAGEMENT ---
  async createBarber(req, res) {
    try {
      const body = await readJsonBody(req);
      const errors = validators.validateBarberInput(body);
      if (errors.length > 0) {
        return sendJson(res, 400, { error: errors[0], errors });
      }
      const barber = barberModel.create(body);
      sendJson(res, 201, { message: 'Barbero registrado correctamente.', barber });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
  },

  async updateBarber(req, res, id, user) {
    try {
      if (user.role === 'barber' && Number(id) !== Number(user.barber_id)) {
        return sendJson(res, 403, { error: 'Solo puedes editar tu propio perfil.' });
      }
      const body = await readJsonBody(req);
      const barber = barberModel.update(id, body);
      if (!barber) {
        return sendJson(res, 404, { error: 'Barbero no encontrado.' });
      }
      sendJson(res, 200, { message: 'Perfil de barbero actualizado.', barber });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
  },

  // --- SCHEDULES & AVAILABILITY BLOCKS ---
  async updateWorkingHours(req, res, user) {
    try {
      const body = await readJsonBody(req);
      const targetBarberId = body.barber_id ? Number(body.barber_id) : null;

      if (user.role === 'barber' && targetBarberId !== Number(user.barber_id)) {
        return sendJson(res, 403, { error: 'Solo puedes modificar tu propio horario laboral.' });
      }
      if (!Array.isArray(body.hours)) {
        return sendJson(res, 400, { error: 'Formato de horarios inválido.' });
      }

      const hours = scheduleModel.updateWorkingHours(targetBarberId, body.hours);
      sendJson(res, 200, { message: 'Horarios laborales actualizados.', hours });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
  },

  async createBlock(req, res, user) {
    try {
      const body = await readJsonBody(req);
      if (user.role === 'barber') {
        body.barber_id = user.barber_id;
      }
      const errors = validators.validateBlockInput(body);
      if (errors.length > 0) {
        return sendJson(res, 400, { error: errors[0], errors });
      }
      const block = scheduleModel.createBlock(body);
      sendJson(res, 201, { message: 'Bloqueo de disponibilidad registrado.', block });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
  },

  deleteBlock(req, res, id) {
    const ok = scheduleModel.deleteBlock(id);
    if (!ok) {
      return sendJson(res, 404, { error: 'Bloqueo no encontrado.' });
    }
    sendJson(res, 200, { message: 'Bloqueo eliminado y disponibilidad restaurada.' });
  },

  // --- CLIENTS MANAGEMENT ---
  listClients(req, res, urlObj) {
    const search = urlObj.searchParams.get('search') || '';
    const clients = clientModel.listClients({ search });
    sendJson(res, 200, { clients });
  },

  getClientDetail(req, res, id) {
    const client = clientModel.getById(id);
    if (!client) {
      return sendJson(res, 404, { error: 'Cliente no encontrado.' });
    }
    sendJson(res, 200, { client });
  },

  async updateClient(req, res, id) {
    try {
      const body = await readJsonBody(req);
      const client = clientModel.update(id, body);
      if (!client) {
        return sendJson(res, 404, { error: 'Cliente no encontrado.' });
      }
      sendJson(res, 200, { message: 'Datos del cliente actualizados.', client });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
  },

  // --- BUSINESS SETTINGS & IMAGE UPLOAD ---
  async updateSettings(req, res) {
    try {
      const body = await readJsonBody(req);
      const settings = settingsModel.updateSettings(body);
      sendJson(res, 200, { message: 'Configuración del negocio actualizada.', settings });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
  },

  async uploadImage(req, res) {
    try {
      const body = await readJsonBody(req);
      const url = integrationService.saveBase64Image(body.dataUrl, body.prefix || 'kult');
      sendJson(res, 201, { message: 'Archivo multimedia cargado.', url });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
  },

  // --- PORTFOLIO (PHOTOS & VIDEOS) MANAGEMENT ---
  async createPortfolioItem(req, res, user) {
    try {
      const body = await readJsonBody(req);
      if (user.role === 'barber') {
        body.barber_id = user.barber_id;
      }
      if (!body.title || !body.title.trim()) {
        return sendJson(res, 400, { error: 'El título del trabajo es obligatorio.' });
      }
      if (!body.media_url || !body.media_url.trim()) {
        return sendJson(res, 400, { error: 'La foto o video es obligatorio.' });
      }
      if (!body.barber_id) {
        return sendJson(res, 400, { error: 'Debes asignar el barbero autor del trabajo.' });
      }
      const item = portfolioModel.create(body);
      sendJson(res, 201, { message: 'Trabajo publicado en el portafolio de Inicio.', item });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
  },

  async updatePortfolioItem(req, res, id, user) {
    try {
      const existing = portfolioModel.getById(id);
      if (!existing) {
        return sendJson(res, 404, { error: 'Elemento de portafolio no encontrado.' });
      }
      if (user.role === 'barber' && existing.barber_id !== user.barber_id) {
        return sendJson(res, 403, { error: 'Solo puedes editar tus propias publicaciones.' });
      }
      const body = await readJsonBody(req);
      if (user.role === 'barber') {
        body.barber_id = user.barber_id;
      }
      const item = portfolioModel.update(id, body);
      sendJson(res, 200, { message: 'Publicación actualizada.', item });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
  },

  deletePortfolioItem(req, res, id, user) {
    const existing = portfolioModel.getById(id);
    if (!existing) {
      return sendJson(res, 404, { error: 'Elemento de portafolio no encontrado.' });
    }
    if (user.role === 'barber' && existing.barber_id !== user.barber_id) {
      return sendJson(res, 403, { error: 'Solo puedes eliminar tus propias publicaciones.' });
    }
    portfolioModel.delete(id);
    sendJson(res, 200, { message: 'Publicación eliminada del portafolio.' });
  }
};

module.exports = adminController;

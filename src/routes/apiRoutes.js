const { db } = require('../database/connection');
const publicController = require('../controllers/publicController');
const authController = require('../controllers/authController');
const adminController = require('../controllers/adminController');
const { requireAuth } = require('../middlewares/authMiddleware');
const { sendJson } = require('../utils/http');

async function handleApiRoute(req, res, urlObj) {
  const pathname = urlObj.pathname;
  const method = req.method.toUpperCase();

  // --- PUBLIC ROUTES ---
  if (pathname === '/api/public/bootstrap' && method === 'GET') {
    return publicController.getBootstrap(req, res);
  }
  if (pathname === '/api/public/availability' && method === 'GET') {
    return publicController.getAvailability(req, res, urlObj);
  }
  if (pathname === '/api/public/bookings' && method === 'POST') {
    return publicController.createBooking(req, res);
  }
  if (pathname === '/api/public/bookings/lookup' && method === 'GET') {
    return publicController.lookupBookings(req, res, urlObj);
  }
  const cancelMatch = pathname.match(/^\/api\/public\/bookings\/([A-Za-z0-9-]+)\/cancel$/);
  if (cancelMatch && method === 'POST') {
    return publicController.cancelClientBooking(req, res, cancelMatch[1]);
  }
  const likeMatch = pathname.match(/^\/api\/public\/portfolio\/(\d+)\/like$/);
  if (likeMatch && method === 'POST') {
    return publicController.likePortfolioItem(req, res, likeMatch[1]);
  }

  // --- AUTH ROUTES ---
  if (pathname === '/api/auth/login' && method === 'POST') {
    return authController.login(req, res);
  }
  if (pathname === '/api/auth/logout' && method === 'POST') {
    return authController.logout(req, res);
  }
  if (pathname === '/api/auth/me' && method === 'GET') {
    return authController.me(req, res);
  }
  if (pathname === '/api/auth/account' && (method === 'PUT' || method === 'PATCH')) {
    return authController.updateAccount(req, res);
  }

  // --- ADMIN & BARBER PROTECTED ROUTES ---
  if (pathname.startsWith('/api/admin/')) {
    if (pathname === '/api/admin/overview' && method === 'GET') {
      if (db.isSupabase && typeof db.callRpcAsync === 'function') {
        return adminController.getOverview(req, res, null);
      }
      const user = requireAuth(req, res, ['admin', 'barber']);
      if (!user) return;
      return adminController.getOverview(req, res, user);
    }

    // Bookings
    if (pathname === '/api/admin/bookings' && method === 'GET') {
      const user = requireAuth(req, res, ['admin', 'barber']);
      if (!user) return;
      return adminController.listBookings(req, res, urlObj, user);
    }
    if (pathname === '/api/admin/bookings' && method === 'POST') {
      const user = requireAuth(req, res, ['admin', 'barber']);
      if (!user) return;
      return adminController.createBooking(req, res, user);
    }
    const bookingIdMatch = pathname.match(/^\/api\/admin\/bookings\/(\d+)$/);
    if (bookingIdMatch && method === 'GET') {
      const user = requireAuth(req, res, ['admin', 'barber']);
      if (!user) return;
      return adminController.getBookingDetail(req, res, bookingIdMatch[1], user);
    }
    if (bookingIdMatch && (method === 'PUT' || method === 'PATCH')) {
      const user = requireAuth(req, res, ['admin', 'barber']);
      if (!user) return;
      return adminController.updateBooking(req, res, bookingIdMatch[1], user);
    }

    // Categories & Services (Admin only)
    if (pathname === '/api/admin/categories' && method === 'POST') {
      const user = requireAuth(req, res, ['admin']);
      if (!user) return;
      return adminController.createCategory(req, res);
    }
    if (pathname === '/api/admin/services' && method === 'POST') {
      const user = requireAuth(req, res, ['admin']);
      if (!user) return;
      return adminController.createService(req, res);
    }
    const serviceIdMatch = pathname.match(/^\/api\/admin\/services\/(\d+)$/);
    if (serviceIdMatch && (method === 'PUT' || method === 'PATCH')) {
      const user = requireAuth(req, res, ['admin']);
      if (!user) return;
      return adminController.updateService(req, res, serviceIdMatch[1]);
    }
    if (serviceIdMatch && method === 'DELETE') {
      const user = requireAuth(req, res, ['admin']);
      if (!user) return;
      return adminController.deleteService(req, res, serviceIdMatch[1]);
    }

    // Barbers
    if (pathname === '/api/admin/barbers' && method === 'POST') {
      const user = requireAuth(req, res, ['admin']);
      if (!user) return;
      return adminController.createBarber(req, res);
    }
    const barberIdMatch = pathname.match(/^\/api\/admin\/barbers\/(\d+)$/);
    if (barberIdMatch && (method === 'PUT' || method === 'PATCH')) {
      const user = requireAuth(req, res, ['admin', 'barber']);
      if (!user) return;
      return adminController.updateBarber(req, res, barberIdMatch[1], user);
    }

    // Schedules & Availability Blocks
    if (pathname === '/api/admin/schedules/hours' && method === 'PUT') {
      const user = requireAuth(req, res, ['admin', 'barber']);
      if (!user) return;
      return adminController.updateWorkingHours(req, res, user);
    }
    if (pathname === '/api/admin/schedules/blocks' && method === 'POST') {
      const user = requireAuth(req, res, ['admin', 'barber']);
      if (!user) return;
      return adminController.createBlock(req, res, user);
    }
    const blockIdMatch = pathname.match(/^\/api\/admin\/schedules\/blocks\/(\d+)$/);
    if (blockIdMatch && method === 'DELETE') {
      const user = requireAuth(req, res, ['admin', 'barber']);
      if (!user) return;
      return adminController.deleteBlock(req, res, blockIdMatch[1]);
    }

    // Clients
    if (pathname === '/api/admin/clients' && method === 'GET') {
      const user = requireAuth(req, res, ['admin', 'barber']);
      if (!user) return;
      return adminController.listClients(req, res, urlObj);
    }
    const clientIdMatch = pathname.match(/^\/api\/admin\/clients\/(\d+)$/);
    if (clientIdMatch && method === 'GET') {
      const user = requireAuth(req, res, ['admin', 'barber']);
      if (!user) return;
      return adminController.getClientDetail(req, res, clientIdMatch[1]);
    }
    if (clientIdMatch && (method === 'PUT' || method === 'PATCH')) {
      const user = requireAuth(req, res, ['admin']);
      if (!user) return;
      return adminController.updateClient(req, res, clientIdMatch[1]);
    }

    // Settings & Upload
    if (pathname === '/api/admin/settings' && (method === 'PUT' || method === 'PATCH')) {
      const user = requireAuth(req, res, ['admin']);
      if (!user) return;
      return adminController.updateSettings(req, res);
    }
    if (pathname === '/api/admin/upload' && method === 'POST') {
      const user = requireAuth(req, res, ['admin', 'barber']);
      if (!user) return;
      return adminController.uploadImage(req, res);
    }

    // Portfolio (Photos & Videos)
    if (pathname === '/api/admin/portfolio' && method === 'POST') {
      const user = requireAuth(req, res, ['admin', 'barber']);
      if (!user) return;
      return adminController.createPortfolioItem(req, res, user);
    }
    const portfolioIdMatch = pathname.match(/^\/api\/admin\/portfolio\/(\d+)$/);
    if (portfolioIdMatch && (method === 'PUT' || method === 'PATCH')) {
      const user = requireAuth(req, res, ['admin', 'barber']);
      if (!user) return;
      return adminController.updatePortfolioItem(req, res, portfolioIdMatch[1], user);
    }
    if (portfolioIdMatch && method === 'DELETE') {
      const user = requireAuth(req, res, ['admin', 'barber']);
      if (!user) return;
      return adminController.deletePortfolioItem(req, res, portfolioIdMatch[1], user);
    }
  }

  return sendJson(res, 404, { error: `Ruta API no encontrada: ${method} ${pathname}` });
}

module.exports = { handleApiRoute };

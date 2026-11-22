const { db } = require('../database/connection');
const settingsModel = require('../models/settingsModel');
const { getNowInTimezone, addDays, formatDateLabelEs } = require('../utils/dateUtils');

const dashboardService = {
  getDashboardMetrics({ barberId = null } = {}) {
    const settings = settingsModel.getSettings();
    const { dateStr: today } = getNowInTimezone(settings.timezone);

    const barberFilter = barberId ? `AND bk.barber_id = ${Number(barberId)}` : '';

    // 1. Summary KPIs
    const kpis = db.prepare(`
      SELECT
        SUM(CASE WHEN bk.date = ? THEN 1 ELSE 0 END) as today_total,
        SUM(CASE WHEN bk.status = 'pending' THEN 1 ELSE 0 END) as pending_total,
        SUM(CASE WHEN bk.status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_total,
        SUM(CASE WHEN bk.status = 'completed' THEN 1 ELSE 0 END) as completed_total,
        SUM(CASE WHEN bk.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_total,
        COALESCE(SUM(CASE WHEN bk.status IN ('confirmed', 'completed') THEN bk.price ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN bk.date = ? AND bk.status IN ('confirmed', 'completed') THEN bk.price ELSE 0 END), 0) as today_revenue
      FROM bookings bk
      WHERE 1=1 ${barberFilter}
    `).get(today, today);

    // 2. Top Requested Services
    const topServices = db.prepare(`
      SELECT
        s.id,
        s.name,
        c.name as category_name,
        s.price,
        COUNT(bk.id) as bookings_count,
        COALESCE(SUM(CASE WHEN bk.status IN ('confirmed', 'completed') THEN bk.price ELSE 0 END), 0) as revenue
      FROM services s
      JOIN categories c ON s.category_id = c.id
      LEFT JOIN bookings bk ON bk.service_id = s.id AND bk.status != 'cancelled' ${barberFilter}
      GROUP BY s.id, c.name
      ORDER BY bookings_count DESC, revenue DESC
      LIMIT 6
    `).all();

    // 3. Performance by Barber
    const barberPerformance = db.prepare(`
      SELECT
        b.id,
        b.name,
        b.specialty,
        b.avatar_url,
        b.rating,
        COUNT(bk.id) as total_bookings,
        SUM(CASE WHEN bk.status IN ('confirmed', 'completed') THEN 1 ELSE 0 END) as completed_or_confirmed,
        SUM(CASE WHEN bk.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count,
        COALESCE(SUM(CASE WHEN bk.status IN ('confirmed', 'completed') THEN bk.price ELSE 0 END), 0) as revenue
      FROM barbers b
      LEFT JOIN bookings bk ON bk.barber_id = b.id
      WHERE b.active = 1 ${barberId ? `AND b.id = ${Number(barberId)}` : ''}
      GROUP BY b.id
      ORDER BY revenue DESC, total_bookings DESC
    `).all();

    // 4. Upcoming Appointments (Today & Future)
    const upcomingAppointments = db.prepare(`
      SELECT
        bk.*,
        cl.name as client_name,
        cl.phone as client_phone,
        s.name as service_name,
        b.name as barber_name,
        b.avatar_url as barber_avatar
      FROM bookings bk
      JOIN clients cl ON bk.client_id = cl.id
      JOIN services s ON bk.service_id = s.id
      JOIN barbers b ON bk.barber_id = b.id
      WHERE bk.date >= ?
        AND bk.status IN ('pending', 'confirmed')
        ${barberFilter}
      ORDER BY bk.date ASC, bk.start_time ASC
      LIMIT 10
    `).all(today);

    // 5. 7-Day Activity Chart (last 3 days + today + next 3 days) in 1 single query
    const startChartDate = addDays(today, -3);
    const endChartDate = addDays(today, 3);
    const chartRows = db.prepare(`
      SELECT
        bk.date,
        COUNT(*) as count,
        COALESCE(SUM(CASE WHEN bk.status IN ('confirmed', 'completed') THEN bk.price ELSE 0 END), 0) as revenue
      FROM bookings bk
      WHERE bk.date >= ? AND bk.date <= ? AND bk.status != 'cancelled' ${barberFilter}
      GROUP BY bk.date
    `).all(startChartDate, endChartDate);

    const chartMap = new Map(chartRows.map(r => [r.date, r]));
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

    return {
      today,
      currencySymbol: settings.currency_symbol,
      kpis: {
        todayBookings: kpis.today_total || 0,
        pendingBookings: kpis.pending_total || 0,
        confirmedBookings: (kpis.confirmed_total || 0) + (kpis.completed_total || 0),
        cancelledBookings: kpis.cancelled_total || 0,
        totalRevenue: kpis.total_revenue || 0,
        todayRevenue: kpis.today_revenue || 0
      },
      topServices,
      barberPerformance,
      upcomingAppointments,
      dailyChart
    };
  }
};

module.exports = dashboardService;

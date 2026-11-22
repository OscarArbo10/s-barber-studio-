const { db, withTransaction } = require('../database/connection');
const env = require('../config/env');
const settingsModel = require('../models/settingsModel');
const serviceModel = require('../models/serviceModel');
const clientModel = require('../models/clientModel');
const bookingModel = require('../models/bookingModel');
const { generateBookingCode } = require('../utils/security');
const {
  getNowInTimezone,
  timeToMinutes,
  minutesToTime,
  formatTime12h,
  getDayOfWeek,
  addDays,
  formatDateLabelEs,
  intervalsOverlap
} = require('../utils/dateUtils');

const availabilityService = {
  /**
   * Returns active barbers compatible with the given serviceId.
   */
  getCompatibleBarbers(serviceId) {
    if (!serviceId) {
      return db.prepare(`SELECT * FROM barbers WHERE active = 1 ORDER BY sort_order ASC, id ASC`).all();
    }
    return db.prepare(`
      SELECT b.*
      FROM barbers b
      JOIN barber_services bs ON bs.barber_id = b.id
      WHERE b.active = 1 AND bs.service_id = ?
      ORDER BY b.sort_order ASC, b.id ASC
    `).all(Number(serviceId));
  },

  /**
   * Pure in-memory slot computation for a single barber on a specific date,
   * using pre-fetched workingHours, blocks, and bookings arrays (zero DB queries).
   */
  computeBarberDaySlotsInMemory({
    barberId,
    date,
    durationMinutes,
    slotInterval = 30,
    nowInfo,
    excludeBookingId = null,
    workingHours = [],
    blocks = [],
    bookings = []
  }) {
    const dayOfWeek = getDayOfWeek(date);
    const numBarberId = Number(barberId);
    const numExcludeId = excludeBookingId ? Number(excludeBookingId) : null;

    // 1. Studio general working hours for this weekday
    const studioHours = workingHours.find(
      wh => (wh.barber_id === null || wh.barber_id === undefined) && Number(wh.day_of_week) === dayOfWeek
    );

    if (!studioHours || !studioHours.is_working) {
      return { isWorkingDay: false, reason: 'Estudio cerrado', slots: [] };
    }

    // 2. Barber's specific working hours for this weekday
    const barberHours =
      workingHours.find(wh => Number(wh.barber_id) === numBarberId && Number(wh.day_of_week) === dayOfWeek) ||
      studioHours;

    if (!barberHours.is_working) {
      return { isWorkingDay: false, reason: 'Día de descanso del barbero', slots: [] };
    }

    const workStart = Math.max(timeToMinutes(studioHours.start_time), timeToMinutes(barberHours.start_time));
    const workEnd = Math.min(timeToMinutes(studioHours.end_time), timeToMinutes(barberHours.end_time));

    if (workEnd - workStart < durationMinutes) {
      return { isWorkingDay: false, reason: 'Horario insuficiente', slots: [] };
    }

    // 3. Filter availability blocks for studio or this barber on this date
    const dayBlocks = blocks.filter(
      blk =>
        (blk.barber_id === null || blk.barber_id === undefined || Number(blk.barber_id) === numBarberId) &&
        blk.start_date <= date &&
        blk.end_date >= date
    );

    for (const blk of dayBlocks) {
      if (!blk.start_time || !blk.end_time) {
        return { isWorkingDay: false, reason: blk.title || 'Fecha bloqueada', slots: [] };
      }
    }

    // 4. Filter existing active bookings for this barber on this date
    const existingBookings = bookings.filter(
      bk =>
        Number(bk.barber_id) === numBarberId &&
        bk.date === date &&
        ['pending', 'confirmed', 'completed'].includes(bk.status) &&
        (!numExcludeId || Number(bk.id) !== numExcludeId)
    );

    const busyIntervals = [];

    if (barberHours.break_start && barberHours.break_end) {
      const bStart = timeToMinutes(barberHours.break_start);
      const bEnd = timeToMinutes(barberHours.break_end);
      if (bEnd > bStart) {
        busyIntervals.push({ start: bStart, end: bEnd, reason: 'Descanso' });
      }
    }

    for (const blk of dayBlocks) {
      if (blk.start_time && blk.end_time) {
        busyIntervals.push({
          start: timeToMinutes(blk.start_time),
          end: timeToMinutes(blk.end_time),
          reason: blk.title || 'Bloqueo'
        });
      }
    }

    for (const bk of existingBookings) {
      busyIntervals.push({
        start: timeToMinutes(bk.start_time),
        end: timeToMinutes(bk.end_time),
        reason: 'Ocupado'
      });
    }

    const slots = [];
    const step = Math.max(15, Number(slotInterval) || 30);

    for (let startMin = workStart; startMin + durationMinutes <= workEnd; startMin += step) {
      const endMin = startMin + durationMinutes;
      const time24 = minutesToTime(startMin);
      const endTime24 = minutesToTime(endMin);

      if (date < nowInfo.dateStr) {
        continue;
      }
      if (date === nowInfo.dateStr && startMin <= nowInfo.minutesOfDay + 10) {
        continue;
      }

      const overlapsBreak =
        barberHours.break_start &&
        barberHours.break_end &&
        intervalsOverlap(
          startMin,
          endMin,
          timeToMinutes(barberHours.break_start),
          timeToMinutes(barberHours.break_end)
        );

      if (overlapsBreak) {
        continue;
      }

      let conflictReason = null;
      for (const bi of busyIntervals) {
        if (intervalsOverlap(startMin, endMin, bi.start, bi.end)) {
          conflictReason = bi.reason;
          break;
        }
      }

      slots.push({
        time: time24,
        endTime: endTime24,
        label12h: formatTime12h(time24),
        available: conflictReason === null,
        status: conflictReason === null ? 'available' : 'occupied',
        reason: conflictReason || 'Libre',
        barberId: numBarberId
      });
    }

    return {
      isWorkingDay: true,
      reason: '',
      slots
    };
  },

  /**
   * Single-day slot computation helper (fetches snapshot for 1 date).
   */
  computeBarberDaySlots({ barberId, date, durationMinutes, slotInterval = 30, nowInfo, excludeBookingId = null }) {
    if (db.isSupabase && typeof db.callRpc === 'function') {
      const snap = db.callRpc('sbarber_get_availability_snapshot', {
        p_service_id: 1,
        p_barber_ids: [Number(barberId)],
        p_dates: [date],
        p_exclude_booking_id: excludeBookingId ? Number(excludeBookingId) : null
      });
      return this.computeBarberDaySlotsInMemory({
        barberId,
        date,
        durationMinutes,
        slotInterval,
        nowInfo,
        excludeBookingId,
        workingHours: snap.workingHours || [],
        blocks: snap.blocks || [],
        bookings: snap.bookings || []
      });
    }

    const workingHours = db.prepare(`SELECT * FROM working_hours`).all();
    const blocks = db
      .prepare(`SELECT * FROM availability_blocks WHERE start_date <= ? AND end_date >= ?`)
      .all(date, date);
    const bookings = db
      .prepare(
        `SELECT id, barber_id, date, start_time, end_time, status FROM bookings WHERE date = ? AND status IN ('pending', 'confirmed', 'completed')`
      )
      .all(date);

    return this.computeBarberDaySlotsInMemory({
      barberId,
      date,
      durationMinutes,
      slotInterval,
      nowInfo,
      excludeBookingId,
      workingHours,
      blocks,
      bookings
    });
  },

  /**
   * Gets multi-day calendar availability + detailed slots for the selected date in 1 single RPC call.
   * Zero SQL queries inside the day/barber loops.
   */
  getAvailability({
    serviceId,
    barberId = 'any',
    date,
    startDate,
    daysCount = 14,
    excludeBookingId = null,
    preloadedSettings = null,
    preloadedService = null
  }) {
    const initialTz = (preloadedSettings && preloadedSettings.timezone) || env.defaultTimezone || 'America/Mexico_City';
    let nowInfo = getNowInTimezone(initialTz);

    const numDays = Math.min(30, Math.max(7, Number(daysCount) || 14));
    const calendarStart = startDate && startDate >= nowInfo.dateStr ? startDate : nowInfo.dateStr;

    const dateList = [];
    for (let i = 0; i < numDays; i++) {
      dateList.push(addDays(calendarStart, i));
    }
    const queryDates = [...dateList];
    if (date && date >= nowInfo.dateStr && !queryDates.includes(date)) {
      queryDates.push(date);
    }

    let settings;
    let service;
    let compatibleBarbers;
    let workingHours;
    let blocks;
    let bookings;

    if (db.isSupabase && typeof db.callRpc === 'function') {
      const targetServiceId = Number(serviceId) || (preloadedService && Number(preloadedService.id)) || 1;
      const snapshot = db.callRpc('sbarber_get_availability_snapshot', {
        p_service_id: targetServiceId,
        p_barber_ids: [],
        p_dates: queryDates,
        p_exclude_booking_id: excludeBookingId ? Number(excludeBookingId) : null
      });

      settings = snapshot.settings || preloadedSettings || { timezone: initialTz };
      service = snapshot.service || preloadedService;
      compatibleBarbers = snapshot.compatibleBarbers || [];
      workingHours = snapshot.workingHours || [];
      blocks = snapshot.blocks || [];
      bookings = snapshot.bookings || [];
    } else {
      settings = preloadedSettings || settingsModel.getSettings();
      service =
        preloadedService ||
        serviceModel.getById(Number(serviceId)) ||
        serviceModel.listServices({ onlyActive: true })[0];
      compatibleBarbers = service ? this.getCompatibleBarbers(service.id) : [];
      const minDate = queryDates[0];
      const maxDate = queryDates[queryDates.length - 1];
      workingHours = db.prepare(`SELECT * FROM working_hours`).all();
      blocks = db
        .prepare(`SELECT * FROM availability_blocks WHERE end_date >= ? AND start_date <= ?`)
        .all(minDate, maxDate);
      bookings = db
        .prepare(
          `SELECT id, barber_id, date, start_time, end_time, status FROM bookings WHERE date >= ? AND date <= ? AND status IN ('pending', 'confirmed', 'completed')`
        )
        .all(minDate, maxDate);
    }

    if (!service) {
      throw new Error('No hay servicios activos configurados.');
    }

    if (settings && settings.timezone && settings.timezone !== initialTz) {
      nowInfo = getNowInTimezone(settings.timezone);
    }

    const durationMinutes = Number(service.duration_minutes) || 45;
    const slotInterval = 30;
    const isAnyBarber = !barberId || barberId === 'any' || barberId === '0';

    const targetBarbers = isAnyBarber
      ? compatibleBarbers
      : compatibleBarbers.filter(b => Number(b.id) === Number(barberId));

    // Cache computed slots per (barberId, date) in memory so we never recompute twice
    const slotsCache = new Map();
    const getBarberSlotsCached = (bId, dStr) => {
      const key = `${bId}:${dStr}`;
      if (!slotsCache.has(key)) {
        slotsCache.set(
          key,
          this.computeBarberDaySlotsInMemory({
            barberId: bId,
            date: dStr,
            durationMinutes,
            slotInterval,
            nowInfo,
            excludeBookingId,
            workingHours,
            blocks,
            bookings
          })
        );
      }
      return slotsCache.get(key);
    };

    const days = [];
    for (const dStr of dateList) {
      const label = formatDateLabelEs(dStr);
      let availableSlotsCount = 0;
      let totalSlotsCount = 0;
      let dayReason = '';

      if (targetBarbers.length === 0) {
        dayReason = 'Sin barbero compatible';
      } else if (isAnyBarber) {
        const slotMap = new Map();
        for (const barber of targetBarbers) {
          const bDay = getBarberSlotsCached(barber.id, dStr);
          for (const sl of bDay.slots) {
            const prev = slotMap.get(sl.time);
            if (!prev || (!prev.available && sl.available)) {
              slotMap.set(sl.time, sl);
            }
          }
        }
        totalSlotsCount = slotMap.size;
        for (const sl of slotMap.values()) {
          if (sl.available) availableSlotsCount++;
        }
      } else {
        const bDay = getBarberSlotsCached(targetBarbers[0].id, dStr);
        totalSlotsCount = bDay.slots.length;
        availableSlotsCount = bDay.slots.filter(s => s.available).length;
        dayReason = bDay.reason;
      }

      days.push({
        date: dStr,
        dayName: label.dayName,
        dayNum: label.dayNum,
        monthName: label.monthName,
        fullLabel: label.fullLabel,
        isToday: dStr === nowInfo.dateStr,
        available: availableSlotsCount > 0,
        availableSlotsCount,
        totalSlotsCount,
        reason: availableSlotsCount > 0 ? 'Disponible' : dayReason || 'Agotado'
      });
    }

    let selectedDate = date && date >= nowInfo.dateStr ? date : null;
    if (!selectedDate) {
      const firstAvail = days.find(d => d.available);
      selectedDate = firstAvail ? firstAvail.date : days[0].date;
    }

    let slots = [];
    let firstAvailableBarberForAny = null;

    if (targetBarbers.length > 0) {
      if (isAnyBarber) {
        const combined = new Map();
        for (const barber of targetBarbers) {
          const bDay = getBarberSlotsCached(barber.id, selectedDate);
          for (const sl of bDay.slots) {
            if (!combined.has(sl.time)) {
              combined.set(sl.time, {
                time: sl.time,
                endTime: sl.endTime,
                label12h: sl.label12h,
                available: sl.available,
                status: sl.status,
                reason: sl.reason,
                availableBarbers: sl.available
                  ? [{ id: barber.id, name: barber.name, specialty: barber.specialty }]
                  : []
              });
            } else {
              const entry = combined.get(sl.time);
              if (sl.available) {
                entry.available = true;
                entry.status = 'available';
                entry.reason = 'Libre';
                entry.availableBarbers.push({
                  id: barber.id,
                  name: barber.name,
                  specialty: barber.specialty
                });
              }
            }
          }
        }
        slots = Array.from(combined.values())
          .sort((a, b) => a.time.localeCompare(b.time))
          .map(s => ({
            ...s,
            assignedBarber: s.availableBarbers[0] || null
          }));

        const firstOpenSlot = slots.find(s => s.available && s.assignedBarber);
        if (firstOpenSlot) {
          firstAvailableBarberForAny = {
            ...firstOpenSlot.assignedBarber,
            firstSlotTime: firstOpenSlot.time,
            firstSlotLabel12h: firstOpenSlot.label12h
          };
        }
      } else {
        const barber = targetBarbers[0];
        const bDay = getBarberSlotsCached(barber.id, selectedDate);
        slots = bDay.slots.map(s => ({
          ...s,
          assignedBarber: s.available
            ? { id: barber.id, name: barber.name, specialty: barber.specialty }
            : null
        }));
      }
    }

    return {
      timezone: settings.timezone,
      today: nowInfo.dateStr,
      currentTime: nowInfo.timeStr,
      service: {
        id: service.id,
        name: service.name,
        price: service.price,
        duration_minutes: service.duration_minutes
      },
      selectedDate,
      selectedDateLabel: formatDateLabelEs(selectedDate).fullLabel,
      isAnyBarber,
      firstAvailableBarberForAny,
      compatibleBarbers: compatibleBarbers.map(b => ({
        id: b.id,
        name: b.name,
        specialty: b.specialty,
        avatar_url: b.avatar_url,
        rating: b.rating
      })),
      days,
      slots
    };
  },

  /**
   * Verifies availability using 1 snapshot query and creates a booking.
   */
  createBookingAtomic(payload, performedBy = 'Cliente Web') {
    return withTransaction(() => {
      const date = payload.date;
      const startTime = payload.start_time;

      let settings;
      let service;
      let compatibleBarbers;
      let workingHours;
      let blocks;
      let bookings;

      if (db.isSupabase && typeof db.callRpc === 'function') {
        const snap = db.callRpc('sbarber_get_availability_snapshot', {
          p_service_id: Number(payload.service_id),
          p_barber_ids: [],
          p_dates: [date],
          p_exclude_booking_id: null
        });
        settings = snap.settings;
        service = snap.service;
        compatibleBarbers = snap.compatibleBarbers || [];
        workingHours = snap.workingHours || [];
        blocks = snap.blocks || [];
        bookings = snap.bookings || [];
      } else {
        settings = settingsModel.getSettings();
        service = serviceModel.getById(Number(payload.service_id));
        compatibleBarbers = service ? this.getCompatibleBarbers(service.id) : [];
        workingHours = db.prepare(`SELECT * FROM working_hours`).all();
        blocks = db
          .prepare(`SELECT * FROM availability_blocks WHERE start_date <= ? AND end_date >= ?`)
          .all(date, date);
        bookings = db
          .prepare(
            `SELECT id, barber_id, date, start_time, end_time, status FROM bookings WHERE date = ? AND status IN ('pending', 'confirmed', 'completed')`
          )
          .all(date);
      }

      if (!service || !service.active) {
        const err = new Error('El servicio seleccionado no existe o no está disponible.');
        err.statusCode = 400;
        throw err;
      }

      const nowInfo = getNowInTimezone((settings && settings.timezone) || env.defaultTimezone);
      const durationMinutes = Number(service.duration_minutes);
      const startMin = timeToMinutes(startTime);
      const endMin = startMin + durationMinutes;
      const endTime = minutesToTime(endMin);

      if (date < nowInfo.dateStr || (date === nowInfo.dateStr && startMin <= nowInfo.minutesOfDay)) {
        const err = new Error('No es posible reservar en una fecha u horario que ya pasó.');
        err.statusCode = 400;
        throw err;
      }

      const requestedAny = !payload.barber_id || payload.barber_id === 'any' || payload.barber_id === '0';
      if (compatibleBarbers.length === 0) {
        const err = new Error('No hay barberos activos compatibles con este servicio.');
        err.statusCode = 400;
        throw err;
      }

      let candidateBarbers = [];
      if (requestedAny) {
        candidateBarbers = compatibleBarbers;
      } else {
        const chosen = compatibleBarbers.find(b => Number(b.id) === Number(payload.barber_id));
        if (!chosen) {
          const err = new Error('El barbero seleccionado no realiza este servicio o no está activo.');
          err.statusCode = 400;
          throw err;
        }
        candidateBarbers = [chosen];
      }

      let selectedBarber = null;
      for (const barber of candidateBarbers) {
        const bDay = this.computeBarberDaySlotsInMemory({
          barberId: barber.id,
          date,
          durationMinutes,
          slotInterval: 15,
          nowInfo,
          workingHours,
          blocks,
          bookings
        });
        const matchingSlot = bDay.slots.find(s => s.time === startTime && s.available);
        if (matchingSlot) {
          selectedBarber = barber;
          break;
        }
      }

      if (!selectedBarber) {
        const err = new Error(
          'El horario seleccionado acaba de ser ocupado o no está disponible. Por favor elige otro bloque.'
        );
        err.statusCode = 409;
        throw err;
      }

      const client = clientModel.findOrCreate({
        name: payload.client_name,
        phone: payload.client_phone,
        email: payload.client_email || '',
        notes: payload.notes || ''
      });

      let bookingCode = generateBookingCode();
      while (db.prepare(`SELECT id FROM bookings WHERE booking_code = ?`).get(bookingCode)) {
        bookingCode = generateBookingCode();
      }

      const initialStatus = payload.status || 'confirmed';
      const res = db
        .prepare(
          `
        INSERT INTO bookings (
          booking_code, client_id, service_id, barber_id, requested_any_barber,
          date, start_time, end_time, duration_minutes, price, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          bookingCode,
          client.id,
          service.id,
          selectedBarber.id,
          requestedAny ? 1 : 0,
          date,
          startTime,
          endTime,
          durationMinutes,
          service.price,
          initialStatus,
          (payload.notes || '').trim()
        );

      const bookingId = res.lastInsertRowid;
      bookingModel.addHistory({
        bookingId,
        action: 'created',
        previousStatus: '',
        newStatus: initialStatus,
        details: requestedAny
          ? `Reserva creada y asignada automáticamente a ${selectedBarber.name} (${date} ${startTime})`
          : `Reserva creada con ${selectedBarber.name} (${date} ${startTime})`,
        performedBy
      });

      return bookingModel.getById(bookingId);
    });
  },

  /**
   * Updates or reschedules an existing booking with availability validation.
   */
  updateBookingAtomic(bookingId, changes, performedBy = 'Administrador') {
    const settings = settingsModel.getSettings();
    const nowInfo = getNowInTimezone(settings.timezone);

    return withTransaction(() => {
      const existing = bookingModel.getById(bookingId);
      if (!existing) {
        const err = new Error('Reserva no encontrada.');
        err.statusCode = 404;
        throw err;
      }

      const newServiceId = changes.service_id !== undefined ? Number(changes.service_id) : existing.service_id;
      const service = serviceModel.getById(newServiceId);
      if (!service) {
        const err = new Error('Servicio inválido.');
        err.statusCode = 400;
        throw err;
      }

      const newBarberId = changes.barber_id !== undefined ? Number(changes.barber_id) : existing.barber_id;
      const newDate = changes.date || existing.date;
      const newStartTime = changes.start_time || existing.start_time;
      const newStatus = changes.status || existing.status;
      const newDuration = Number(service.duration_minutes);
      const newEndTime = minutesToTime(timeToMinutes(newStartTime) + newDuration);
      const newPrice = changes.price !== undefined ? Number(changes.price) : Number(service.price);
      const newNotes = changes.notes !== undefined ? changes.notes.trim() : existing.notes;

      const scheduleChanged =
        newBarberId !== existing.barber_id ||
        newDate !== existing.date ||
        newStartTime !== existing.start_time ||
        newServiceId !== existing.service_id;

      if (newStatus !== 'cancelled' && (scheduleChanged || existing.status === 'cancelled')) {
        const daySlots = this.computeBarberDaySlots({
          barberId: newBarberId,
          date: newDate,
          durationMinutes: newDuration,
          slotInterval: 15,
          nowInfo: { ...nowInfo, dateStr: '1970-01-01', minutesOfDay: 0 },
          excludeBookingId: existing.id
        });
        const slotOk = daySlots.slots.find(s => s.time === newStartTime && s.available);
        if (!slotOk) {
          const err = new Error('El barbero no tiene disponibilidad en la nueva fecha/hora seleccionada.');
          err.statusCode = 409;
          throw err;
        }
      }

      if (changes.client_name || changes.client_phone || changes.client_email !== undefined) {
        clientModel.update(existing.client_id, {
          name: changes.client_name,
          phone: changes.client_phone,
          email: changes.client_email
        });
      }

      db.prepare(
        `
        UPDATE bookings
        SET
          service_id = ?,
          barber_id = ?,
          date = ?,
          start_time = ?,
          end_time = ?,
          duration_minutes = ?,
          price = ?,
          status = ?,
          notes = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `
      ).run(
        newServiceId,
        newBarberId,
        newDate,
        newStartTime,
        newEndTime,
        newDuration,
        newPrice,
        newStatus,
        newNotes,
        existing.id
      );

      const detailsParts = [];
      if (newStatus !== existing.status) {
        detailsParts.push(`Estado: ${existing.status} → ${newStatus}`);
      }
      if (scheduleChanged) {
        detailsParts.push(`Horario: ${existing.date} ${existing.start_time} → ${newDate} ${newStartTime}`);
      }
      if (detailsParts.length === 0) {
        detailsParts.push('Información de la reserva actualizada');
      }

      bookingModel.addHistory({
        bookingId: existing.id,
        action: scheduleChanged ? 'rescheduled' : newStatus !== existing.status ? 'status_change' : 'updated',
        previousStatus: existing.status,
        newStatus,
        details: detailsParts.join(' | '),
        performedBy
      });

      return bookingModel.getById(existing.id);
    });
  }
};

module.exports = availabilityService;

const { db, withTransaction } = require('../database/connection');
const settingsModel = require('../models/settingsModel');
const serviceModel = require('../models/serviceModel');
const barberModel = require('../models/barberModel');
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
   * Computes time slots for a single barber on a specific date for a given duration.
   */
  computeBarberDaySlots({ barberId, date, durationMinutes, slotInterval = 30, nowInfo, excludeBookingId = null }) {
    const dayOfWeek = getDayOfWeek(date);

    // 1. Check studio general working hours for this weekday
    const studioHours = db.prepare(`
      SELECT * FROM working_hours WHERE barber_id IS NULL AND day_of_week = ?
    `).get(dayOfWeek);

    if (!studioHours || !studioHours.is_working) {
      return { isWorkingDay: false, reason: 'Estudio cerrado', slots: [] };
    }

    // 2. Check barber's specific working hours for this weekday
    const barberHours = db.prepare(`
      SELECT * FROM working_hours WHERE barber_id = ? AND day_of_week = ?
    `).get(Number(barberId), dayOfWeek) || studioHours;

    if (!barberHours.is_working) {
      return { isWorkingDay: false, reason: 'Día de descanso del barbero', slots: [] };
    }

    // Effective work window is intersection of studio hours and barber hours
    const workStart = Math.max(timeToMinutes(studioHours.start_time), timeToMinutes(barberHours.start_time));
    const workEnd = Math.min(timeToMinutes(studioHours.end_time), timeToMinutes(barberHours.end_time));

    if (workEnd - workStart < durationMinutes) {
      return { isWorkingDay: false, reason: 'Horario insuficiente', slots: [] };
    }

    // 3. Check availability blocks (holidays, vacations, special blocks) for studio or this barber
    const blocks = db.prepare(`
      SELECT * FROM availability_blocks
      WHERE (barber_id IS NULL OR barber_id = ?)
        AND start_date <= ? AND end_date >= ?
    `).all(Number(barberId), date, date);

    for (const blk of blocks) {
      if (!blk.start_time || !blk.end_time) {
        return { isWorkingDay: false, reason: blk.title || 'Fecha bloqueada', slots: [] };
      }
    }

    // 4. Get existing active bookings for this barber on this date
    const existingBookings = db.prepare(`
      SELECT id, start_time, end_time, status
      FROM bookings
      WHERE barber_id = ?
        AND date = ?
        AND status IN ('pending', 'confirmed', 'completed')
        ${excludeBookingId ? 'AND id != ?' : ''}
    `).all(...(excludeBookingId ? [Number(barberId), date, Number(excludeBookingId)] : [Number(barberId), date]));

    // Build list of blocked intervals in minutes
    const busyIntervals = [];

    // Daily break interval
    if (barberHours.break_start && barberHours.break_end) {
      const bStart = timeToMinutes(barberHours.break_start);
      const bEnd = timeToMinutes(barberHours.break_end);
      if (bEnd > bStart) {
        busyIntervals.push({ start: bStart, end: bEnd, reason: 'Descanso' });
      }
    }

    // Partial-day administrative blocks
    for (const blk of blocks) {
      if (blk.start_time && blk.end_time) {
        busyIntervals.push({
          start: timeToMinutes(blk.start_time),
          end: timeToMinutes(blk.end_time),
          reason: blk.title || 'Bloqueo'
        });
      }
    }

    // Existing bookings
    const occupiedIntervals = [];
    for (const bk of existingBookings) {
      const interval = {
        start: timeToMinutes(bk.start_time),
        end: timeToMinutes(bk.end_time),
        reason: 'Ocupado'
      };
      busyIntervals.push(interval);
      occupiedIntervals.push(interval);
    }

    // Generate slots from workStart to workEnd
    const slots = [];
    const step = Math.max(15, Number(slotInterval) || 30);

    for (let startMin = workStart; startMin + durationMinutes <= workEnd; startMin += step) {
      const endMin = startMin + durationMinutes;
      const time24 = minutesToTime(startMin);
      const endTime24 = minutesToTime(endMin);

      // Skip or mark past slots if date is today
      if (date < nowInfo.dateStr) {
        continue;
      }
      if (date === nowInfo.dateStr && startMin <= nowInfo.minutesOfDay + 10) {
        continue;
      }

      // Check if overlaps with break
      const overlapsBreak = barberHours.break_start && barberHours.break_end &&
        intervalsOverlap(startMin, endMin, timeToMinutes(barberHours.break_start), timeToMinutes(barberHours.break_end));

      if (overlapsBreak) {
        continue; // Breaks are not bookable slots
      }

      // Check if overlaps with booking or partial block
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
        barberId: Number(barberId)
      });
    }

    return {
      isWorkingDay: true,
      reason: '',
      slots
    };
  },

  /**
   * Gets multi-day calendar availability + detailed slots for the selected date.
   * Supports specific barberId OR 'any' ("Cualquiera disponible").
   */
  getAvailability({ serviceId, barberId = 'any', date, startDate, daysCount = 14, excludeBookingId = null }) {
    const settings = settingsModel.getSettings();
    const nowInfo = getNowInTimezone(settings.timezone);

    const service = serviceModel.getById(Number(serviceId)) || serviceModel.listServices({ onlyActive: true })[0];
    if (!service) {
      throw new Error('No hay servicios activos configurados.');
    }

    const durationMinutes = Number(service.duration_minutes) || 45;
    // Use 30-min visual grid intervals or settings interval
    const slotInterval = 30;

    const compatibleBarbers = this.getCompatibleBarbers(service.id);
    const isAnyBarber = !barberId || barberId === 'any' || barberId === '0';

    const targetBarbers = isAnyBarber
      ? compatibleBarbers
      : compatibleBarbers.filter(b => b.id === Number(barberId));

    const calendarStart = startDate && startDate >= nowInfo.dateStr ? startDate : nowInfo.dateStr;
    const numDays = Math.min(30, Math.max(7, Number(daysCount) || 14));

    const days = [];
    for (let i = 0; i < numDays; i++) {
      const dStr = addDays(calendarStart, i);
      const label = formatDateLabelEs(dStr);

      let availableSlotsCount = 0;
      let totalSlotsCount = 0;
      let dayReason = '';

      if (targetBarbers.length === 0) {
        dayReason = 'Sin barbero compatible';
      } else if (isAnyBarber) {
        const slotMap = new Map();
        for (const barber of targetBarbers) {
          const bDay = this.computeBarberDaySlots({
            barberId: barber.id,
            date: dStr,
            durationMinutes,
            slotInterval,
            nowInfo,
            excludeBookingId
          });
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
        const bDay = this.computeBarberDaySlots({
          barberId: targetBarbers[0].id,
          date: dStr,
          durationMinutes,
          slotInterval,
          nowInfo,
          excludeBookingId
        });
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
        reason: availableSlotsCount > 0 ? 'Disponible' : (dayReason || 'Agotado')
      });
    }

    // Determine effective selected date (prefer requested date if valid, otherwise first available date)
    let selectedDate = date && date >= nowInfo.dateStr ? date : null;
    if (!selectedDate) {
      const firstAvail = days.find(d => d.available);
      selectedDate = firstAvail ? firstAvail.date : days[0].date;
    }

    // Compute detailed slots for selectedDate
    let slots = [];
    let firstAvailableBarberForAny = null;

    if (targetBarbers.length > 0) {
      if (isAnyBarber) {
        const combined = new Map();
        for (const barber of targetBarbers) {
          const bDay = this.computeBarberDaySlots({
            barberId: barber.id,
            date: selectedDate,
            durationMinutes,
            slotInterval,
            nowInfo,
            excludeBookingId
          });
          for (const sl of bDay.slots) {
            if (!combined.has(sl.time)) {
              combined.set(sl.time, {
                time: sl.time,
                endTime: sl.endTime,
                label12h: sl.label12h,
                available: sl.available,
                status: sl.status,
                reason: sl.reason,
                availableBarbers: sl.available ? [{ id: barber.id, name: barber.name, specialty: barber.specialty }] : []
              });
            } else {
              const entry = combined.get(sl.time);
              if (sl.available) {
                entry.available = true;
                entry.status = 'available';
                entry.reason = 'Libre';
                entry.availableBarbers.push({ id: barber.id, name: barber.name, specialty: barber.specialty });
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
        const bDay = this.computeBarberDaySlots({
          barberId: barber.id,
          date: selectedDate,
          durationMinutes,
          slotInterval,
          nowInfo,
          excludeBookingId
        });
        slots = bDay.slots.map(s => ({
          ...s,
          assignedBarber: s.available ? { id: barber.id, name: barber.name, specialty: barber.specialty } : null
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
   * Atomically verifies availability and creates a booking inside an IMMEDIATE transaction.
   * Prevents race conditions and duplicate bookings.
   */
  createBookingAtomic(payload, performedBy = 'Cliente Web') {
    const settings = settingsModel.getSettings();
    const nowInfo = getNowInTimezone(settings.timezone);

    return withTransaction(() => {
      const service = serviceModel.getById(Number(payload.service_id));
      if (!service || !service.active) {
        const err = new Error('El servicio seleccionado no existe o no está disponible.');
        err.statusCode = 400;
        throw err;
      }

      const date = payload.date;
      const startTime = payload.start_time;
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
      const compatibleBarbers = this.getCompatibleBarbers(service.id);

      if (compatibleBarbers.length === 0) {
        const err = new Error('No hay barberos activos compatibles con este servicio.');
        err.statusCode = 400;
        throw err;
      }

      let candidateBarbers = [];
      if (requestedAny) {
        candidateBarbers = compatibleBarbers;
      } else {
        const chosen = compatibleBarbers.find(b => b.id === Number(payload.barber_id));
        if (!chosen) {
          const err = new Error('El barbero seleccionado no realiza este servicio o no está activo.');
          err.statusCode = 400;
          throw err;
        }
        candidateBarbers = [chosen];
      }

      let selectedBarber = null;
      for (const barber of candidateBarbers) {
        const bDay = this.computeBarberDaySlots({
          barberId: barber.id,
          date,
          durationMinutes,
          slotInterval: 15,
          nowInfo
        });
        const matchingSlot = bDay.slots.find(s => s.time === startTime && s.available);
        if (matchingSlot) {
          selectedBarber = barber;
          break;
        }
      }

      if (!selectedBarber) {
        const err = new Error('El horario seleccionado acaba de ser ocupado o no está disponible. Por favor elige otro bloque.');
        err.statusCode = 409;
        throw err;
      }

      // Create or update client record
      const client = clientModel.findOrCreate({
        name: payload.client_name,
        phone: payload.client_phone,
        email: payload.client_email || '',
        notes: payload.notes || ''
      });

      // Generate unique booking code
      let bookingCode = generateBookingCode();
      while (db.prepare(`SELECT id FROM bookings WHERE booking_code = ?`).get(bookingCode)) {
        bookingCode = generateBookingCode();
      }

      const initialStatus = payload.status || 'confirmed';
      const res = db.prepare(`
        INSERT INTO bookings (
          booking_code, client_id, service_id, barber_id, requested_any_barber,
          date, start_time, end_time, duration_minutes, price, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
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
   * Updates or reschedules an existing booking with full availability validation.
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

      // If active status and schedule changed (or reactivating a cancelled booking), verify availability
      if (newStatus !== 'cancelled' && (scheduleChanged || existing.status === 'cancelled')) {
        const daySlots = this.computeBarberDaySlots({
          barberId: newBarberId,
          date: newDate,
          durationMinutes: newDuration,
          slotInterval: 15,
          nowInfo: { ...nowInfo, dateStr: '1970-01-01', minutesOfDay: 0 }, // Allow admin to manage today's appointments freely
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

      db.prepare(`
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
      `).run(
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
        action: scheduleChanged ? 'rescheduled' : (newStatus !== existing.status ? 'status_change' : 'updated'),
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

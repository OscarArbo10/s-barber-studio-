/**
 * Timezone-aware date and time utilities for KULT Barber Studio.
 */

function getNowInTimezone(timezone = 'America/Mexico_City') {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(new Date());
    const map = {};
    for (const part of parts) {
      map[part.type] = part.value;
    }
    const hour = map.hour === '24' ? '00' : map.hour;
    const dateStr = `${map.year}-${map.month}-${map.day}`;
    const timeStr = `${hour}:${map.minute}`;
    return {
      dateStr,
      timeStr,
      minutesOfDay: timeToMinutes(timeStr)
    };
  } catch (_) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return {
      dateStr: `${y}-${m}-${d}`,
      timeStr: `${hh}:${mm}`,
      minutesOfDay: now.getHours() * 60 + now.getMinutes()
    };
  }
}

function timeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const [hh, mm] = timeStr.split(':').map(n => parseInt(n, 10));
  return (hh || 0) * 60 + (mm || 0);
}

function minutesToTime(totalMinutes) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMinutes));
  const hh = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function formatTime12h(time24) {
  const mins = timeToMinutes(time24);
  const hh24 = Math.floor(mins / 60);
  const mm = mins % 60;
  const period = hh24 >= 12 ? 'PM' : 'AM';
  const hh12 = hh24 % 12 === 0 ? 12 : hh24 % 12;
  return `${String(hh12).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${period}`;
}

function parseDateYMD(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (isNaN(dt.getTime())) return null;
  return dt;
}

function getDayOfWeek(dateStr) {
  const dt = parseDateYMD(dateStr);
  if (!dt) return 0;
  return dt.getUTCDay(); // 0=Sunday .. 6=Saturday
}

function addDays(dateStr, days) {
  const dt = parseDateYMD(dateStr);
  if (!dt) return dateStr;
  dt.setUTCDate(dt.getUTCDate() + days);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const DAY_NAMES_SHORT_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_NAMES_SHORT_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatDateLabelEs(dateStr) {
  const dt = parseDateYMD(dateStr);
  if (!dt) return { dayName: '', dayNum: '', monthName: '', fullLabel: dateStr };
  const dayName = DAY_NAMES_SHORT_ES[dt.getUTCDay()];
  const dayNum = String(dt.getUTCDate()).padStart(2, '0');
  const monthName = MONTH_NAMES_SHORT_ES[dt.getUTCMonth()];
  return {
    dayName,
    dayNum,
    monthName,
    fullLabel: `${dayName} ${dayNum} ${monthName}`
  };
}

function intervalsOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

module.exports = {
  getNowInTimezone,
  timeToMinutes,
  minutesToTime,
  formatTime12h,
  parseDateYMD,
  getDayOfWeek,
  addDays,
  formatDateLabelEs,
  intervalsOverlap
};

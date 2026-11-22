/**
 * S BARBER STUDIO — 4-Step Booking Engine & Client Appointment Lookup (Light Theme)
 */

const KultBooking = {
  init(initialAvailability) {
    const firstService = KultStore.services[0];
    if (firstService && !KultStore.booking.serviceId) {
      KultStore.booking.serviceId = firstService.id;
    }

    if (KultStore.barbers.length > 0 && !KultStore.booking.barberId) {
      KultStore.booking.barberId = KultStore.barbers[0].id;
    }

    if (initialAvailability) {
      this.applyAvailabilityData(initialAvailability);
    }

    this.renderAll();
  },

  applyAvailabilityData(avail) {
    KultStore.booking.availability = avail;
    KultStore.booking.date = avail.selectedDate;
    if (!KultStore.booking.calendarStartDate && avail.days && avail.days.length > 0) {
      KultStore.booking.calendarStartDate = avail.days[0].date;
    }

    const slots = avail.slots || [];
    const currentSlot = slots.find(s => s.time === KultStore.booking.time && s.available);
    if (!currentSlot) {
      const firstAvailSlot = slots.find(s => s.available);
      KultStore.booking.time = firstAvailSlot ? firstAvailSlot.time : null;
    }
  },

  async refreshAvailability({ keepTime = true } = {}) {
    const service = KultStore.getSelectedService();
    if (!service) return;

    KultStore.booking.loadingAvailability = true;
    this.renderCalendarAndSlots();

    try {
      const params = new URLSearchParams({
        serviceId: String(service.id),
        barberId: String(KultStore.booking.barberId || 'any'),
        daysCount: '14'
      });
      if (KultStore.booking.date) {
        params.set('date', KultStore.booking.date);
      }
      if (KultStore.booking.calendarStartDate) {
        params.set('startDate', KultStore.booking.calendarStartDate);
      }

      const prevTime = KultStore.booking.time;
      const avail = await KultAPI.get(`/api/public/availability?${params.toString()}`);
      this.applyAvailabilityData(avail);
      if (!keepTime) {
        const firstOpen = (avail.slots || []).find(s => s.available);
        KultStore.booking.time = firstOpen ? firstOpen.time : null;
      } else if (prevTime) {
        const stillAvailable = (avail.slots || []).find(s => s.time === prevTime && s.available);
        if (stillAvailable) {
          KultStore.booking.time = prevTime;
        }
      }
    } catch (err) {
      KultUI.toast(err.message, 'error');
    } finally {
      KultStore.booking.loadingAvailability = false;
      this.renderBarbers();
      this.renderCalendarAndSlots();
      this.renderStep4Confirmation();
      this.renderSummaryBar();
    }
  },

  renderAll() {
    this.renderStepper();
    this.renderCategories();
    this.renderServices();
    this.renderBarbers();
    this.renderCalendarAndSlots();
    this.renderStep4Confirmation();
    this.renderSummaryBar();
  },

  switchStep(targetStep, shouldScroll = true) {
    const step = Number(targetStep);
    if (step > 1 && !KultStore.booking.serviceId) {
      KultUI.toast('Selecciona un servicio para continuar.', 'error');
      return;
    }
    if (step === 4 && (!KultStore.booking.date || !KultStore.booking.time)) {
      KultUI.toast('Selecciona una fecha y un horario disponible antes de confirmar.', 'error');
      this.switchStep(3, true);
      return;
    }

    KultStore.booking.step = step;
    KultStore.booking.confirmedBooking = null;
    this.renderStepper();
    this.renderStep4Confirmation();
    this.renderSummaryBar();

    if (shouldScroll) {
      const section = document.getElementById(`step-content-${step}`);
      if (section) {
        const y = section.getBoundingClientRect().top + window.scrollY - 84;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      }
    }
  },

  renderStepper() {
    const currentStep = KultStore.booking.step;
    for (let i = 1; i <= 4; i++) {
      const badge = document.getElementById(`step-badge-${i}`);
      const label = document.getElementById(`step-label-${i}`);
      if (!badge || !label) continue;

      if (i === currentStep) {
        badge.className = 'w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-label-md text-label-md shadow-sm transition-transform scale-105';
        badge.textContent = String(i);
        label.className = 'font-label-sm text-label-sm uppercase tracking-wider text-primary font-bold';
      } else if (i < currentStep) {
        badge.className = 'w-8 h-8 rounded-full bg-zinc-200 text-primary flex items-center justify-center font-label-md text-label-md transition-all';
        badge.innerHTML = '<span class="material-symbols-outlined text-[16px]">check</span>';
        label.className = 'font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant';
      } else {
        badge.className = 'w-8 h-8 rounded-full bg-zinc-100 text-on-surface-variant border border-zinc-200 flex items-center justify-center font-label-md text-label-md transition-all';
        badge.textContent = String(i);
        label.className = 'font-label-sm text-label-sm uppercase tracking-wider text-outline';
      }
    }
  },

  renderCategories() {
    const container = document.getElementById('booking-categories-container');
    if (!container) return;

    const activeCat = KultStore.booking.activeCategory;
    const pills = [
      { slug: 'all', name: 'Todos' },
      ...KultStore.categories
    ];

    container.innerHTML = pills.map(cat => {
      const isActive = activeCat === cat.slug;
      const cls = isActive
        ? 'cat-pill px-space-md py-1.5 rounded-full font-label-md text-label-md uppercase bg-primary text-on-primary transition-all shadow-sm shrink-0'
        : 'cat-pill px-space-md py-1.5 rounded-full font-label-md text-label-md uppercase bg-zinc-100 text-on-surface-variant border border-zinc-200 hover:text-primary hover:border-zinc-400 transition-all shrink-0';
      return `
        <button type="button" class="${cls}" onclick="KultBooking.selectCategory('${KultUI.escapeHtml(cat.slug)}')">
          ${KultUI.escapeHtml(cat.name)}
        </button>
      `;
    }).join('');
  },

  selectCategory(slug) {
    KultStore.booking.activeCategory = slug;
    this.renderCategories();
    this.renderServices();
  },

  renderServices() {
    const container = document.getElementById('booking-services-container');
    if (!container) return;

    const activeCat = KultStore.booking.activeCategory;
    const symbol = (KultStore.settings && KultStore.settings.currency_symbol) || '$';
    const filtered = KultStore.services.filter(s => {
      if (activeCat === 'all') return true;
      return s.category_slug === activeCat;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="surface-level-1 rounded-xl p-6 text-center text-zinc-500 font-body-sm">
          No hay servicios activos en esta categoría.
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(srv => {
      const isSelected = Number(srv.id) === Number(KultStore.booking.serviceId);
      const cardClass = isSelected
        ? 'service-card service-card-active cursor-pointer block rounded-xl bg-zinc-50 p-space-md transition-all relative group border border-zinc-900'
        : 'service-card cursor-pointer block rounded-xl bg-white hover:bg-zinc-50 p-space-md transition-all shadow-sm relative group border border-zinc-200';

      const radioClass = isSelected
        ? 'radio-indicator w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center transition-all'
        : 'radio-indicator w-6 h-6 rounded-full bg-zinc-100 border border-zinc-300 text-transparent flex items-center justify-center transition-all';

      return `
        <div class="${cardClass}" onclick="KultBooking.selectService(${srv.id})">
          <div class="flex items-start justify-between gap-space-sm">
            ${srv.image_url ? `
              <img src="${KultUI.escapeHtml(srv.image_url)}" alt="${KultUI.escapeHtml(srv.name)}" class="w-16 h-16 rounded-lg object-cover shrink-0 border border-zinc-200" />
            ` : ''}
            <div class="flex-1 min-w-0">
              <div class="flex items-center flex-wrap gap-space-xs mb-1">
                <span class="font-title-md text-title-md text-primary font-bold">${KultUI.escapeHtml(srv.name)}</span>
                ${srv.badge ? `
                  <span class="inline-flex items-center px-2 py-0.5 rounded bg-zinc-900 text-white font-label-sm text-label-sm uppercase tracking-wider">
                    ${KultUI.escapeHtml(srv.badge)}
                  </span>
                ` : ''}
              </div>
              <p class="font-body-sm text-body-sm text-on-surface-variant line-clamp-2 mb-space-sm">
                ${KultUI.escapeHtml(srv.description)}
              </p>
              <div class="flex items-center flex-wrap gap-space-sm">
                <span class="flex items-center gap-1 font-label-sm text-label-sm text-outline">
                  <span class="material-symbols-outlined text-[16px]">schedule</span> ${srv.duration_minutes} min
                </span>
                <span class="font-label-sm text-label-sm text-outline">•</span>
                <span class="flex items-center gap-1 font-label-sm text-label-sm text-outline">
                  <span class="material-symbols-outlined text-[16px]">${KultUI.escapeHtml(srv.feature_icon || 'brush')}</span>
                  ${KultUI.escapeHtml(srv.feature_label || srv.category_name)}
                </span>
              </div>
            </div>
            <div class="flex flex-col items-end justify-between shrink-0 h-full min-h-[72px]">
              <span class="font-title-lg text-title-lg text-primary font-extrabold">${KultUI.formatPrice(srv.price, symbol)}</span>
              <div class="${radioClass}">
                <span class="material-symbols-outlined text-[18px]">check</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  async selectService(serviceId) {
    KultStore.booking.serviceId = Number(serviceId);
    if (KultStore.booking.step < 1) KultStore.booking.step = 1;

    if (KultStore.booking.barberId !== 'any') {
      const barber = KultStore.barbers.find(b => Number(b.id) === Number(KultStore.booking.barberId));
      if (barber && Array.isArray(barber.service_ids) && !barber.service_ids.includes(Number(serviceId))) {
        KultStore.booking.barberId = 'any';
      }
    }

    this.renderServices();
    this.renderSummaryBar();
    await this.refreshAvailability({ keepTime: true });
  },

  renderBarbers() {
    const container = document.getElementById('booking-barbers-container');
    if (!container) return;

    const selectedServiceId = Number(KultStore.booking.serviceId);
    const currentBarberId = KultStore.booking.barberId;
    const isAnySelected = !currentBarberId || currentBarberId === 'any';
    const avail = KultStore.booking.availability;
    const firstAnyInfo = avail && avail.firstAvailableBarberForAny
      ? `${avail.firstAvailableBarberForAny.name.split(' ')[0]} · ${avail.firstAvailableBarberForAny.firstSlotLabel12h}`
      : 'Sillón libre';

    const compatibleBarbers = KultStore.barbers.filter(b => {
      if (!selectedServiceId || !Array.isArray(b.service_ids) || b.service_ids.length === 0) return true;
      return b.service_ids.includes(selectedServiceId);
    });

    const anyCardHtml = `
      <div class="barber-item shrink-0 w-36 p-space-sm border ${
        isAnySelected
          ? 'selected-barber bg-primary text-on-primary border-primary shadow-md'
          : 'bg-white hover:bg-zinc-50 text-primary border-zinc-200 shadow-sm'
      } rounded-xl flex flex-col items-center text-center cursor-pointer transition-all"
           onclick="KultBooking.selectBarber('any')">
        <div class="w-16 h-16 rounded-full ${
          isAnySelected ? 'bg-white text-primary' : 'bg-zinc-100 text-primary'
        } flex items-center justify-center mb-space-sm shadow-inner">
          <span class="material-symbols-outlined text-[28px]">shuffle</span>
        </div>
        <span class="font-title-md text-title-md font-bold ${isAnySelected ? 'text-on-primary' : 'text-primary'} truncate w-full">Cualquiera</span>
        <span class="font-label-sm text-label-sm ${isAnySelected ? 'text-on-primary/80' : 'text-outline'} uppercase tracking-wider mt-0.5">Más Rápido</span>
        <div class="barber-badge mt-space-sm px-2 py-0.5 rounded-full ${
          isAnySelected ? 'bg-white text-primary font-bold' : 'bg-zinc-100 text-on-surface-variant'
        } font-label-sm text-label-sm truncate max-w-full">
          ${KultUI.escapeHtml(firstAnyInfo)}
        </div>
      </div>
    `;

    const barberCardsHtml = compatibleBarbers.map(b => {
      const isSelected = !isAnySelected && Number(b.id) === Number(currentBarberId);
      const fallbackAvatar = 'https://lh3.googleusercontent.com/aida-public/AB6AXuAN0VZwi_O_6KWfSHVTReQVqEREU-BOVsG3q-n-56KfMCGRcSStXGLRsT_WuGc-8kqbS60KrAXBx9bM6UwISnsT1hc91NZM9aGdr7zsuWYq-EE7z-CGk3e9PYu3JppUFRDK9KbD-wOzRhjm9R36aocHfMmszawyAsWKBn3d6cAmMRZVDbBCBG5diwNe_4Wt-m8ouTv9RbCYGbZJPL1mKfzS5dFQPUMrFqyt3iylmZi5';

      return `
        <div class="barber-item shrink-0 w-36 p-space-sm border ${
          isSelected
            ? 'selected-barber bg-primary text-on-primary border-primary shadow-md'
            : 'bg-white hover:bg-zinc-50 text-primary border-zinc-200 shadow-sm'
        } rounded-xl flex flex-col items-center text-center cursor-pointer transition-all"
             onclick="KultBooking.selectBarber(${b.id})">
          <div class="w-16 h-16 rounded-full overflow-hidden mb-space-sm p-0.5 ${
            isSelected ? 'bg-white' : 'bg-zinc-200'
          }">
            <img class="w-full h-full object-cover rounded-full"
                 src="${KultUI.escapeHtml(b.avatar_url || fallbackAvatar)}"
                 alt="${KultUI.escapeHtml(b.name)}" />
          </div>
          <span class="font-title-md text-title-md font-bold ${isSelected ? 'text-on-primary' : 'text-primary'} truncate w-full">
            ${KultUI.escapeHtml(b.name)}
          </span>
          <span class="font-label-sm text-label-sm ${isSelected ? 'text-on-primary/80' : 'text-outline'} uppercase tracking-wider mt-0.5 truncate w-full">
            ${KultUI.escapeHtml(b.specialty)}
          </span>
          <div class="barber-badge mt-space-sm px-2 py-0.5 rounded-full ${
            isSelected ? 'bg-white text-primary font-bold' : 'bg-zinc-100 text-on-surface-variant'
          } font-label-sm text-label-sm flex items-center gap-1">
            <span class="material-symbols-outlined text-[12px]" style="font-variation-settings: 'FILL' 1;">star</span>
            ${Number(b.rating || 5.0).toFixed(1)}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = anyCardHtml + barberCardsHtml;
  },

  async selectBarber(barberId) {
    KultStore.booking.barberId = barberId === 'any' ? 'any' : Number(barberId);
    if (KultStore.booking.step < 2) {
      KultStore.booking.step = 2;
      this.renderStepper();
    }
    this.renderBarbers();
    this.renderSummaryBar();
    await this.refreshAvailability({ keepTime: true });
  },

  async navigateCalendarDays(offsetDays) {
    const avail = KultStore.booking.availability;
    if (!avail || !avail.days || avail.days.length === 0) return;

    const currentStart = avail.days[0].date;
    const [y, m, d] = currentStart.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + offsetDays, 12, 0, 0));
    const newStart = dt.toISOString().slice(0, 10);

    KultStore.booking.calendarStartDate = newStart < avail.today ? avail.today : newStart;
    KultStore.booking.date = KultStore.booking.calendarStartDate;
    await this.refreshAvailability({ keepTime: false });
  },

  async jumpToDateInput(dateVal) {
    if (!dateVal) return;
    KultStore.booking.calendarStartDate = dateVal;
    KultStore.booking.date = dateVal;
    await this.refreshAvailability({ keepTime: false });
  },

  renderCalendarAndSlots() {
    const datesContainer = document.getElementById('booking-dates-container');
    const slotsContainer = document.getElementById('booking-slots-container');
    const dateInput = document.getElementById('booking-date-jump');
    if (!datesContainer || !slotsContainer) return;

    const avail = KultStore.booking.availability;
    if (KultStore.booking.loadingAvailability && !avail) {
      datesContainer.innerHTML = `<div class="text-xs text-outline py-4">Consultando disponibilidad en tiempo real...</div>`;
      slotsContainer.innerHTML = `<div class="col-span-2 text-xs text-outline py-4">Cargando horarios...</div>`;
      return;
    }

    if (!avail) return;

    if (dateInput) {
      dateInput.min = avail.today;
      dateInput.value = avail.selectedDate || avail.today;
    }

    datesContainer.innerHTML = (avail.days || []).map(day => {
      const isSelected = day.date === KultStore.booking.date;
      const isDisabled = !day.available;

      if (isSelected) {
        return `
          <button type="button"
                  class="date-tile flex flex-col items-center justify-center min-w-[62px] py-3 px-2.5 rounded-xl bg-primary text-on-primary cursor-pointer transition-all shadow-md shrink-0"
                  onclick="KultBooking.selectDate('${day.date}')">
            <span class="font-label-sm text-label-sm uppercase opacity-80">${KultUI.escapeHtml(day.dayName)}</span>
            <span class="font-headline-md text-headline-md font-extrabold my-0.5">${KultUI.escapeHtml(day.dayNum)}</span>
            <span class="font-label-sm text-label-sm opacity-80">${KultUI.escapeHtml(day.monthName)}</span>
          </button>
        `;
      }

      if (isDisabled) {
        return `
          <button type="button"
                  disabled
                  title="${KultUI.escapeHtml(day.reason)}"
                  class="date-tile flex flex-col items-center justify-center min-w-[62px] py-3 px-2.5 rounded-xl bg-zinc-100 text-zinc-400 opacity-60 cursor-not-allowed transition-all shrink-0 border border-zinc-200">
            <span class="font-label-sm text-label-sm uppercase">${KultUI.escapeHtml(day.dayName)}</span>
            <span class="font-headline-md text-headline-md font-extrabold my-0.5 line-through">${KultUI.escapeHtml(day.dayNum)}</span>
            <span class="font-label-sm text-label-sm">Cerrado</span>
          </button>
        `;
      }

      return `
        <button type="button"
                class="date-tile flex flex-col items-center justify-center min-w-[62px] py-3 px-2.5 rounded-xl bg-white hover:bg-zinc-50 text-on-surface cursor-pointer transition-all shrink-0 border border-zinc-200 shadow-sm"
                onclick="KultBooking.selectDate('${day.date}')">
          <span class="font-label-sm text-label-sm uppercase text-outline">${KultUI.escapeHtml(day.dayName)}</span>
          <span class="font-headline-md text-headline-md font-extrabold my-0.5 text-primary">${KultUI.escapeHtml(day.dayNum)}</span>
          <span class="font-label-sm text-label-sm text-outline">${KultUI.escapeHtml(day.monthName)}</span>
        </button>
      `;
    }).join('');

    const slots = avail.slots || [];
    if (slots.length === 0) {
      slotsContainer.innerHTML = `
        <div class="col-span-full surface-level-1 rounded-xl p-5 text-center">
          <span class="material-symbols-outlined text-[24px] text-outline mb-1">event_busy</span>
          <p class="font-title-md text-sm text-primary font-bold">Sin turnos disponibles en esta fecha</p>
          <p class="font-body-sm text-xs text-on-surface-variant mt-1">Selecciona otro día en el calendario o elige "Cualquiera disponible".</p>
        </div>
      `;
      return;
    }

    slotsContainer.innerHTML = slots.map(slot => {
      const isSelected = slot.available && slot.time === KultStore.booking.time;

      if (!slot.available) {
        return `
          <div class="p-space-sm rounded-lg bg-zinc-100 text-zinc-400 font-label-lg text-label-lg uppercase flex items-center justify-between cursor-not-allowed border border-zinc-200">
            <span class="line-through">${KultUI.escapeHtml(slot.label12h)}</span>
            <span class="font-label-sm text-label-sm text-zinc-400">${KultUI.escapeHtml(slot.reason === 'Ocupado' ? 'Lleno' : slot.reason)}</span>
          </div>
        `;
      }

      if (isSelected) {
        return `
          <button type="button"
                  class="time-slot selected-time p-space-sm rounded-lg bg-primary text-on-primary font-label-lg text-label-lg uppercase flex items-center justify-between transition-all shadow-md"
                  onclick="KultBooking.selectTime('${slot.time}')">
            <span class="font-bold">${KultUI.escapeHtml(slot.label12h)}</span>
            <span class="material-symbols-outlined text-[18px]">done</span>
          </button>
        `;
      }

      return `
        <button type="button"
                class="time-slot p-space-sm rounded-lg bg-white hover:bg-zinc-50 text-primary font-label-lg text-label-lg uppercase flex items-center justify-between transition-all border border-zinc-200 shadow-sm"
                onclick="KultBooking.selectTime('${slot.time}')">
          <span>${KultUI.escapeHtml(slot.label12h)}</span>
          <span class="font-label-sm text-label-sm text-[#059669] flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-[#059669]"></span>Libre
          </span>
        </button>
      `;
    }).join('');
  },

  async selectDate(dateStr) {
    KultStore.booking.date = dateStr;
    if (KultStore.booking.step < 3) {
      KultStore.booking.step = 3;
      this.renderStepper();
    }
    await this.refreshAvailability({ keepTime: true });
  },

  selectTime(time24) {
    KultStore.booking.time = time24;
    if (KultStore.booking.step < 3) {
      KultStore.booking.step = 3;
    }
    this.renderStepper();
    this.renderCalendarAndSlots();
    this.renderStep4Confirmation();
    this.renderSummaryBar();
  },

  getSelectedSlotObject() {
    const avail = KultStore.booking.availability;
    if (!avail || !avail.slots) return null;
    return avail.slots.find(s => s.time === KultStore.booking.time) || null;
  },

  renderStep4Confirmation() {
    const container = document.getElementById('booking-step4-container');
    if (!container) return;

    const symbol = (KultStore.settings && KultStore.settings.currency_symbol) || '$';
    const confirmed = KultStore.booking.confirmedBooking;

    if (confirmed) {
      container.innerHTML = `
        <div class="surface-level-1 rounded-xl p-6 border-2 border-[#059669] relative overflow-hidden">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2.5">
              <div class="w-10 h-10 rounded-full bg-[#059669]/15 text-[#059669] flex items-center justify-center">
                <span class="material-symbols-outlined text-[24px]">check_circle</span>
              </div>
              <div>
                <span class="font-label-sm text-label-sm uppercase tracking-widest text-[#059669] block">Reserva Confirmada</span>
                <h3 class="font-headline-md text-xl text-primary font-bold uppercase">Código: ${KultUI.escapeHtml(confirmed.booking_code)}</h3>
              </div>
            </div>
            <span class="px-3 py-1 rounded-full bg-zinc-900 text-white font-label-sm text-label-sm uppercase tracking-widest font-bold">
              ${KultUI.escapeHtml(confirmed.status === 'confirmed' ? 'Confirmada' : 'Registrada')}
            </span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 bg-zinc-50 p-4 rounded-lg border border-zinc-200 mb-5">
            <div>
              <span class="kult-label">Servicio</span>
              <p class="font-title-md text-primary font-bold">${KultUI.escapeHtml(confirmed.service_name)}</p>
              <span class="font-label-sm text-xs text-outline">${confirmed.duration_minutes} minutos</span>
            </div>
            <div>
              <span class="kult-label">Barbero Asignado</span>
              <p class="font-title-md text-primary font-bold">${KultUI.escapeHtml(confirmed.barber_name)}</p>
              <span class="font-label-sm text-xs text-outline">${KultUI.escapeHtml(confirmed.barber_specialty || 'Master Barber')}</span>
            </div>
            <div>
              <span class="kult-label">Fecha y Hora</span>
              <p class="font-title-md text-primary font-bold">${KultUI.escapeHtml(confirmed.date)} · ${KultUI.escapeHtml(confirmed.start_time)} - ${KultUI.escapeHtml(confirmed.end_time)}</p>
            </div>
            <div>
              <span class="kult-label">Cliente &amp; Total</span>
              <p class="font-title-md text-primary font-bold">${KultUI.escapeHtml(confirmed.client_name)} — ${KultUI.formatPrice(confirmed.price, symbol)}</p>
              <span class="font-label-sm text-xs text-outline">${KultUI.escapeHtml(confirmed.client_phone)}</span>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="font-body-sm text-xs text-on-surface-variant">
              Guarda tu código <strong class="text-zinc-900">${KultUI.escapeHtml(confirmed.booking_code)}</strong> para consultar o gestionar tu cita en la sección Agenda.
            </span>
            <div class="flex items-center gap-2">
              <button type="button" class="btn-kult-secondary" onclick="KultApp.switchView('agenda', '${KultUI.escapeHtml(confirmed.booking_code)}')">
                <span class="material-symbols-outlined text-[16px]">receipt_long</span> Ver en Agenda
              </button>
              <button type="button" class="btn-kult-primary" onclick="KultBooking.resetForNewBooking()">
                <span class="material-symbols-outlined text-[16px]">add</span> Nueva Reserva
              </button>
            </div>
          </div>
        </div>
      `;
      return;
    }

    const service = KultStore.getSelectedService();
    const barber = KultStore.getSelectedBarber();
    const slot = this.getSelectedSlotObject();
    const avail = KultStore.booking.availability;
    const assignedBarberName = (barber.id === 'any' && slot && slot.assignedBarber)
      ? `Cualquiera (${slot.assignedBarber.name})`
      : barber.name;

    const dateLabel = avail ? avail.selectedDateLabel : (KultStore.booking.date || 'Sin fecha');
    const timeLabel = slot ? slot.label12h : (KultStore.booking.time || 'Selecciona horario');

    container.innerHTML = `
      <div class="surface-level-1 rounded-xl p-space-md border border-zinc-200">
        <!-- Reservation Ticket Preview -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-4 mb-4 border-b border-zinc-200">
          <div>
            <span class="kult-label">Servicio</span>
            <p class="font-title-md text-sm text-primary font-bold truncate">${service ? KultUI.escapeHtml(service.name) : '-'}</p>
            <span class="font-label-sm text-[11px] text-outline">${service ? `${service.duration_minutes} min` : ''}</span>
          </div>
          <div>
            <span class="kult-label">Especialista</span>
            <p class="font-title-md text-sm text-primary font-bold truncate">${KultUI.escapeHtml(assignedBarberName)}</p>
            <span class="font-label-sm text-[11px] text-outline">${KultUI.escapeHtml(barber.specialty || '')}</span>
          </div>
          <div>
            <span class="kult-label">Fecha &amp; Bloque</span>
            <p class="font-title-md text-sm text-primary font-bold">${KultUI.escapeHtml(dateLabel)}</p>
            <span class="font-label-sm text-[11px] text-[#059669] font-bold">${KultUI.escapeHtml(timeLabel)}</span>
          </div>
          <div>
            <span class="kult-label">Inversión Total</span>
            <p class="font-title-lg text-xl text-primary font-extrabold">${service ? KultUI.formatPrice(service.price, symbol) : '$0'}</p>
            <span class="font-label-sm text-[11px] text-outline">Pago en estudio</span>
          </div>
        </div>

        <!-- Client Information Form -->
        <form id="booking-confirm-form" onsubmit="KultBooking.submitBooking(event)" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="kult-label" for="client-name-input">Nombre Completo *</label>
              <input id="client-name-input"
                     type="text"
                     required
                     minlength="2"
                     placeholder="Ej. Sebastián Mendoza"
                     value="${KultUI.escapeHtml(KultStore.booking.client.name)}"
                     oninput="KultStore.booking.client.name = this.value"
                     class="kult-input" />
            </div>
            <div>
              <label class="kult-label" for="client-phone-input">Teléfono / WhatsApp *</label>
              <input id="client-phone-input"
                     type="tel"
                     required
                     placeholder="Ej. +52 55 4123 7890"
                     value="${KultUI.escapeHtml(KultStore.booking.client.phone)}"
                     oninput="KultStore.booking.client.phone = this.value"
                     class="kult-input" />
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="kult-label" for="client-email-input">Correo Electrónico (Opcional)</label>
              <input id="client-email-input"
                     type="email"
                     placeholder="cliente@dominio.com"
                     value="${KultUI.escapeHtml(KultStore.booking.client.email)}"
                     oninput="KultStore.booking.client.email = this.value"
                     class="kult-input" />
            </div>
            <div>
              <label class="kult-label" for="client-notes-input">Observaciones / Preferencias (Opcional)</label>
              <input id="client-notes-input"
                     type="text"
                     placeholder="Ej. Navaja fría, acabado mate, piel sensible..."
                     value="${KultUI.escapeHtml(KultStore.booking.client.notes)}"
                     oninput="KultStore.booking.client.notes = this.value"
                     class="kult-input" />
            </div>
          </div>

          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div class="text-xs text-on-surface-variant flex items-center gap-2">
              <span class="status-pip-avail shrink-0"></span>
              <span>${KultUI.escapeHtml((KultStore.settings && KultStore.settings.cancellation_policy) || 'Confirmación instantánea con bloqueo de sillón.')}</span>
            </div>
            <button type="submit"
                    id="submit-booking-btn"
                    ${(!KultStore.booking.time || KultStore.booking.submitting) ? 'disabled' : ''}
                    class="btn-kult-primary min-w-[210px]">
              <span>${KultStore.booking.submitting ? 'Procesando...' : 'Confirmar Reserva'}</span>
              <span class="material-symbols-outlined text-[18px]">verified</span>
            </button>
          </div>
        </form>
      </div>
    `;
  },

  renderSummaryBar() {
    const serviceEl = document.getElementById('summary-service');
    const barberEl = document.getElementById('summary-barber');
    const timeEl = document.getElementById('summary-time');
    const priceEl = document.getElementById('summary-price');
    const ctaBtn = document.getElementById('cta-button');
    if (!serviceEl || !barberEl || !timeEl || !priceEl || !ctaBtn) return;

    const symbol = (KultStore.settings && KultStore.settings.currency_symbol) || '$';
    const service = KultStore.getSelectedService();
    const barber = KultStore.getSelectedBarber();
    const avail = KultStore.booking.availability;
    const slot = this.getSelectedSlotObject();

    serviceEl.textContent = service ? service.name : 'Selecciona servicio';
    barberEl.textContent = barber.shortName;

    const dateCompact = avail && avail.selectedDateLabel
      ? avail.selectedDateLabel.split(' ').slice(0, 2).join(' ')
      : (KultStore.booking.date || 'Fecha');
    const timeCompact = slot ? slot.label12h : 'Sin hora';
    timeEl.textContent = `${dateCompact} - ${timeCompact}`;
    priceEl.textContent = service ? KultUI.formatPrice(service.price, symbol) : '$0';

    if (KultStore.booking.confirmedBooking) {
      ctaBtn.innerHTML = `<span>¡Confirmada!</span><span class="material-symbols-outlined text-[20px]">check_circle</span>`;
      return;
    }

    if (KultStore.booking.step < 4) {
      ctaBtn.innerHTML = `<span>Continuar</span><span class="material-symbols-outlined text-[20px]">arrow_forward</span>`;
    } else {
      ctaBtn.innerHTML = `<span>Confirmar</span><span class="material-symbols-outlined text-[20px]">check</span>`;
    }
  },

  handleFloatingContinue() {
    if (KultStore.booking.confirmedBooking) {
      this.resetForNewBooking();
      return;
    }
    if (KultStore.booking.step < 4) {
      const nextStep = KultStore.booking.step + 1;
      this.switchStep(nextStep, true);
    } else {
      const form = document.getElementById('booking-confirm-form');
      if (form) {
        form.requestSubmit();
      }
    }
  },

  async submitBooking(event) {
    if (event) event.preventDefault();
    if (KultStore.booking.submitting) return;

    const service = KultStore.getSelectedService();
    if (!service) {
      KultUI.toast('Selecciona un servicio válido.', 'error');
      return;
    }
    if (!KultStore.booking.date || !KultStore.booking.time) {
      KultUI.toast('Selecciona una fecha y un horario disponible.', 'error');
      this.switchStep(3, true);
      return;
    }

    const name = (KultStore.booking.client.name || '').trim();
    const phone = (KultStore.booking.client.phone || '').trim();
    const email = (KultStore.booking.client.email || '').trim();
    const notes = (KultStore.booking.client.notes || '').trim();

    if (name.length < 2) {
      KultUI.toast('Por favor ingresa tu nombre completo.', 'error');
      document.getElementById('client-name-input')?.focus();
      return;
    }
    if (phone.replace(/[^0-9]/g, '').length < 7) {
      KultUI.toast('Ingresa un número de teléfono válido (mínimo 7 dígitos).', 'error');
      document.getElementById('client-phone-input')?.focus();
      return;
    }

    KultStore.booking.submitting = true;
    this.renderStep4Confirmation();

    try {
      const response = await KultAPI.post('/api/public/bookings', {
        service_id: service.id,
        barber_id: KultStore.booking.barberId || 'any',
        date: KultStore.booking.date,
        start_time: KultStore.booking.time,
        client_name: name,
        client_phone: phone,
        client_email: email,
        notes
      });

      KultStore.booking.confirmedBooking = response.booking;
      const savedCodes = JSON.parse(localStorage.getItem('kult_my_bookings') || '[]');
      if (!savedCodes.includes(response.booking.booking_code)) {
        savedCodes.unshift(response.booking.booking_code);
        localStorage.setItem('kult_my_bookings', JSON.stringify(savedCodes.slice(0, 10)));
      }

      KultUI.toast(`Reserva ${response.booking.booking_code} confirmada con éxito.`);
      await this.refreshAvailability({ keepTime: false });
      KultStore.booking.confirmedBooking = response.booking;
      this.renderStep4Confirmation();
      this.renderSummaryBar();
    } catch (err) {
      KultUI.toast(err.message, 'error');
      if (err.status === 409) {
        await this.refreshAvailability({ keepTime: false });
      }
    } finally {
      KultStore.booking.submitting = false;
      this.renderStep4Confirmation();
    }
  },

  resetForNewBooking() {
    KultStore.booking.confirmedBooking = null;
    KultStore.booking.step = 1;
    this.renderAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  async lookupClientBookings(queryStr) {
    const input = document.getElementById('agenda-lookup-input');
    const resultsContainer = document.getElementById('agenda-lookup-results');
    if (!resultsContainer) return;

    const q = (queryStr !== undefined ? queryStr : (input ? input.value : '')).trim();
    if (!q) {
      const savedCodes = JSON.parse(localStorage.getItem('kult_my_bookings') || '[]');
      if (savedCodes.length > 0) {
        if (input) input.value = savedCodes[0];
        return this.lookupClientBookings(savedCodes[0]);
      }
      resultsContainer.innerHTML = `
        <div class="surface-level-1 rounded-xl p-6 text-center text-on-surface-variant font-body-sm">
          Ingresa tu código de reserva (ej. <span class="text-zinc-900 font-mono font-bold">SBS-841920</span>) o tu número de teléfono para consultar el estado de tus citas.
        </div>
      `;
      return;
    }

    resultsContainer.innerHTML = `<div class="text-sm text-outline py-4">Buscando reservas...</div>`;
    try {
      const data = await KultAPI.get(`/api/public/bookings/lookup?q=${encodeURIComponent(q)}`);
      const list = data.bookings || [];
      if (list.length === 0) {
        resultsContainer.innerHTML = `
          <div class="surface-level-1 rounded-xl p-6 text-center text-on-surface-variant font-body-sm">
            No se encontraron reservas asociadas a "${KultUI.escapeHtml(q)}".
          </div>
        `;
        return;
      }

      const symbol = (KultStore.settings && KultStore.settings.currency_symbol) || '$';
      resultsContainer.innerHTML = list.map(bk => {
        const statusColors = {
          pending: 'bg-amber-50 text-amber-700 border-amber-300',
          confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-300',
          completed: 'bg-zinc-100 text-zinc-800 border-zinc-300',
          cancelled: 'bg-red-50 text-red-700 border-red-300'
        };
        const statusLabels = {
          pending: 'Pendiente',
          confirmed: 'Confirmada',
          completed: 'Completada',
          cancelled: 'Cancelada'
        };

        return `
          <div class="surface-level-1 rounded-xl p-5 border border-zinc-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div class="space-y-1">
              <div class="flex items-center gap-2.5">
                <span class="font-mono text-xs px-2 py-0.5 rounded bg-zinc-900 text-white font-bold">
                  ${KultUI.escapeHtml(bk.booking_code)}
                </span>
                <span class="text-[11px] font-label-sm uppercase px-2.5 py-0.5 rounded-full border ${statusColors[bk.status] || ''}">
                  ${statusLabels[bk.status] || bk.status}
                </span>
              </div>
              <h4 class="font-title-lg text-lg text-primary font-bold">${KultUI.escapeHtml(bk.service_name)}</h4>
              <p class="font-body-sm text-sm text-on-surface-variant">
                Especialista: <strong class="text-zinc-900">${KultUI.escapeHtml(bk.barber_name)}</strong> ·
                Fecha: <strong class="text-zinc-900">${KultUI.escapeHtml(bk.date)}</strong> ·
                Horario: <strong class="text-zinc-900">${KultUI.escapeHtml(bk.start_time)} - ${KultUI.escapeHtml(bk.end_time)}</strong>
              </p>
              <p class="font-label-sm text-xs text-outline">
                Cliente: ${KultUI.escapeHtml(bk.client_name)} (${KultUI.escapeHtml(bk.client_phone)})
              </p>
            </div>
            <div class="flex items-center justify-between md:flex-col md:items-end gap-3">
              <span class="font-title-lg text-xl text-primary font-extrabold">${KultUI.formatPrice(bk.price, symbol)}</span>
              ${(bk.status === 'pending' || bk.status === 'confirmed') ? `
                <button type="button"
                        class="px-3 py-1.5 rounded border border-red-300 text-red-600 hover:bg-red-600 hover:text-white font-label-sm text-label-sm uppercase tracking-wider transition-all"
                        onclick="KultBooking.cancelClientBookingPrompt('${KultUI.escapeHtml(bk.booking_code)}', '${KultUI.escapeHtml(bk.client_phone)}')">
                  Cancelar Cita
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      resultsContainer.innerHTML = `
        <div class="surface-level-1 rounded-xl p-4 text-sm text-red-600">
          ${KultUI.escapeHtml(err.message)}
        </div>
      `;
    }
  },

  async cancelClientBookingPrompt(bookingCode, clientPhone) {
    const confirmed = await KultUI.confirmDialog({
      title: `Cancelar Reserva ${bookingCode}`,
      message: `¿Confirmas que deseas cancelar tu cita ${bookingCode}? El horario quedará libre inmediatamente.`,
      confirmText: 'Sí, Cancelar Cita',
      destructive: true
    });
    if (!confirmed) return;

    try {
      await KultAPI.post(`/api/public/bookings/${encodeURIComponent(bookingCode)}/cancel`, {
        phone: clientPhone
      });
      KultUI.toast('Tu cita ha sido cancelada.');
      await this.lookupClientBookings(bookingCode);
      await this.refreshAvailability({ keepTime: false });
    } catch (err) {
      KultUI.toast(err.message, 'error');
    }
  }
};

window.KultBooking = KultBooking;

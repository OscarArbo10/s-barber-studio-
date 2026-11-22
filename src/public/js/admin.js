/**
 * KULT Barber Studio — Full Administrative & Barber Portal
 */

const KultAdmin = {
  DAY_NAMES: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  selectedScheduleBarberId: '', // '' for General Studio Hours, or numeric barberId
  _bookingFilterTimer: null,
  _clientSearchTimer: null,

  async loadAdminPortal() {
    const container = document.getElementById('admin-portal-content');
    if (!container) return;

    if (!KultStore.user) {
      this.renderAuthGate();
      return;
    }

    try {
      const overview = await KultAPI.get('/api/admin/overview');
      KultStore.admin.overview = overview;
      KultStore.user = overview.user;

      // Also sync public catalog store so public views reflect latest changes immediately
      KultStore.settings = overview.settings;
      KultStore.categories = overview.categories.filter(c => c.active);
      KultStore.services = overview.services.filter(s => s.active);
      KultStore.barbers = overview.barbers.filter(b => b.active);
      if (Array.isArray(overview.portfolio)) {
        KultStore.portfolio = overview.portfolio.filter(p => p.active);
      }

      if (Array.isArray(overview.bookings)) {
        KultStore.admin.bookings = overview.bookings;
      } else {
        await this.loadBookingsList();
      }

      if (Array.isArray(overview.clients)) {
        KultStore.admin.clients = overview.clients;
      } else {
        await this.loadClientsList();
      }

      this.renderAdminShell();
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        KultStore.user = null;
        this.renderAuthGate();
      } else {
        KultUI.toast(err.message, 'error');
      }
    }
  },

  renderAuthGate() {
    const container = document.getElementById('admin-portal-content');
    if (!container) return;

    container.innerHTML = `
      <div class="max-w-md mx-auto my-8 surface-level-1 rounded-xl p-6 md:p-8 border border-zinc-200 shadow-xl">
        <div class="flex items-center gap-3 mb-6">
          <div class="w-12 h-12 rounded-full overflow-hidden border border-zinc-200 shadow-sm shrink-0 bg-white">
            <img src="${KultUI.escapeHtml((KultStore.settings && KultStore.settings.logo_url) || '/img/s-barber-logo.jpg')}"
                 alt="S BARBER STUDIO"
                 decoding="async"
                 class="w-full h-full object-cover scale-110" />
          </div>
          <div>
            <span class="font-label-sm text-label-sm uppercase tracking-widest text-outline">Acceso Restringido</span>
            <h2 class="font-headline-md text-2xl text-primary font-bold uppercase leading-tight">S Barber Console</h2>
          </div>
        </div>

        <p class="font-body-sm text-sm text-on-surface-variant mb-6">
          Inicia sesión con tu cuenta de <strong class="text-zinc-900">Administrador</strong> o <strong class="text-zinc-900">Barbero Especialista</strong> para gestionar operaciones, portafolio, disponibilidad y citas.
        </p>

        <form onsubmit="KultAdmin.handleLogin(event)" class="space-y-4">
          <div>
            <label class="kult-label" for="login-email">Correo Electrónico</label>
            <input id="login-email" type="email" required autocomplete="username" placeholder="Ingresa tu correo electrónico" class="kult-input" />
          </div>
          <div>
            <label class="kult-label" for="login-password">Contraseña</label>
            <input id="login-password" type="password" required autocomplete="current-password" placeholder="Ingresa tu contraseña" class="kult-input" />
          </div>
          <button type="submit" id="login-submit-btn" class="btn-kult-primary w-full py-3">
            <span>Autenticar &amp; Entrar</span>
            <span class="material-symbols-outlined text-[18px]">lock_open</span>
          </button>
        </form>
      </div>
    `;
  },

  fillCredentials(email, password) {
    const emailEl = document.getElementById('login-email');
    const passEl = document.getElementById('login-password');
    if (emailEl && passEl) {
      emailEl.value = email;
      passEl.value = password;
    }
  },

  async handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('login-email')?.value || '';
    const password = document.getElementById('login-password')?.value || '';
    const btn = document.getElementById('login-submit-btn');
    if (btn) btn.disabled = true;

    try {
      const res = await KultAPI.post('/api/auth/login', { email, password });
      localStorage.setItem('kult_token', res.token);
      KultStore.user = res.user;
      KultUI.toast(res.message);
      KultApp.updateHeaderUserBadge();
      await this.loadAdminPortal();
    } catch (err) {
      KultUI.toast(err.message, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  async handleLogout() {
    try {
      await KultAPI.post('/api/auth/logout', {});
    } catch (_) {
      // Ignore logout network error
    }
    localStorage.removeItem('kult_token');
    KultStore.user = null;
    KultStore.admin.overview = null;
    KultApp.updateHeaderUserBadge();
    KultUI.toast('Sesión cerrada.');
    KultApp.switchView('reservar');
  },

  switchTab(tabName) {
    KultStore.admin.activeTab = tabName;
    this.renderAdminShell();
  },

  renderAdminShell() {
    const container = document.getElementById('admin-portal-content');
    if (!container || !KultStore.admin.overview) return;

    const user = KultStore.user;
    const isAdmin = user && user.role === 'admin';
    const activeTab = KultStore.admin.activeTab;

    const tabs = [
      { id: 'dashboard', label: 'Dashboard', icon: 'monitoring', roles: ['admin', 'barber'] },
      { id: 'reservas', label: 'Reservas', icon: 'calendar_month', roles: ['admin', 'barber'] },
      { id: 'portafolio', label: 'Portafolio (Fotos & Videos)', icon: 'perm_media', roles: ['admin', 'barber'] },
      { id: 'servicios', label: 'Servicios', icon: 'design_services', roles: ['admin'] },
      { id: 'barberos', label: isAdmin ? 'Barberos' : 'Mi Perfil', icon: 'badge', roles: ['admin', 'barber'] },
      { id: 'horarios', label: 'Horarios & Bloqueos', icon: 'schedule', roles: ['admin', 'barber'] },
      { id: 'clientes', label: 'Clientes', icon: 'group', roles: ['admin', 'barber'] },
      { id: 'config', label: 'Configuración', icon: 'tune', roles: ['admin'] }
    ].filter(t => t.roles.includes(user.role));

    if (!tabs.some(t => t.id === activeTab)) {
      KultStore.admin.activeTab = 'dashboard';
    }

    container.innerHTML = `
      <!-- Admin Header Bar -->
      <div class="surface-level-1 rounded-xl p-4 md:p-5 mb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-zinc-900 text-white flex items-center justify-center font-headline-md font-extrabold text-lg">
            ${KultUI.escapeHtml(user.name[0])}
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="font-headline-md text-xl text-primary font-bold uppercase">${KultUI.escapeHtml(user.name)}</h2>
              <span class="px-2 py-0.5 rounded-full bg-zinc-100 border border-zinc-200 text-zinc-900 font-label-sm text-[10px] uppercase tracking-widest">
                ${user.role === 'admin' ? 'Administrador Total' : 'Barbero Especialista'}
              </span>
            </div>
            <p class="font-body-sm text-xs text-on-surface-variant">${KultUI.escapeHtml(user.email)}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class="btn-kult-secondary text-xs" onclick="KultAdmin.openNewBookingModal()">
            <span class="material-symbols-outlined text-[16px]">add_circle</span> Nueva Cita Manual
          </button>
          <button type="button" class="btn-kult-secondary text-xs border-red-300 text-red-600 hover:border-red-600" onclick="KultAdmin.handleLogout()">
            <span class="material-symbols-outlined text-[16px]">logout</span> Salir
          </button>
        </div>
      </div>

      <!-- Admin Sub-navigation Tabs -->
      <div class="flex items-center gap-2 overflow-x-auto pb-2 mb-6 no-scrollbar">
        ${tabs.map(t => {
          const isCurrent = KultStore.admin.activeTab === t.id;
          return `
            <button type="button"
                    onclick="KultAdmin.switchTab('${t.id}')"
                    class="px-4 py-2.5 rounded-lg font-label-md text-xs uppercase tracking-wider flex items-center gap-2 shrink-0 transition-all ${
                      isCurrent
                        ? 'bg-primary text-on-primary font-bold shadow-md'
                        : 'surface-level-1 text-on-surface-variant hover:text-primary'
                    }">
              <span class="material-symbols-outlined text-[17px]">${t.icon}</span>
              <span>${KultUI.escapeHtml(t.label)}</span>
            </button>
          `;
        }).join('')}
      </div>

      <!-- Active Tab Workspace -->
      <div id="admin-tab-workspace"></div>
    `;

    const workspace = document.getElementById('admin-tab-workspace');
    switch (KultStore.admin.activeTab) {
      case 'dashboard':
        this.renderDashboardTab(workspace);
        break;
      case 'reservas':
        this.renderBookingsTab(workspace);
        break;
      case 'portafolio':
        this.renderPortfolioTab(workspace);
        break;
      case 'servicios':
        this.renderServicesTab(workspace);
        break;
      case 'barberos':
        this.renderBarbersTab(workspace);
        break;
      case 'horarios':
        this.renderSchedulesTab(workspace);
        break;
      case 'clientes':
        this.renderClientsTab(workspace);
        break;
      case 'config':
        this.renderConfigTab(workspace);
        break;
    }
  },

  // ============================================================================
  // 1. DASHBOARD TAB
  // ============================================================================
  renderDashboardTab(workspace) {
    const { dashboard } = KultStore.admin.overview;
    const { kpis, topServices, barberPerformance, upcomingAppointments, dailyChart, currencySymbol } = dashboard;
    const maxChartRevenue = Math.max(100, ...dailyChart.map(d => d.revenue));
    const maxServiceBookings = Math.max(1, ...topServices.map(s => s.bookings_count));

    workspace.innerHTML = `
      <!-- KPI Cards Grid -->
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4 mb-6">
        <div class="surface-level-1 rounded-xl p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="kult-label m-0">Reservas Hoy</span>
            <span class="material-symbols-outlined text-zinc-900/60 text-[20px]">today</span>
          </div>
          <p class="font-headline-lg text-3xl text-primary font-bold">${kpis.todayBookings}</p>
          <span class="font-label-sm text-[11px] text-[#10B981]">Activas en agenda</span>
        </div>

        <div class="surface-level-1 rounded-xl p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="kult-label m-0">Pendientes</span>
            <span class="material-symbols-outlined text-amber-400 text-[20px]">hourglass_top</span>
          </div>
          <p class="font-headline-lg text-3xl text-primary font-bold">${kpis.pendingBookings}</p>
          <span class="font-label-sm text-[11px] text-outline">Por confirmar</span>
        </div>

        <div class="surface-level-1 rounded-xl p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="kult-label m-0">Confirmadas</span>
            <span class="material-symbols-outlined text-[#10B981] text-[20px]">check_circle</span>
          </div>
          <p class="font-headline-lg text-3xl text-primary font-bold">${kpis.confirmedBookings}</p>
          <span class="font-label-sm text-[11px] text-outline">Confirmadas y completadas</span>
        </div>

        <div class="surface-level-1 rounded-xl p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="kult-label m-0">Canceladas</span>
            <span class="material-symbols-outlined text-[#EF4444] text-[20px]">cancel</span>
          </div>
          <p class="font-headline-lg text-3xl text-primary font-bold">${kpis.cancelledBookings}</p>
          <span class="font-label-sm text-[11px] text-outline">Histórico cancelado</span>
        </div>

        <div class="surface-level-1 rounded-xl p-4 col-span-2 lg:col-span-1 border-white/25">
          <div class="flex items-center justify-between mb-2">
            <span class="kult-label m-0">Ingresos Registrados</span>
            <span class="material-symbols-outlined text-primary text-[20px]">payments</span>
          </div>
          <p class="font-headline-lg text-3xl text-primary font-extrabold">${KultUI.formatPrice(kpis.totalRevenue, currencySymbol)}</p>
          <span class="font-label-sm text-[11px] text-[#10B981]">Hoy: ${KultUI.formatPrice(kpis.todayRevenue, currencySymbol)}</span>
        </div>
      </div>

      <!-- Charts & Analytics Row -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-6">
        <!-- 7-Day Activity & Revenue Bar Chart -->
        <div class="lg:col-span-7 surface-level-1 rounded-xl p-5">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="font-headline-md text-lg text-primary font-bold uppercase">Flujo de Ingresos & Citas (7 Días)</h3>
              <span class="font-body-sm text-xs text-on-surface-variant">Comportamiento operativo alrededor de la fecha actual</span>
            </div>
            <span class="font-label-sm text-xs uppercase text-outline">${dashboard.today}</span>
          </div>
          <div class="grid grid-cols-7 gap-2 items-end h-44 pt-6 px-1 border-b border-zinc-200">
            ${dailyChart.map(d => {
              const heightPct = Math.max(10, Math.round((d.revenue / maxChartRevenue) * 100));
              const barColor = d.isToday ? 'bg-primary' : 'bg-surface-container-highest hover:bg-white/60';
              return `
                <div class="flex flex-col items-center h-full justify-end group">
                  <span class="font-label-sm text-[10px] text-on-surface-variant mb-1">
                    ${KultUI.formatPrice(d.revenue, currencySymbol)}
                  </span>
                  <div class="w-full max-w-[36px] rounded-t ${barColor} transition-all" style="height: ${heightPct}%"></div>
                </div>
              `;
            }).join('')}
          </div>
          <div class="grid grid-cols-7 gap-2 pt-2 text-center">
            ${dailyChart.map(d => `
              <div class="flex flex-col">
                <span class="font-label-sm text-[10px] uppercase ${d.isToday ? 'text-primary font-bold' : 'text-outline'}">${KultUI.escapeHtml(d.label)}</span>
                <span class="font-body-sm text-[11px] text-on-surface-variant">${d.bookings} citas</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Most Requested Services -->
        <div class="lg:col-span-5 surface-level-1 rounded-xl p-5">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="font-headline-md text-lg text-primary font-bold uppercase">Servicios Más Solicitados</h3>
              <span class="font-body-sm text-xs text-on-surface-variant">Demanda real e ingresos por servicio</span>
            </div>
          </div>
          <div class="space-y-3.5">
            ${topServices.map(srv => {
              const pct = Math.round((srv.bookings_count / maxServiceBookings) * 100);
              return `
                <div>
                  <div class="flex items-center justify-between text-xs mb-1">
                    <span class="font-title-md text-sm text-primary font-bold">${KultUI.escapeHtml(srv.name)}</span>
                    <span class="font-label-sm text-outline">${srv.bookings_count} citas · <strong class="text-zinc-900">${KultUI.formatPrice(srv.revenue, currencySymbol)}</strong></span>
                  </div>
                  <div class="w-full h-2 rounded-full bg-surface-container-highest overflow-hidden">
                    <div class="h-full bg-primary rounded-full transition-all" style="width: ${Math.max(8, pct)}%"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- Barber Performance & Upcoming Appointments -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <!-- Rendimiento por Barbero -->
        <div class="lg:col-span-5 surface-level-1 rounded-xl p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-headline-md text-lg text-primary font-bold uppercase">Rendimiento por Barbero</h3>
            <span class="font-label-sm text-label-sm uppercase text-outline">Productividad</span>
          </div>
          <div class="space-y-3">
            ${barberPerformance.map(bp => `
              <div class="surface-level-2 rounded-lg p-3 flex items-center justify-between gap-3">
                <div class="flex items-center gap-3 min-w-0">
                  <img src="${KultUI.escapeHtml(bp.avatar_url)}" alt="${KultUI.escapeHtml(bp.name)}" class="w-11 h-11 rounded-full object-cover border border-white/20 shrink-0" />
                  <div class="min-w-0">
                    <p class="font-title-md text-sm text-primary font-bold truncate">${KultUI.escapeHtml(bp.name)}</p>
                    <span class="font-label-sm text-[10px] uppercase text-outline block">${KultUI.escapeHtml(bp.specialty)} · ★ ${Number(bp.rating).toFixed(1)}</span>
                  </div>
                </div>
                <div class="text-right shrink-0">
                  <p class="font-title-md text-base text-primary font-extrabold">${KultUI.formatPrice(bp.revenue, currencySymbol)}</p>
                  <span class="font-label-sm text-[10px] text-[#10B981]">${bp.completed_or_confirmed || 0} efectivas</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Próximas Citas -->
        <div class="lg:col-span-7 surface-level-1 rounded-xl p-5">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="font-headline-md text-lg text-primary font-bold uppercase">Próximas Citas en Agenda</h3>
              <span class="font-body-sm text-xs text-on-surface-variant">Control inmediato de sesiones programadas</span>
            </div>
            <button type="button" class="btn-kult-secondary text-xs py-1.5" onclick="KultAdmin.switchTab('reservas')">
              Ver Todas
            </button>
          </div>

          ${upcomingAppointments.length === 0 ? `
            <div class="text-center py-8 text-sm text-outline">No hay citas próximas programadas.</div>
          ` : `
            <div class="space-y-2.5">
              ${upcomingAppointments.map(bk => `
                <div class="surface-level-2 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div class="space-y-0.5">
                    <div class="flex items-center gap-2">
                      <span class="font-mono text-xs px-2 py-0.5 rounded bg-zinc-100 text-zinc-900 border border-zinc-200 font-bold">${KultUI.escapeHtml(bk.booking_code)}</span>
                      <span class="font-label-sm text-xs text-[#10B981] uppercase">${KultUI.escapeHtml(bk.date)} · ${KultUI.escapeHtml(bk.start_time)}</span>
                      <span class="text-[10px] uppercase px-2 py-0.5 rounded-full ${
                        bk.status === 'confirmed' ? 'bg-[#10B981]/20 text-[#10B981]' : 'bg-amber-500/20 text-amber-300'
                      }">${bk.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}</span>
                    </div>
                    <p class="font-title-md text-sm text-primary font-bold">${KultUI.escapeHtml(bk.client_name)} — ${KultUI.escapeHtml(bk.service_name)}</p>
                    <span class="font-body-sm text-xs text-on-surface-variant">Barbero: ${KultUI.escapeHtml(bk.barber_name)} · Tel: ${KultUI.escapeHtml(bk.client_phone)}</span>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0">
                    ${bk.status === 'pending' ? `
                      <button type="button" title="Confirmar" class="px-2.5 py-1.5 rounded bg-[#10B981] text-black font-label-sm text-[10px] uppercase font-bold" onclick="KultAdmin.quickUpdateBookingStatus(${bk.id}, 'confirmed')">
                        Confirmar
                      </button>
                    ` : ''}
                    <button type="button" title="Completar" class="px-2.5 py-1.5 rounded bg-zinc-900 text-white font-label-sm text-[10px] uppercase font-bold" onclick="KultAdmin.quickUpdateBookingStatus(${bk.id}, 'completed')">
                      Completar
                    </button>
                    <button type="button" title="Editar / Reprogramar" class="btn-kult-secondary py-1.5 px-2.5 text-[10px]" onclick="KultAdmin.openBookingDetailModal(${bk.id})">
                      Gestionar
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    `;
  },

  // ============================================================================
  // 2. GESTIÓN DE RESERVAS TAB
  // ============================================================================
  async loadBookingsList() {
    const f = KultStore.admin.filters;
    const params = new URLSearchParams();
    if (f.search) params.set('search', f.search);
    if (f.date) params.set('date', f.date);
    if (f.barberId) params.set('barberId', f.barberId);
    if (f.serviceId) params.set('serviceId', f.serviceId);
    if (f.status) params.set('status', f.status);

    const data = await KultAPI.get(`/api/admin/bookings?${params.toString()}`);
    KultStore.admin.bookings = data.bookings || [];
  },

  applyBookingFilters() {
    KultStore.admin.filters.search = document.getElementById('filter-booking-search')?.value || '';
    KultStore.admin.filters.date = document.getElementById('filter-booking-date')?.value || '';
    KultStore.admin.filters.barberId = document.getElementById('filter-booking-barber')?.value || '';
    KultStore.admin.filters.serviceId = document.getElementById('filter-booking-service')?.value || '';
    KultStore.admin.filters.status = document.getElementById('filter-booking-status')?.value || '';

    clearTimeout(this._bookingFilterTimer);
    this._bookingFilterTimer = setTimeout(async () => {
      await this.loadBookingsList();
      this.renderBookingsTableRows();
    }, 220);
  },

  async resetBookingFilters() {
    KultStore.admin.filters = { search: '', date: '', barberId: '', serviceId: '', status: '' };
    await this.loadBookingsList();
    const workspace = document.getElementById('admin-tab-workspace');
    if (workspace) this.renderBookingsTab(workspace);
  },

  renderBookingsTab(workspace) {
    const { barbers, services } = KultStore.admin.overview;
    const f = KultStore.admin.filters;
    const isAdmin = KultStore.user && KultStore.user.role === 'admin';

    workspace.innerHTML = `
      <div class="surface-level-1 rounded-xl p-5 mb-5">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <div>
            <h3 class="font-headline-md text-lg text-primary font-bold uppercase">Gestión Central de Reservas</h3>
            <span class="font-body-sm text-xs text-on-surface-variant">Cualquier cambio o cancelación actualiza inmediatamente la disponibilidad del calendario</span>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" class="btn-kult-secondary text-xs" onclick="KultAdmin.resetBookingFilters()">
              Limpiar Filtros
            </button>
            <button type="button" class="btn-kult-primary text-xs" onclick="KultAdmin.openNewBookingModal()">
              <span class="material-symbols-outlined text-[16px]">add</span> Registrar Reserva
            </button>
          </div>
        </div>

        <!-- Filters Matrix -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label class="kult-label">Buscar Cliente / Teléfono / Código</label>
            <input id="filter-booking-search" type="text" placeholder="Nombre, teléfono o KLT-..." value="${KultUI.escapeHtml(f.search)}" oninput="KultAdmin.applyBookingFilters()" class="kult-input" />
          </div>
          <div>
            <label class="kult-label">Fecha</label>
            <input id="filter-booking-date" type="date" value="${KultUI.escapeHtml(f.date)}" onchange="KultAdmin.applyBookingFilters()" class="kult-input" />
          </div>
          ${isAdmin ? `
            <div>
              <label class="kult-label">Barbero</label>
              <select id="filter-booking-barber" onchange="KultAdmin.applyBookingFilters()" class="kult-input">
                <option value="">Todos los barberos</option>
                ${barbers.map(b => `<option value="${b.id}" ${String(f.barberId) === String(b.id) ? 'selected' : ''}>${KultUI.escapeHtml(b.name)}</option>`).join('')}
              </select>
            </div>
          ` : ''}
          <div>
            <label class="kult-label">Servicio</label>
            <select id="filter-booking-service" onchange="KultAdmin.applyBookingFilters()" class="kult-input">
              <option value="">Todos los servicios</option>
              ${services.map(s => `<option value="${s.id}" ${String(f.serviceId) === String(s.id) ? 'selected' : ''}>${KultUI.escapeHtml(s.name)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="kult-label">Estado</label>
            <select id="filter-booking-status" onchange="KultAdmin.applyBookingFilters()" class="kult-input">
              <option value="">Todos los estados</option>
              <option value="pending" ${f.status === 'pending' ? 'selected' : ''}>Pendientes</option>
              <option value="confirmed" ${f.status === 'confirmed' ? 'selected' : ''}>Confirmadas</option>
              <option value="completed" ${f.status === 'completed' ? 'selected' : ''}>Completadas</option>
              <option value="cancelled" ${f.status === 'cancelled' ? 'selected' : ''}>Canceladas</option>
            </select>
          </div>
        </div>
      </div>

      <div class="surface-level-1 rounded-xl overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-zinc-200 bg-zinc-50 font-label-sm text-[10px] uppercase tracking-widest text-outline">
                <th class="py-3.5 px-4">Código</th>
                <th class="py-3.5 px-4">Cliente</th>
                <th class="py-3.5 px-4">Servicio</th>
                <th class="py-3.5 px-4">Barbero</th>
                <th class="py-3.5 px-4">Fecha & Hora</th>
                <th class="py-3.5 px-4">Total</th>
                <th class="py-3.5 px-4">Estado</th>
                <th class="py-3.5 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody id="admin-bookings-tbody" class="divide-y divide-white/5 text-sm"></tbody>
          </table>
        </div>
      </div>
    `;

    this.renderBookingsTableRows();
  },

  renderBookingsTableRows() {
    const tbody = document.getElementById('admin-bookings-tbody');
    if (!tbody) return;

    const list = KultStore.admin.bookings || [];
    const symbol = (KultStore.settings && KultStore.settings.currency_symbol) || '$';

    if (list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="py-8 text-center text-outline font-body-sm">
            No se encontraron reservas con los criterios seleccionados.
          </td>
        </tr>
      `;
      return;
    }

    const statusBadge = (st) => {
      const map = {
        pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        confirmed: 'bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30',
        completed: 'bg-white/15 text-zinc-900 border-white/30',
        cancelled: 'bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/30'
      };
      const label = {
        pending: 'Pendiente',
        confirmed: 'Confirmada',
        completed: 'Completada',
        cancelled: 'Cancelada'
      };
      return `<span class="px-2.5 py-0.5 rounded-full border font-label-sm text-[10px] uppercase ${map[st] || ''}">${label[st] || st}</span>`;
    };

    tbody.innerHTML = list.map(bk => `
      <tr class="hover:bg-zinc-50 transition-colors">
        <td class="py-3.5 px-4 font-mono text-xs font-bold text-primary">${KultUI.escapeHtml(bk.booking_code)}</td>
        <td class="py-3.5 px-4">
          <p class="font-title-md text-sm text-primary font-bold">${KultUI.escapeHtml(bk.client_name)}</p>
          <span class="font-label-sm text-xs text-outline">${KultUI.escapeHtml(bk.client_phone)}</span>
        </td>
        <td class="py-3.5 px-4">
          <p class="font-body-sm text-sm text-primary">${KultUI.escapeHtml(bk.service_name)}</p>
          <span class="font-label-sm text-xs text-outline">${bk.duration_minutes} min</span>
        </td>
        <td class="py-3.5 px-4 font-body-sm text-sm text-primary">${KultUI.escapeHtml(bk.barber_name)}</td>
        <td class="py-3.5 px-4">
          <p class="font-title-md text-sm text-primary font-bold">${KultUI.escapeHtml(bk.date)}</p>
          <span class="font-label-sm text-xs text-[#10B981]">${KultUI.escapeHtml(bk.start_time)} - ${KultUI.escapeHtml(bk.end_time)}</span>
        </td>
        <td class="py-3.5 px-4 font-title-md text-sm font-bold text-primary">${KultUI.formatPrice(bk.price, symbol)}</td>
        <td class="py-3.5 px-4">${statusBadge(bk.status)}</td>
        <td class="py-3.5 px-4 text-right">
          <div class="inline-flex items-center gap-1.5">
            ${bk.status === 'pending' ? `
              <button type="button" class="px-2 py-1 rounded bg-[#10B981] text-black font-label-sm text-[10px] uppercase font-bold" onclick="KultAdmin.quickUpdateBookingStatus(${bk.id}, 'confirmed')">
                Confirmar
              </button>
            ` : ''}
            ${bk.status !== 'cancelled' ? `
              <button type="button" class="px-2 py-1 rounded border border-[#EF4444]/40 text-[#EF4444] hover:bg-[#EF4444] hover:text-white font-label-sm text-[10px] uppercase transition-all" onclick="KultAdmin.quickUpdateBookingStatus(${bk.id}, 'cancelled')">
                Cancelar
              </button>
            ` : ''}
            <button type="button" class="btn-kult-secondary py-1 px-2.5 text-[10px]" onclick="KultAdmin.openBookingDetailModal(${bk.id})">
              Editar / Historial
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  },

  async quickUpdateBookingStatus(bookingId, newStatus) {
    if (newStatus === 'cancelled') {
      const ok = await KultUI.confirmDialog({
        title: 'Cancelar Reserva',
        message: '¿Confirmas la cancelación de esta reserva? El bloque horario se liberará en el calendario.',
        confirmText: 'Cancelar Reserva',
        destructive: true
      });
      if (!ok) return;
    }

    try {
      await KultAPI.put(`/api/admin/bookings/${bookingId}`, { status: newStatus });
      KultUI.toast('Estado de la reserva actualizado.');
      await this.loadAdminPortal();
      await KultBooking.refreshAvailability({ keepTime: true });
    } catch (err) {
      KultUI.toast(err.message, 'error');
    }
  },

  async openBookingDetailModal(bookingId) {
    try {
      const { booking } = await KultAPI.get(`/api/admin/bookings/${bookingId}`);
      const { services, barbers } = KultStore.admin.overview;
      const isAdmin = KultStore.user && KultStore.user.role === 'admin';

      const modal = document.getElementById('generic-admin-modal');
      const content = document.getElementById('generic-admin-modal-content');
      if (!modal || !content) return;

      content.innerHTML = `
        <div class="flex items-center justify-between pb-4 mb-4 border-b border-zinc-200">
          <div>
            <span class="font-label-sm text-label-sm uppercase text-outline">Expediente de Reserva</span>
            <h3 class="font-headline-md text-xl text-primary font-bold uppercase">${KultUI.escapeHtml(booking.booking_code)}</h3>
          </div>
          <button type="button" class="text-outline hover:text-zinc-900" onclick="KultAdmin.closeModal()">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onsubmit="KultAdmin.saveBookingDetail(event, ${booking.id})" class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="kult-label">Nombre del Cliente</label>
              <input id="edit-bk-client-name" type="text" required value="${KultUI.escapeHtml(booking.client_name)}" class="kult-input" />
            </div>
            <div>
              <label class="kult-label">Teléfono</label>
              <input id="edit-bk-client-phone" type="text" required value="${KultUI.escapeHtml(booking.client_phone)}" class="kult-input" />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="kult-label">Servicio</label>
              <select id="edit-bk-service" class="kult-input">
                ${services.map(s => `<option value="${s.id}" ${s.id === booking.service_id ? 'selected' : ''}>${KultUI.escapeHtml(s.name)} (${s.duration_minutes}m - $${s.price})</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="kult-label">Barbero Asignado</label>
              <select id="edit-bk-barber" ${!isAdmin ? 'disabled' : ''} class="kult-input">
                ${barbers.map(b => `<option value="${b.id}" ${b.id === booking.barber_id ? 'selected' : ''}>${KultUI.escapeHtml(b.name)}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="kult-label">Fecha</label>
              <input id="edit-bk-date" type="date" required value="${KultUI.escapeHtml(booking.date)}" class="kult-input" />
            </div>
            <div>
              <label class="kult-label">Hora Inicio (HH:MM)</label>
              <input id="edit-bk-time" type="time" required value="${KultUI.escapeHtml(booking.start_time)}" class="kult-input" />
            </div>
            <div>
              <label class="kult-label">Estado</label>
              <select id="edit-bk-status" class="kult-input">
                <option value="pending" ${booking.status === 'pending' ? 'selected' : ''}>Pendiente</option>
                <option value="confirmed" ${booking.status === 'confirmed' ? 'selected' : ''}>Confirmada</option>
                <option value="completed" ${booking.status === 'completed' ? 'selected' : ''}>Completada</option>
                <option value="cancelled" ${booking.status === 'cancelled' ? 'selected' : ''}>Cancelada</option>
              </select>
            </div>
          </div>

          <div>
            <label class="kult-label">Notas / Observaciones</label>
            <input id="edit-bk-notes" type="text" value="${KultUI.escapeHtml(booking.notes || '')}" class="kult-input" />
          </div>

          <div class="flex items-center justify-end gap-2 pt-2">
            <button type="button" class="btn-kult-secondary" onclick="KultAdmin.closeModal()">Cerrar</button>
            <button type="submit" class="btn-kult-primary">Guardar Cambios</button>
          </div>
        </form>

        <!-- Audit History -->
        <div class="mt-6 pt-4 border-t border-zinc-200">
          <span class="kult-label mb-2">Historial de Movimientos</span>
          <div class="space-y-2 max-h-40 overflow-y-auto pr-1">
            ${(booking.history || []).map(h => `
              <div class="text-xs bg-zinc-50 p-2.5 rounded border border-white/5 flex items-center justify-between gap-2">
                <div>
                  <span class="text-zinc-900 font-semibold">${KultUI.escapeHtml(h.details)}</span>
                  <span class="text-outline block">Por: ${KultUI.escapeHtml(h.performed_by)}</span>
                </div>
                <span class="text-[10px] text-outline shrink-0">${KultUI.escapeHtml(h.created_at)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      modal.classList.remove('hidden');
      modal.classList.add('flex');
    } catch (err) {
      KultUI.toast(err.message, 'error');
    }
  },

  async saveBookingDetail(event, bookingId) {
    event.preventDefault();
    try {
      const payload = {
        client_name: document.getElementById('edit-bk-client-name').value,
        client_phone: document.getElementById('edit-bk-client-phone').value,
        service_id: Number(document.getElementById('edit-bk-service').value),
        barber_id: Number(document.getElementById('edit-bk-barber').value),
        date: document.getElementById('edit-bk-date').value,
        start_time: document.getElementById('edit-bk-time').value,
        status: document.getElementById('edit-bk-status').value,
        notes: document.getElementById('edit-bk-notes').value
      };
      await KultAPI.put(`/api/admin/bookings/${bookingId}`, payload);
      KultUI.toast('Reserva actualizada y disponibilidad sincronizada.');
      this.closeModal();
      await this.loadAdminPortal();
      await KultBooking.refreshAvailability({ keepTime: true });
    } catch (err) {
      KultUI.toast(err.message, 'error');
    }
  },

  openNewBookingModal() {
    const { services, barbers, dashboard } = KultStore.admin.overview;
    const isAdmin = KultStore.user && KultStore.user.role === 'admin';
    const modal = document.getElementById('generic-admin-modal');
    const content = document.getElementById('generic-admin-modal-content');
    if (!modal || !content) return;

    content.innerHTML = `
      <div class="flex items-center justify-between pb-4 mb-4 border-b border-zinc-200">
        <div>
          <span class="font-label-sm text-label-sm uppercase text-outline">Recepción & Walk-In</span>
          <h3 class="font-headline-md text-xl text-primary font-bold uppercase">Registrar Nueva Reserva</h3>
        </div>
        <button type="button" class="text-outline hover:text-zinc-900" onclick="KultAdmin.closeModal()">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <form onsubmit="KultAdmin.createManualBooking(event)" class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="kult-label">Nombre del Cliente *</label>
            <input id="new-bk-name" type="text" required placeholder="Nombre y Apellido" class="kult-input" />
          </div>
          <div>
            <label class="kult-label">Teléfono *</label>
            <input id="new-bk-phone" type="tel" required placeholder="+52 55..." class="kult-input" />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="kult-label">Correo (Opcional)</label>
            <input id="new-bk-email" type="email" placeholder="cliente@correo.com" class="kult-input" />
          </div>
          <div>
            <label class="kult-label">Servicio *</label>
            <select id="new-bk-service" class="kult-input">
              ${services.filter(s => s.active).map(s => `<option value="${s.id}">${KultUI.escapeHtml(s.name)} (${s.duration_minutes}m - $${s.price})</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="kult-label">Barbero</label>
            <select id="new-bk-barber" ${!isAdmin ? 'disabled' : ''} class="kult-input">
              ${isAdmin ? `<option value="any">Cualquiera disponible</option>` : ''}
              ${barbers.filter(b => b.active).map(b => `
                <option value="${b.id}" ${(!isAdmin && b.id === KultStore.user.barber_id) ? 'selected' : ''}>
                  ${KultUI.escapeHtml(b.name)}
                </option>
              `).join('')}
            </select>
          </div>
          <div>
            <label class="kult-label">Fecha *</label>
            <input id="new-bk-date" type="date" required value="${dashboard.today}" class="kult-input" />
          </div>
          <div>
            <label class="kult-label">Hora (HH:MM) *</label>
            <input id="new-bk-time" type="time" required value="12:00" step="900" class="kult-input" />
          </div>
        </div>

        <div>
          <label class="kult-label">Observaciones</label>
          <input id="new-bk-notes" type="text" placeholder="Notas del servicio..." class="kult-input" />
        </div>

        <div class="flex items-center justify-end gap-2 pt-2">
          <button type="button" class="btn-kult-secondary" onclick="KultAdmin.closeModal()">Cancelar</button>
          <button type="submit" class="btn-kult-primary">Confirmar y Bloquear Turno</button>
        </div>
      </form>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  },

  async createManualBooking(event) {
    event.preventDefault();
    try {
      const payload = {
        client_name: document.getElementById('new-bk-name').value,
        client_phone: document.getElementById('new-bk-phone').value,
        client_email: document.getElementById('new-bk-email').value,
        service_id: Number(document.getElementById('new-bk-service').value),
        barber_id: document.getElementById('new-bk-barber').value,
        date: document.getElementById('new-bk-date').value,
        start_time: document.getElementById('new-bk-time').value,
        notes: document.getElementById('new-bk-notes').value
      };
      await KultAPI.post('/api/admin/bookings', payload);
      KultUI.toast('Reserva registrada exitosamente.');
      this.closeModal();
      await this.loadAdminPortal();
      await KultBooking.refreshAvailability({ keepTime: true });
    } catch (err) {
      KultUI.toast(err.message, 'error');
    }
  },

  // ============================================================================
  // 3. GESTIÓN DE SERVICIOS TAB
  // ============================================================================
  renderServicesTab(workspace) {
    const { services, categories } = KultStore.admin.overview;
    const symbol = (KultStore.settings && KultStore.settings.currency_symbol) || '$';

    workspace.innerHTML = `
      <div class="surface-level-1 rounded-xl p-5 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 class="font-headline-md text-lg text-primary font-bold uppercase">Catálogo de Servicios & Categorías</h3>
          <span class="font-body-sm text-xs text-on-surface-variant">Administra precios, duraciones, categorías, estado e imágenes del catálogo</span>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class="btn-kult-secondary text-xs" onclick="KultAdmin.openCategoryModal()">
            <span class="material-symbols-outlined text-[16px]">category</span> + Categoría
          </button>
          <button type="button" class="btn-kult-primary text-xs" onclick="KultAdmin.openServiceModal()">
            <span class="material-symbols-outlined text-[16px]">add</span> Nuevo Servicio
          </button>
        </div>
      </div>

      <!-- Categories Pills Summary -->
      <div class="flex items-center gap-2 flex-wrap mb-5">
        <span class="kult-label m-0 mr-2">Categorías Activas:</span>
        ${categories.map(c => `
          <span class="px-3 py-1 rounded-full surface-level-2 font-label-sm text-xs uppercase text-primary">
            ${KultUI.escapeHtml(c.name)}
          </span>
        `).join('')}
      </div>

      <!-- Services Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${services.map(srv => `
          <div class="surface-level-1 rounded-xl p-5 flex flex-col justify-between gap-4 ${!srv.active ? 'opacity-50' : ''}">
            <div class="flex items-start justify-between gap-3">
              ${srv.image_url ? `
                <img src="${KultUI.escapeHtml(srv.image_url)}" alt="${KultUI.escapeHtml(srv.name)}" class="w-16 h-16 rounded-lg object-cover border border-zinc-200 shrink-0" />
              ` : ''}
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap mb-1">
                  <span class="font-label-sm text-[10px] uppercase px-2 py-0.5 rounded bg-white/10 text-outline">${KultUI.escapeHtml(srv.category_name)}</span>
                  ${srv.badge ? `<span class="font-label-sm text-[10px] uppercase px-2 py-0.5 rounded bg-zinc-900 text-white font-bold">${KultUI.escapeHtml(srv.badge)}</span>` : ''}
                  <span class="font-label-sm text-[10px] uppercase px-2 py-0.5 rounded ${srv.active ? 'bg-[#10B981]/20 text-[#10B981]' : 'bg-[#EF4444]/20 text-[#EF4444]'}">
                    ${srv.active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <h4 class="font-title-lg text-lg text-primary font-bold">${KultUI.escapeHtml(srv.name)}</h4>
                <p class="font-body-sm text-xs text-on-surface-variant mt-1">${KultUI.escapeHtml(srv.description)}</p>
              </div>
              <div class="text-right shrink-0">
                <span class="font-headline-md text-2xl text-primary font-extrabold">${KultUI.formatPrice(srv.price, symbol)}</span>
                <span class="font-label-sm text-xs text-outline block">${srv.duration_minutes} min</span>
              </div>
            </div>

            <div class="flex items-center justify-between pt-3 border-t border-zinc-200">
              <span class="font-label-sm text-xs text-outline flex items-center gap-1">
                <span class="material-symbols-outlined text-[15px]">${KultUI.escapeHtml(srv.feature_icon || 'brush')}</span>
                ${KultUI.escapeHtml(srv.feature_label || '')}
              </span>
              <div class="flex items-center gap-2">
                <button type="button" class="btn-kult-secondary py-1.5 px-3 text-xs" onclick="KultAdmin.openServiceModal(${srv.id})">
                  Editar
                </button>
                <button type="button" class="btn-kult-secondary py-1.5 px-3 text-xs" onclick="KultAdmin.toggleServiceActive(${srv.id}, ${srv.active ? 0 : 1})">
                  ${srv.active ? 'Desactivar' : 'Activar'}
                </button>
                <button type="button" class="px-2.5 py-1.5 rounded border border-[#EF4444]/40 text-[#EF4444] hover:bg-[#EF4444] hover:text-white font-label-sm text-[10px] uppercase transition-all" onclick="KultAdmin.deleteService(${srv.id})">
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  openCategoryModal() {
    const modal = document.getElementById('generic-admin-modal');
    const content = document.getElementById('generic-admin-modal-content');
    if (!modal || !content) return;

    content.innerHTML = `
      <div class="flex items-center justify-between pb-4 mb-4 border-b border-zinc-200">
        <h3 class="font-headline-md text-xl text-primary font-bold uppercase">Nueva Categoría</h3>
        <button type="button" class="text-outline hover:text-zinc-900" onclick="KultAdmin.closeModal()">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <form onsubmit="KultAdmin.saveCategory(event)" class="space-y-4">
        <div>
          <label class="kult-label">Nombre de la Categoría *</label>
          <input id="cat-name-input" type="text" required placeholder="Ej. Colorimetría" class="kult-input" />
        </div>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-kult-secondary" onclick="KultAdmin.closeModal()">Cancelar</button>
          <button type="submit" class="btn-kult-primary">Crear Categoría</button>
        </div>
      </form>
    `;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  },

  async saveCategory(event) {
    event.preventDefault();
    try {
      const name = document.getElementById('cat-name-input').value;
      await KultAPI.post('/api/admin/categories', { name });
      KultUI.toast('Categoría creada.');
      this.closeModal();
      await this.loadAdminPortal();
      KultBooking.renderCategories();
    } catch (err) {
      KultUI.toast(err.message, 'error');
    }
  },

  openServiceModal(serviceId = null) {
    const { services, categories } = KultStore.admin.overview;
    const srv = serviceId ? services.find(s => s.id === Number(serviceId)) : null;

    const modal = document.getElementById('generic-admin-modal');
    const content = document.getElementById('generic-admin-modal-content');
    if (!modal || !content) return;

    content.innerHTML = `
      <div class="flex items-center justify-between pb-4 mb-4 border-b border-zinc-200">
        <h3 class="font-headline-md text-xl text-primary font-bold uppercase">${srv ? 'Editar Servicio' : 'Nuevo Servicio'}</h3>
        <button type="button" class="text-outline hover:text-zinc-900" onclick="KultAdmin.closeModal()">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <form onsubmit="KultAdmin.saveService(event, ${srv ? srv.id : 'null'})" class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="kult-label">Nombre del Servicio *</label>
            <input id="srv-name" type="text" required value="${KultUI.escapeHtml(srv ? srv.name : '')}" placeholder="Ej. Skin Fade Pro" class="kult-input" />
          </div>
          <div>
            <label class="kult-label">Categoría *</label>
            <select id="srv-category" class="kult-input">
              ${categories.map(c => `<option value="${c.id}" ${srv && srv.category_id === c.id ? 'selected' : ''}>${KultUI.escapeHtml(c.name)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label class="kult-label">Precio *</label>
            <input id="srv-price" type="number" step="0.5" min="0" required value="${srv ? srv.price : 35}" class="kult-input" />
          </div>
          <div>
            <label class="kult-label">Duración (min) *</label>
            <input id="srv-duration" type="number" step="5" min="10" required value="${srv ? srv.duration_minutes : 45}" class="kult-input" />
          </div>
          <div>
            <label class="kult-label">Etiqueta / Badge</label>
            <input id="srv-badge" type="text" value="${KultUI.escapeHtml(srv ? srv.badge : '')}" placeholder="Top Choice" class="kult-input" />
          </div>
          <div>
            <label class="kult-label">Atributo Técnico</label>
            <input id="srv-feature-label" type="text" value="${KultUI.escapeHtml(srv ? srv.feature_label : 'Acabado mate')}" class="kult-input" />
          </div>
        </div>

        <div>
          <label class="kult-label">Descripción *</label>
          <textarea id="srv-description" rows="2" required class="kult-input">${KultUI.escapeHtml(srv ? srv.description : '')}</textarea>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <div>
            <label class="kult-label">URL de Imagen (Opcional)</label>
            <input id="srv-image-url" type="text" value="${KultUI.escapeHtml(srv ? srv.image_url : '')}" placeholder="https://... o sube un archivo" class="kult-input" />
          </div>
          <div>
            <label class="kult-label">Subir Imagen desde Equipo</label>
            <input type="file" accept="image/*" onchange="KultAdmin.handleImageUploadInput(this, 'srv-image-url', 'service')" class="kult-input py-2 text-xs" />
          </div>
        </div>

        <div class="flex items-center justify-between pt-2">
          <label class="flex items-center gap-2 cursor-pointer">
            <input id="srv-active" type="checkbox" ${(!srv || srv.active) ? 'checked' : ''} class="w-4 h-4 accent-white" />
            <span class="font-label-sm text-xs uppercase text-primary">Servicio Activo en Catálogo</span>
          </label>
          <div class="flex gap-2">
            <button type="button" class="btn-kult-secondary" onclick="KultAdmin.closeModal()">Cancelar</button>
            <button type="submit" class="btn-kult-primary">Guardar Servicio</button>
          </div>
        </div>
      </form>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  },

  async saveService(event, serviceId) {
    event.preventDefault();
    try {
      const payload = {
        name: document.getElementById('srv-name').value,
        category_id: Number(document.getElementById('srv-category').value),
        price: Number(document.getElementById('srv-price').value),
        duration_minutes: Number(document.getElementById('srv-duration').value),
        badge: document.getElementById('srv-badge').value,
        feature_label: document.getElementById('srv-feature-label').value,
        description: document.getElementById('srv-description').value,
        image_url: document.getElementById('srv-image-url').value,
        active: document.getElementById('srv-active').checked
      };

      if (serviceId) {
        await KultAPI.put(`/api/admin/services/${serviceId}`, payload);
        KultUI.toast('Servicio actualizado.');
      } else {
        await KultAPI.post('/api/admin/services', payload);
        KultUI.toast('Servicio creado.');
      }

      this.closeModal();
      await this.loadAdminPortal();
      KultBooking.renderAll();
    } catch (err) {
      KultUI.toast(err.message, 'error');
    }
  },

  async toggleServiceActive(serviceId, activeState) {
    try {
      await KultAPI.put(`/api/admin/services/${serviceId}`, { active: Boolean(activeState) });
      KultUI.toast(activeState ? 'Servicio activado.' : 'Servicio desactivado.');
      await this.loadAdminPortal();
      KultBooking.renderAll();
    } catch (err) {
      KultUI.toast(err.message, 'error');
    }
  },

  async deleteService(serviceId) {
    const ok = await KultUI.confirmDialog({
      title: 'Eliminar o Desactivar Servicio',
      message: '¿Confirmas que deseas eliminar este servicio? Si tiene reservas históricas se desactivará para conservar la integridad.',
      confirmText: 'Confirmar',
      destructive: true
    });
    if (!ok) return;

    try {
      const res = await KultAPI.delete(`/api/admin/services/${serviceId}`);
      KultUI.toast(res.message);
      await this.loadAdminPortal();
      KultBooking.renderAll();
    } catch (err) {
      KultUI.toast(err.message, 'error');
    }
  },

  // ============================================================================
  // 4. GESTIÓN DE BARBEROS TAB
  // ============================================================================
  renderBarbersTab(workspace) {
    const { barbers } = KultStore.admin.overview;
    const isAdmin = KultStore.user && KultStore.user.role === 'admin';
    const visibleBarbers = isAdmin
      ? barbers
      : barbers.filter(b => b.id === KultStore.user.barber_id);

    workspace.innerHTML = `
      <div class="surface-level-1 rounded-xl p-5 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 class="font-headline-md text-lg text-primary font-bold uppercase">Roster de Barberos Especialistas</h3>
          <span class="font-body-sm text-xs text-on-surface-variant">Configura perfiles, fotografías, especialidades, servicios asignados y estado activo</span>
        </div>
        ${isAdmin ? `
          <button type="button" class="btn-kult-primary text-xs" onclick="KultAdmin.openBarberModal()">
            <span class="material-symbols-outlined text-[16px]">person_add</span> Registrar Barbero
          </button>
        ` : ''}
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        ${visibleBarbers.map(b => `
          <div class="surface-level-1 rounded-xl p-5 flex flex-col justify-between gap-4 ${!b.active ? 'opacity-55' : ''}">
            <div>
              <div class="flex items-center gap-3.5 mb-3">
                <img src="${KultUI.escapeHtml(b.avatar_url)}" alt="${KultUI.escapeHtml(b.name)}" class="w-16 h-16 rounded-full object-cover border border-white/20 shrink-0" />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <h4 class="font-title-lg text-lg text-primary font-bold truncate">${KultUI.escapeHtml(b.name)}</h4>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-label-sm uppercase ${b.active ? 'bg-[#10B981]/20 text-[#10B981]' : 'bg-[#EF4444]/20 text-[#EF4444]'}">
                      ${b.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <span class="font-label-sm text-xs uppercase text-outline block">${KultUI.escapeHtml(b.specialty)} · ★ ${Number(b.rating).toFixed(1)}</span>
                  <span class="font-body-sm text-xs text-on-surface-variant">${KultUI.escapeHtml(b.email || '')}</span>
                </div>
              </div>

              <p class="font-body-sm text-xs text-on-surface-variant mb-3">${KultUI.escapeHtml(b.bio || 'Especialista KULT Barber Studio.')}</p>

              <div>
                <span class="kult-label">Servicios Asignados (${(b.services || []).length})</span>
                <div class="flex flex-wrap gap-1.5">
                  ${(b.services || []).map(s => `
                    <span class="px-2 py-0.5 rounded bg-surface-container-highest text-primary font-label-sm text-[10px]">
                      ${KultUI.escapeHtml(s.service_name)}
                    </span>
                  `).join('')}
                </div>
              </div>
            </div>

            <div class="flex items-center justify-between pt-3 border-t border-zinc-200">
              <span class="font-label-sm text-xs text-outline">${b.total_bookings || 0} citas atendidas</span>
              <div class="flex items-center gap-2">
                <button type="button" class="btn-kult-secondary py-1.5 px-3 text-xs" onclick="KultAdmin.openBarberModal(${b.id})">
                  Editar Perfil & Servicios
                </button>
                ${isAdmin ? `
                  <button type="button" class="btn-kult-secondary py-1.5 px-3 text-xs" onclick="KultAdmin.toggleBarberActive(${b.id}, ${b.active ? 0 : 1})">
                    ${b.active ? 'Desactivar' : 'Activar'}
                  </button>
                ` : ''}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  openBarberModal(barberId = null) {
    const { barbers, services } = KultStore.admin.overview;
    const b = barberId ? barbers.find(x => x.id === Number(barberId)) : null;

    const modal = document.getElementById('generic-admin-modal');
    const content = document.getElementById('generic-admin-modal-content');
    if (!modal || !content) return;

    const assignedIds = b ? (b.service_ids || []) : services.map(s => s.id);

    content.innerHTML = `
      <div class="flex items-center justify-between pb-4 mb-4 border-b border-zinc-200">
        <h3 class="font-headline-md text-xl text-primary font-bold uppercase">${b ? 'Editar Barbero Especialista' : 'Registrar Nuevo Barbero'}</h3>
        <button type="button" class="text-outline hover:text-zinc-900" onclick="KultAdmin.closeModal()">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <form onsubmit="KultAdmin.saveBarber(event, ${b ? b.id : 'null'})" class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="kult-label">Nombre Completo *</label>
            <input id="brb-name" type="text" required value="${KultUI.escapeHtml(b ? b.name : '')}" placeholder="Ej. Mateo Silva" class="kult-input" />
          </div>
          <div>
            <label class="kult-label">Especialidad *</label>
            <input id="brb-specialty" type="text" required value="${KultUI.escapeHtml(b ? b.specialty : '')}" placeholder="Ej. Master Fade" class="kult-input" />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="kult-label">Correo (Acceso Barbero)</label>
            <input id="brb-email" type="email" value="${KultUI.escapeHtml(b ? b.email : '')}" placeholder="barbero@kultstudio.com" class="kult-input" />
          </div>
          <div>
            <label class="kult-label">Teléfono</label>
            <input id="brb-phone" type="text" value="${KultUI.escapeHtml(b ? b.phone : '')}" placeholder="+52 55..." class="kult-input" />
          </div>
          <div>
            <label class="kult-label">Calificación</label>
            <input id="brb-rating" type="number" step="0.1" min="1" max="5" value="${b ? b.rating : 5.0}" class="kult-input" />
          </div>
        </div>

        <div>
          <label class="kult-label">Biografía / Perfil Técnico</label>
          <textarea id="brb-bio" rows="2" class="kult-input">${KultUI.escapeHtml(b ? b.bio : '')}</textarea>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <div>
            <label class="kult-label">Fotografía (URL o Archivo)</label>
            <input id="brb-avatar-url" type="text" value="${KultUI.escapeHtml(b ? b.avatar_url : '')}" placeholder="https://..." class="kult-input" />
          </div>
          <div>
            <label class="kult-label">Subir Fotografía desde Equipo</label>
            <input type="file" accept="image/*" onchange="KultAdmin.handleImageUploadInput(this, 'brb-avatar-url', 'barber')" class="kult-input py-2 text-xs" />
          </div>
        </div>

        <div>
          <span class="kult-label">Servicios que realiza este especialista</span>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-zinc-50 p-3 rounded-lg border border-zinc-200 max-h-40 overflow-y-auto">
            ${services.map(s => `
              <label class="flex items-center gap-2 text-xs text-primary cursor-pointer">
                <input type="checkbox" name="brb-service-chk" value="${s.id}" ${assignedIds.includes(s.id) ? 'checked' : ''} class="w-4 h-4 accent-white" />
                <span>${KultUI.escapeHtml(s.name)} (${s.duration_minutes}m)</span>
              </label>
            `).join('')}
          </div>
        </div>

        <div class="flex items-center justify-between pt-2">
          <label class="flex items-center gap-2 cursor-pointer">
            <input id="brb-active" type="checkbox" ${(!b || b.active) ? 'checked' : ''} class="w-4 h-4 accent-white" />
            <span class="font-label-sm text-xs uppercase text-primary">Profesional Activo</span>
          </label>
          <div class="flex gap-2">
            <button type="button" class="btn-kult-secondary" onclick="KultAdmin.closeModal()">Cancelar</button>
            <button type="submit" class="btn-kult-primary">Guardar Barbero</button>
          </div>
        </div>
      </form>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  },

  async saveBarber(event, barberId) {
    event.preventDefault();
    try {
      const checkedServices = Array.from(document.querySelectorAll('input[name="brb-service-chk"]:checked')).map(el => Number(el.value));
      if (checkedServices.length === 0) {
        KultUI.toast('Asigna al menos un servicio al barbero.', 'error');
        return;
      }

      const payload = {
        name: document.getElementById('brb-name').value,
        specialty: document.getElementById('brb-specialty').value,
        email: document.getElementById('brb-email').value,
        phone: document.getElementById('brb-phone').value,
        rating: Number(document.getElementById('brb-rating').value),
        bio: document.getElementById('brb-bio').value,
        avatar_url: document.getElementById('brb-avatar-url').value,
        service_ids: checkedServices,
        active: document.getElementById('brb-active').checked
      };

      if (barberId) {
        await KultAPI.put(`/api/admin/barbers/${barberId}`, payload);
        KultUI.toast('Perfil de barbero actualizado.');
      } else {
        await KultAPI.post('/api/admin/barbers', payload);
        KultUI.toast('Barbero registrado exitosamente.');
      }

      this.closeModal();
      await this.loadAdminPortal();
      KultBooking.renderAll();
    } catch (err) {
      KultUI.toast(err.message, 'error');
    }
  },

  async toggleBarberActive(barberId, activeState) {
    try {
      await KultAPI.put(`/api/admin/barbers/${barberId}`, { active: Boolean(activeState) });
      KultUI.toast(activeState ? 'Barbero activado.' : 'Barbero desactivado.');
      await this.loadAdminPortal();
      await KultBooking.refreshAvailability({ keepTime: true });
    } catch (err) {
      KultUI.toast(err.message, 'error');
    }
  },

  // ============================================================================
  // 5. GESTIÓN DE HORARIOS & BLOQUEOS TAB
  // ============================================================================
  renderSchedulesTab(workspace) {
    const { studioHours, barbers, blocks, dashboard } = KultStore.admin.overview;
    const isAdmin = KultStore.user && KultStore.user.role === 'admin';

    if (!isAdmin && KultStore.user.barber_id) {
      this.selectedScheduleBarberId = String(KultStore.user.barber_id);
    }

    let currentHours = studioHours;
    if (this.selectedScheduleBarberId) {
      const selectedBarber = barbers.find(b => String(b.id) === String(this.selectedScheduleBarberId));
      if (selectedBarber && selectedBarber.working_hours && selectedBarber.working_hours.length === 7) {
        currentHours = selectedBarber.working_hours;
      }
    }

    const blockTypeLabels = {
      holiday: 'Día Festivo',
      vacation: 'Vacaciones',
      break: 'Descanso Extra',
      special: 'Bloqueo Especial'
    };

    workspace.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <!-- Working Hours Editor -->
        <div class="lg:col-span-7 surface-level-1 rounded-xl p-5">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <h3 class="font-headline-md text-lg text-primary font-bold uppercase">Horarios de Apertura, Cierre & Descansos</h3>
              <span class="font-body-sm text-xs text-on-surface-variant">Configura días laborales y ventanas de comida por estudio o por barbero</span>
            </div>
            ${isAdmin ? `
              <select onchange="KultAdmin.changeScheduleScope(this.value)" class="kult-input sm:w-56">
                <option value="" ${this.selectedScheduleBarberId === '' ? 'selected' : ''}>Horario General del Estudio</option>
                ${barbers.map(b => `
                  <option value="${b.id}" ${String(this.selectedScheduleBarberId) === String(b.id) ? 'selected' : ''}>
                    Barbero: ${KultUI.escapeHtml(b.name)}
                  </option>
                `).join('')}
              </select>
            ` : ''}
          </div>

          <form onsubmit="KultAdmin.saveWorkingHours(event)" class="space-y-2.5">
            ${this.DAY_NAMES.map((dayName, dayIdx) => {
              const row = currentHours.find(h => Number(h.day_of_week) === dayIdx) || {
                day_of_week: dayIdx,
                is_working: 1,
                start_time: '09:30',
                end_time: '20:00',
                break_start: '14:00',
                break_end: '15:00'
              };
              return `
                <div class="surface-level-2 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-12 items-center gap-2.5">
                  <div class="sm:col-span-3 flex items-center gap-2">
                    <input type="checkbox" id="wh-work-${dayIdx}" ${row.is_working ? 'checked' : ''} class="w-4 h-4 accent-white" />
                    <label for="wh-work-${dayIdx}" class="font-title-md text-sm text-primary font-bold cursor-pointer">${dayName}</label>
                  </div>
                  <div class="sm:col-span-4 flex items-center gap-1.5">
                    <span class="font-label-sm text-[10px] uppercase text-outline">Turno:</span>
                    <input type="time" id="wh-start-${dayIdx}" value="${KultUI.escapeHtml(row.start_time)}" class="kult-input py-1 px-2 text-xs" />
                    <span class="text-outline">-</span>
                    <input type="time" id="wh-end-${dayIdx}" value="${KultUI.escapeHtml(row.end_time)}" class="kult-input py-1 px-2 text-xs" />
                  </div>
                  <div class="sm:col-span-5 flex items-center gap-1.5">
                    <span class="font-label-sm text-[10px] uppercase text-outline">Descanso:</span>
                    <input type="time" id="wh-bstart-${dayIdx}" value="${KultUI.escapeHtml(row.break_start || '')}" class="kult-input py-1 px-2 text-xs" />
                    <span class="text-outline">-</span>
                    <input type="time" id="wh-bend-${dayIdx}" value="${KultUI.escapeHtml(row.break_end || '')}" class="kult-input py-1 px-2 text-xs" />
                  </div>
                </div>
              `;
            }).join('')}

            <div class="pt-3 flex justify-end">
              <button type="submit" class="btn-kult-primary">
                <span class="material-symbols-outlined text-[17px]">save</span> Guardar Horarios Laborales
              </button>
            </div>
          </form>
        </div>

        <!-- Holidays, Vacations & Special Blocks -->
        <div class="lg:col-span-5 space-y-5">
          <div class="surface-level-1 rounded-xl p-5">
            <h3 class="font-headline-md text-lg text-primary font-bold uppercase mb-1">Nuevo Bloqueo / Vacaciones / Festivo</h3>
            <p class="font-body-sm text-xs text-on-surface-variant mb-4">
              Bloquea fechas completas o rangos de horas para impedir reservas en esos periodos.
            </p>

            <form onsubmit="KultAdmin.createScheduleBlock(event)" class="space-y-3">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="kult-label">Alcance</label>
                  <select id="blk-barber" ${!isAdmin ? 'disabled' : ''} class="kult-input">
                    ${isAdmin ? `<option value="">Todo el Estudio (General)</option>` : ''}
                    ${barbers.map(b => `
                      <option value="${b.id}" ${(!isAdmin && b.id === KultStore.user.barber_id) ? 'selected' : ''}>
                        ${KultUI.escapeHtml(b.name)}
                      </option>
                    `).join('')}
                  </select>
                </div>
                <div>
                  <label class="kult-label">Tipo de Bloqueo</label>
                  <select id="blk-type" class="kult-input">
                    <option value="holiday">Día Festivo</option>
                    <option value="vacation">Vacaciones</option>
                    <option value="break">Descanso Especial</option>
                    <option value="special">Bloqueo Administrativo</option>
                  </select>
                </div>
              </div>

              <div>
                <label class="kult-label">Título / Motivo *</label>
                <input id="blk-title" type="text" required placeholder="Ej. Mantenimiento de estudio / Vacaciones" class="kult-input" />
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="kult-label">Fecha Inicio *</label>
                  <input id="blk-start-date" type="date" required value="${dashboard.today}" class="kult-input" />
                </div>
                <div>
                  <label class="kult-label">Fecha Fin *</label>
                  <input id="blk-end-date" type="date" required value="${dashboard.today}" class="kult-input" />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="kult-label">Hora Inicio (Vacío = Día completo)</label>
                  <input id="blk-start-time" type="time" class="kult-input" />
                </div>
                <div>
                  <label class="kult-label">Hora Fin (Vacío = Día completo)</label>
                  <input id="blk-end-time" type="time" class="kult-input" />
                </div>
              </div>

              <button type="submit" class="btn-kult-primary w-full">
                <span class="material-symbols-outlined text-[17px]">event_busy</span> Registrar Bloqueo
              </button>
            </form>
          </div>

          <div class="surface-level-1 rounded-xl p-5">
            <h4 class="font-headline-md text-base text-primary font-bold uppercase mb-3">Bloqueos Activos (${blocks.length})</h4>
            ${blocks.length === 0 ? `
              <p class="font-body-sm text-xs text-outline">No hay días festivos, vacaciones ni bloqueos registrados.</p>
            ` : `
              <div class="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                ${blocks.map(blk => `
                  <div class="surface-level-2 rounded-lg p-3 flex items-center justify-between gap-3">
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="px-2 py-0.5 rounded bg-zinc-100 text-zinc-900 border border-zinc-200 font-label-sm text-[10px] uppercase">
                          ${blockTypeLabels[blk.type] || blk.type}
                        </span>
                        <span class="font-label-sm text-xs text-outline">
                          ${blk.barber_name ? KultUI.escapeHtml(blk.barber_name) : 'Todo el Estudio'}
                        </span>
                      </div>
                      <p class="font-title-md text-sm text-primary font-bold mt-1">${KultUI.escapeHtml(blk.title)}</p>
                      <span class="font-label-sm text-xs text-[#10B981]">
                        ${KultUI.escapeHtml(blk.start_date)} al ${KultUI.escapeHtml(blk.end_date)}
                        ${blk.start_time && blk.end_time ? `(${KultUI.escapeHtml(blk.start_time)} - ${KultUI.escapeHtml(blk.end_time)})` : '(Día completo)'}
                      </span>
                    </div>
                    <button type="button" class="text-[#EF4444] hover:opacity-80 p-1" onclick="KultAdmin.deleteScheduleBlock(${blk.id})">
                      <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>
      </div>
    `;
  },

  changeScheduleScope(barberId) {
    this.selectedScheduleBarberId = barberId;
    const workspace = document.getElementById('admin-tab-workspace');
    if (workspace) this.renderSchedulesTab(workspace);
  },

  async saveWorkingHours(event) {
    event.preventDefault();
    try {
      const hours = [];
      for (let d = 0; d <= 6; d++) {
        hours.push({
          day_of_week: d,
          is_working: document.getElementById(`wh-work-${d}`).checked,
          start_time: document.getElementById(`wh-start-${d}`).value,
          end_time: document.getElementById(`wh-end-${d}`).value,
          break_start: document.getElementById(`wh-bstart-${d}`).value,
          break_end: document.getElementById(`wh-bend-${d}`).value
        });
      }
      await KultAPI.put('/api/admin/schedules/hours', {
        barber_id: this.selectedScheduleBarberId ? Number(this.selectedScheduleBarberId) : null,
        hours
      });
      KultUI.toast('Horarios guardados y calendario actualizado.');
      await this.loadAdminPortal();
      await KultBooking.refreshAvailability({ keepTime: true });
    } catch (err) {
      KultUI.toast(err.message, 'error');
    }
  },

  async createScheduleBlock(event) {
    event.preventDefault();
    try {
      const payload = {
        barber_id: document.getElementById('blk-barber').value || null,
        type: document.getElementById('blk-type').value,
        title: document.getElementById('blk-title').value,
        start_date: document.getElementById('blk-start-date').value,
        end_date: document.getElementById('blk-end-date').value,
        start_time: document.getElementById('blk-start-time').value || null,
        end_time: document.getElementById('blk-end-time').value || null
      };
      await KultAPI.post('/api/admin/schedules/blocks', payload);
      KultUI.toast('Bloqueo registrado correctamente.');
      await this.loadAdminPortal();
      await KultBooking.refreshAvailability({ keepTime: true });
    } catch (err) {
      KultUI.toast(err.message, 'error');
    }
  },

  async deleteScheduleBlock(blockId) {
    try {
      await KultAPI.delete(`/api/admin/schedules/blocks/${blockId}`);
      KultUI.toast('Bloqueo eliminado.');
      await this.loadAdminPortal();
      await KultBooking.refreshAvailability({ keepTime: true });
    } catch (err) {
      KultUI.toast(err.message, 'error');
    }
  },

  // ============================================================================
  // 6. GESTIÓN DE CLIENTES TAB
  // ============================================================================
  async loadClientsList(search = '') {
    const data = await KultAPI.get(`/api/admin/clients?search=${encodeURIComponent(search)}`);
    KultStore.admin.clients = data.clients || [];
  },

  handleClientSearch(val) {
    clearTimeout(this._clientSearchTimer);
    this._clientSearchTimer = setTimeout(async () => {
      await this.loadClientsList(val);
      this.renderClientsRows();
    }, 220);
  },

  renderClientsTab(workspace) {
    workspace.innerHTML = `
      <div class="surface-level-1 rounded-xl p-5 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 class="font-headline-md text-lg text-primary font-bold uppercase">Directorio & Historial de Clientes</h3>
          <span class="font-body-sm text-xs text-on-surface-variant">Consulta información de contacto, frecuencia de visitas e historial de servicios</span>
        </div>
        <div class="w-full sm:w-72">
          <input type="text" placeholder="Buscar por nombre, teléfono o correo..." oninput="KultAdmin.handleClientSearch(this.value)" class="kult-input" />
        </div>
      </div>

      <div class="surface-level-1 rounded-xl overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-zinc-200 bg-zinc-50 font-label-sm text-[10px] uppercase tracking-widest text-outline">
                <th class="py-3.5 px-4">Cliente</th>
                <th class="py-3.5 px-4">Teléfono</th>
                <th class="py-3.5 px-4">Correo</th>
                <th class="py-3.5 px-4">Citas Totales</th>
                <th class="py-3.5 px-4">Inversión Total</th>
                <th class="py-3.5 px-4">Última Visita</th>
                <th class="py-3.5 px-4 text-right">Historial</th>
              </tr>
            </thead>
            <tbody id="admin-clients-tbody" class="divide-y divide-white/5 text-sm"></tbody>
          </table>
        </div>
      </div>
    `;

    this.renderClientsRows();
  },

  renderClientsRows() {
    const tbody = document.getElementById('admin-clients-tbody');
    if (!tbody) return;

    const clients = KultStore.admin.clients || [];
    const symbol = (KultStore.settings && KultStore.settings.currency_symbol) || '$';

    if (clients.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="py-8 text-center text-outline font-body-sm">No se encontraron clientes registrados.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = clients.map(c => `
      <tr class="hover:bg-zinc-50 transition-colors">
        <td class="py-3.5 px-4">
          <p class="font-title-md text-sm text-primary font-bold">${KultUI.escapeHtml(c.name)}</p>
          ${c.notes ? `<span class="font-body-sm text-xs text-outline">${KultUI.escapeHtml(c.notes)}</span>` : ''}
        </td>
        <td class="py-3.5 px-4 font-body-sm text-sm text-primary">${KultUI.escapeHtml(c.phone)}</td>
        <td class="py-3.5 px-4 font-body-sm text-sm text-on-surface-variant">${KultUI.escapeHtml(c.email || '-')}</td>
        <td class="py-3.5 px-4 font-title-md text-sm text-primary font-bold">${c.total_bookings || 0}</td>
        <td class="py-3.5 px-4 font-title-md text-sm text-[#10B981] font-bold">${KultUI.formatPrice(c.total_spent || 0, symbol)}</td>
        <td class="py-3.5 px-4 font-label-sm text-xs text-outline">${KultUI.escapeHtml(c.last_visit_date || '-')}</td>
        <td class="py-3.5 px-4 text-right">
          <button type="button" class="btn-kult-secondary py-1 px-3 text-xs" onclick="KultAdmin.openClientHistoryModal(${c.id})">
            Ver Expediente
          </button>
        </td>
      </tr>
    `).join('');
  },

  async openClientHistoryModal(clientId) {
    try {
      const { client } = await KultAPI.get(`/api/admin/clients/${clientId}`);
      const symbol = (KultStore.settings && KultStore.settings.currency_symbol) || '$';
      const isAdmin = KultStore.user && KultStore.user.role === 'admin';

      const modal = document.getElementById('generic-admin-modal');
      const content = document.getElementById('generic-admin-modal-content');
      if (!modal || !content) return;

      content.innerHTML = `
        <div class="flex items-center justify-between pb-4 mb-4 border-b border-zinc-200">
          <div>
            <span class="font-label-sm text-label-sm uppercase text-outline">Ficha de Cliente</span>
            <h3 class="font-headline-md text-xl text-primary font-bold uppercase">${KultUI.escapeHtml(client.name)}</h3>
          </div>
          <button type="button" class="text-outline hover:text-zinc-900" onclick="KultAdmin.closeModal()">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        ${isAdmin ? `
          <form onsubmit="KultAdmin.saveClientInfo(event, ${client.id})" class="space-y-3 mb-6 pb-5 border-b border-zinc-200">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="kult-label">Nombre</label>
                <input id="edit-cl-name" type="text" required value="${KultUI.escapeHtml(client.name)}" class="kult-input" />
              </div>
              <div>
                <label class="kult-label">Teléfono</label>
                <input id="edit-cl-phone" type="text" required value="${KultUI.escapeHtml(client.phone)}" class="kult-input" />
              </div>
              <div>
                <label class="kult-label">Correo</label>
                <input id="edit-cl-email" type="email" value="${KultUI.escapeHtml(client.email || '')}" class="kult-input" />
              </div>
            </div>
            <div>
              <label class="kult-label">Preferencias / Notas Técnicas</label>
              <input id="edit-cl-notes" type="text" value="${KultUI.escapeHtml(client.notes || '')}" class="kult-input" />
            </div>
            <div class="flex justify-end">
              <button type="submit" class="btn-kult-primary py-2 text-xs">Actualizar Contacto</button>
            </div>
          </form>
        ` : ''}

        <div>
          <span class="kult-label mb-2">Historial de Reservas (${(client.bookings || []).length})</span>
          <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
            ${(client.bookings || []).map(bk => `
              <div class="surface-level-2 rounded-lg p-3 flex items-center justify-between gap-3">
                <div>
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-xs text-zinc-900 font-bold">${KultUI.escapeHtml(bk.booking_code)}</span>
                    <span class="font-label-sm text-xs text-[#10B981]">${KultUI.escapeHtml(bk.date)} · ${KultUI.escapeHtml(bk.start_time)}</span>
                  </div>
                  <p class="font-title-md text-sm text-primary font-bold">${KultUI.escapeHtml(bk.service_name)}</p>
                  <span class="font-body-sm text-xs text-outline">Barbero: ${KultUI.escapeHtml(bk.barber_name)}</span>
                </div>
                <div class="text-right">
                  <span class="font-title-md text-sm text-primary font-bold block">${KultUI.formatPrice(bk.price, symbol)}</span>
                  <span class="font-label-sm text-[10px] uppercase text-outline">${KultUI.escapeHtml(bk.status)}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      modal.classList.remove('hidden');
      modal.classList.add('flex');
    } catch (err) {
      KultUI.toast(err.message, 'error');
    }
  },

  async saveClientInfo(event, clientId) {
    event.preventDefault();
    try {
      await KultAPI.put(`/api/admin/clients/${clientId}`, {
        name: document.getElementById('edit-cl-name').value,
        phone: document.getElementById('edit-cl-phone').value,
        email: document.getElementById('edit-cl-email').value,
        notes: document.getElementById('edit-cl-notes').value
      });
      KultUI.toast('Cliente actualizado.');
      this.closeModal();
      await this.loadAdminPortal();
    } catch (err) {
      KultUI.toast(err.message, 'error');
    }
  },

  // ============================================================================
  // 7. CONFIGURACIÓN DEL NEGOCIO & INTEGRACIONES TAB
  // ============================================================================
  renderConfigTab(workspace) {
    const { settings, integrations } = KultStore.admin.overview;

    workspace.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div class="lg:col-span-8 surface-level-1 rounded-xl p-6">
          <h3 class="font-headline-md text-lg text-primary font-bold uppercase mb-1">Identidad Comercial & Parámetros Operativos</h3>
          <p class="font-body-sm text-xs text-on-surface-variant mb-5">
            Configura nombre comercial, logotipo, dirección, contacto, moneda, zona horaria y políticas de reserva.
          </p>

          <form onsubmit="KultAdmin.saveBusinessSettings(event)" class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="kult-label">Nombre Comercial *</label>
                <input id="cfg-name" type="text" required value="${KultUI.escapeHtml(settings.commercial_name)}" class="kult-input" />
              </div>
              <div>
                <label class="kult-label">Eslogan / Subtítulo</label>
                <input id="cfg-tagline" type="text" value="${KultUI.escapeHtml(settings.tagline || '')}" class="kult-input" />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <div>
                <label class="kult-label">Logotipo (URL o Archivo)</label>
                <input id="cfg-logo" type="text" value="${KultUI.escapeHtml(settings.logo_url || '')}" class="kult-input" />
              </div>
              <div>
                <label class="kult-label">Subir Nuevo Logotipo</label>
                <input type="file" accept="image/*" onchange="KultAdmin.handleImageUploadInput(this, 'cfg-logo', 'logo')" class="kult-input py-2 text-xs" />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div class="sm:col-span-1">
                <label class="kult-label">Teléfono Principal</label>
                <input id="cfg-phone" type="text" value="${KultUI.escapeHtml(settings.phone)}" class="kult-input" />
              </div>
              <div class="sm:col-span-1">
                <label class="kult-label">Correo Electrónico</label>
                <input id="cfg-email" type="email" value="${KultUI.escapeHtml(settings.email)}" class="kult-input" />
              </div>
              <div class="sm:col-span-1">
                <label class="kult-label">Dirección del Estudio</label>
                <input id="cfg-address" type="text" value="${KultUI.escapeHtml(settings.address)}" class="kult-input" />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label class="kult-label">Instagram</label>
                <input id="cfg-instagram" type="text" value="${KultUI.escapeHtml(settings.instagram || '')}" class="kult-input" />
              </div>
              <div>
                <label class="kult-label">WhatsApp Business</label>
                <input id="cfg-whatsapp" type="text" value="${KultUI.escapeHtml(settings.whatsapp || '')}" class="kult-input" />
              </div>
              <div>
                <label class="kult-label">TikTok</label>
                <input id="cfg-tiktok" type="text" value="${KultUI.escapeHtml(settings.tiktok || '')}" class="kult-input" />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label class="kult-label">Moneda (ISO)</label>
                <input id="cfg-currency" type="text" value="${KultUI.escapeHtml(settings.currency)}" class="kult-input" />
              </div>
              <div>
                <label class="kult-label">Símbolo de Moneda</label>
                <input id="cfg-symbol" type="text" value="${KultUI.escapeHtml(settings.currency_symbol)}" class="kult-input" />
              </div>
              <div>
                <label class="kult-label">Zona Horaria (IANA)</label>
                <select id="cfg-timezone" class="kult-input">
                  ${[
                    'America/Mexico_City',
                    'America/Bogota',
                    'America/Lima',
                    'America/Santiago',
                    'America/Argentina/Buenos_Aires',
                    'America/New_York',
                    'America/Los_Angeles',
                    'Europe/Madrid'
                  ].map(tz => `<option value="${tz}" ${settings.timezone === tz ? 'selected' : ''}>${tz}</option>`).join('')}
                </select>
              </div>
            </div>

            <div>
              <label class="kult-label">Política de Reserva & Puntualidad</label>
              <input id="cfg-booking-policy" type="text" value="${KultUI.escapeHtml(settings.booking_policy)}" class="kult-input" />
            </div>

            <div>
              <label class="kult-label">Política de Cancelación</label>
              <input id="cfg-cancel-policy" type="text" value="${KultUI.escapeHtml(settings.cancellation_policy)}" class="kult-input" />
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="kult-label">Título Sello de Garantía</label>
                <input id="cfg-hygiene-title" type="text" value="${KultUI.escapeHtml(settings.hygiene_title)}" class="kult-input" />
              </div>
              <div>
                <label class="kult-label">Descripción Sello de Garantía</label>
                <input id="cfg-hygiene-desc" type="text" value="${KultUI.escapeHtml(settings.hygiene_description)}" class="kult-input" />
              </div>
            </div>

            <div class="pt-3 flex justify-end">
              <button type="submit" class="btn-kult-primary">
                <span class="material-symbols-outlined text-[18px]">save</span> Guardar Configuración del Negocio
              </button>
            </div>
          </form>
        </div>

        <!-- Account Security & External Integrations Status -->
        <div class="lg:col-span-4 space-y-4">
          <div class="surface-level-1 rounded-xl p-5">
            <h4 class="font-headline-md text-base text-primary font-bold uppercase mb-1">Seguridad &amp; Acceso (Mi Cuenta)</h4>
            <p class="font-body-sm text-xs text-on-surface-variant mb-4">
              Cambia tu correo de acceso o tu contraseña de administrador.
            </p>
            <form onsubmit="KultAdmin.saveAccountCredentials(event)" class="space-y-3">
              <div>
                <label class="kult-label">Nombre de Usuario</label>
                <input id="acc-name" type="text" required value="${KultUI.escapeHtml(KultStore.user?.name || '')}" class="kult-input" />
              </div>
              <div>
                <label class="kult-label">Correo de Acceso</label>
                <input id="acc-email" type="email" required value="${KultUI.escapeHtml(KultStore.user?.email || '')}" class="kult-input" />
              </div>
              <div>
                <label class="kult-label">Contraseña Actual *</label>
                <input id="acc-current-pass" type="password" required placeholder="Ingresa tu contraseña actual" class="kult-input" />
              </div>
              <div>
                <label class="kult-label">Nueva Contraseña (Opcional)</label>
                <input id="acc-new-pass" type="password" minlength="6" placeholder="Mínimo 6 caracteres" class="kult-input" />
              </div>
              <button type="submit" class="btn-kult-primary w-full py-2.5 text-xs">
                <span class="material-symbols-outlined text-[16px]">key</span> Actualizar Credenciales
              </button>
            </form>
          </div>

          <div class="surface-level-1 rounded-xl p-5">
            <h4 class="font-headline-md text-base text-primary font-bold uppercase mb-2">Estado de Integraciones</h4>
            <p class="font-body-sm text-xs text-on-surface-variant mb-4">
              Conectores preparados en <code class="text-zinc-900">src/services/integrationService.js</code> y configurables vía archivo <code class="text-zinc-900">.env</code>.
            </p>

            <div class="space-y-3">
              <div class="surface-level-2 rounded-lg p-3.5">
                <div class="flex items-center justify-between mb-1">
                  <span class="font-title-md text-sm text-primary font-bold">Almacenamiento de Imágenes</span>
                  <span class="px-2 py-0.5 rounded-full bg-[#10B981]/20 text-[#10B981] font-label-sm text-[10px] uppercase">Activo</span>
                </div>
                <p class="font-body-sm text-xs text-outline">Proveedor: ${KultUI.escapeHtml(integrations.storage.provider)} (${KultUI.escapeHtml(integrations.storage.uploadDir)})</p>
              </div>

              <div class="surface-level-2 rounded-lg p-3.5">
                <div class="flex items-center justify-between mb-1">
                  <span class="font-title-md text-sm text-primary font-bold">Correo Electrónico (SMTP)</span>
                  <span class="px-2 py-0.5 rounded-full ${integrations.email.configured ? 'bg-[#10B981]/20 text-[#10B981]' : 'bg-white/10 text-outline'} font-label-sm text-[10px] uppercase">
                    ${integrations.email.configured ? 'Conectado' : 'Pendiente .env'}
                  </span>
                </div>
                <p class="font-body-sm text-xs text-outline">${KultUI.escapeHtml(integrations.email.provider)}</p>
              </div>

              <div class="surface-level-2 rounded-lg p-3.5">
                <div class="flex items-center justify-between mb-1">
                  <span class="font-title-md text-sm text-primary font-bold">WhatsApp Business API</span>
                  <span class="px-2 py-0.5 rounded-full ${integrations.whatsapp.configured ? 'bg-[#10B981]/20 text-[#10B981]' : 'bg-white/10 text-outline'} font-label-sm text-[10px] uppercase">
                    ${integrations.whatsapp.configured ? 'Conectado' : 'Pendiente .env'}
                  </span>
                </div>
                <p class="font-body-sm text-xs text-outline">${KultUI.escapeHtml(integrations.whatsapp.provider)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  async saveAccountCredentials(event) {
    event.preventDefault();
    try {
      const res = await KultAPI.put('/api/auth/account', {
        name: document.getElementById('acc-name').value,
        email: document.getElementById('acc-email').value,
        current_password: document.getElementById('acc-current-pass').value,
        new_password: document.getElementById('acc-new-pass').value
      });
      KultStore.user = res.user;
      KultApp.updateHeaderUserBadge();
      document.getElementById('acc-current-pass').value = '';
      document.getElementById('acc-new-pass').value = '';
      KultUI.toast(res.message);
      await this.loadAdminPortal();
    } catch (err) {
      KultUI.toast(err.message, 'error');
    }
  },

  async saveBusinessSettings(event) {
    event.preventDefault();
    try {
      const payload = {
        commercial_name: document.getElementById('cfg-name').value,
        tagline: document.getElementById('cfg-tagline').value,
        logo_url: document.getElementById('cfg-logo').value,
        phone: document.getElementById('cfg-phone').value,
        email: document.getElementById('cfg-email').value,
        address: document.getElementById('cfg-address').value,
        instagram: document.getElementById('cfg-instagram').value,
        whatsapp: document.getElementById('cfg-whatsapp').value,
        tiktok: document.getElementById('cfg-tiktok').value,
        currency: document.getElementById('cfg-currency').value,
        currency_symbol: document.getElementById('cfg-symbol').value,
        timezone: document.getElementById('cfg-timezone').value,
        booking_policy: document.getElementById('cfg-booking-policy').value,
        cancellation_policy: document.getElementById('cfg-cancel-policy').value,
        hygiene_title: document.getElementById('cfg-hygiene-title').value,
        hygiene_description: document.getElementById('cfg-hygiene-desc').value
      };

      const res = await KultAPI.put('/api/admin/settings', payload);
      KultStore.settings = res.settings;
      KultUI.toast('Configuración del negocio actualizada.');
      KultApp.applyBranding();
      await this.loadAdminPortal();
    } catch (err) {
      KultUI.toast(err.message, 'error');
    }
  },

  async handleImageUploadInput(fileInput, targetInputId, prefix = 'kult') {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    try {
      KultUI.toast('Subiendo imagen...');
      const dataUrl = await KultAPI.fileToDataUrl(file);
      const res = await KultAPI.post('/api/admin/upload', { dataUrl, prefix });
      const targetEl = document.getElementById(targetInputId);
      if (targetEl) {
        targetEl.value = res.url;
      }
      KultUI.toast('Imagen cargada correctamente.');
    } catch (err) {
      KultUI.toast(err.message, 'error');
    }
  },

  closeModal() {
    const modal = document.getElementById('generic-admin-modal');
    const content = document.getElementById('generic-admin-modal-content');
    if (content) {
      content.querySelectorAll('video').forEach(v => v.pause());
    }
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  },

  // ============================================================================
  // 8. GESTIÓN DE PORTAFOLIO (FOTOS & VIDEOS DE BARBEROS EN INICIO)
  // ============================================================================
  renderPortfolioTab(workspace) {
    const { portfolio = [] } = KultStore.admin.overview;

    workspace.innerHTML = `
      <div class="surface-level-1 rounded-xl p-5 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 class="font-headline-md text-lg text-primary font-bold uppercase">Portafolio del Estudio: Videos &amp; Fotografías</h3>
          <span class="font-body-sm text-xs text-on-surface-variant">
            Administra los videos y fotos de cortes, fades y rituales que se exhiben en el módulo Inicio.
          </span>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class="btn-kult-secondary text-xs" onclick="KultApp.switchView('inicio')">
            <span class="material-symbols-outlined text-[16px]">visibility</span> Ver en Inicio
          </button>
          <button type="button" class="btn-kult-primary text-xs" onclick="KultAdmin.openPortfolioModal()">
            <span class="material-symbols-outlined text-[16px]">add_photo_alternate</span> Subir Foto o Video
          </button>
        </div>
      </div>

      ${portfolio.length === 0 ? `
        <div class="surface-level-1 rounded-xl p-10 text-center text-outline">
          Aún no hay fotos ni videos publicados. Haz clic en "Subir Foto o Video" para agregar tu trabajo.
        </div>
      ` : `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          ${portfolio.map(item => `
            <div class="surface-level-1 rounded-xl overflow-hidden border border-zinc-200 flex flex-col justify-between ${!item.active ? 'opacity-50' : ''}">
              <div>
                <div class="relative h-56 bg-black overflow-hidden">
                  ${item.media_type === 'video' ? `
                    <video src="${KultUI.escapeHtml(item.media_url)}"
                           poster="${KultUI.escapeHtml(item.thumbnail_url || '')}"
                           controls
                           playsinline
                           class="w-full h-full object-cover"></video>
                  ` : `
                    <img src="${KultUI.escapeHtml(item.media_url)}"
                         alt="${KultUI.escapeHtml(item.title)}"
                         class="w-full h-full object-cover" />
                  `}
                  <div class="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                    <span class="px-2 py-0.5 rounded bg-zinc-900 text-white font-label-sm text-[10px] uppercase font-bold">
                      ${item.media_type === 'video' ? 'Video Reel' : 'Fotografía'}
                    </span>
                    ${item.featured ? `
                      <span class="px-2 py-0.5 rounded bg-[#10B981] text-black font-label-sm text-[10px] uppercase font-bold">
                        Destacado
                      </span>
                    ` : ''}
                  </div>
                </div>

                <div class="p-4">
                  <div class="flex items-center justify-between text-xs text-outline mb-1">
                    <span>Autor: <strong class="text-zinc-900">${KultUI.escapeHtml(item.barber_name)}</strong></span>
                    <span>♥ ${item.likes_count || 0}</span>
                  </div>
                  <h4 class="font-title-md text-base text-primary font-bold">${KultUI.escapeHtml(item.title)}</h4>
                  <p class="font-body-sm text-xs text-on-surface-variant line-clamp-2 mt-1">${KultUI.escapeHtml(item.description)}</p>
                </div>
              </div>

              <div class="px-4 py-3 border-t border-zinc-200 flex items-center justify-between">
                <span class="font-label-sm text-[10px] uppercase text-outline">${KultUI.escapeHtml(item.technique_tag || '')}</span>
                <div class="flex items-center gap-1.5">
                  <button type="button" class="btn-kult-secondary py-1 px-2.5 text-xs" onclick="KultAdmin.openPortfolioModal(${item.id})">
                    Editar
                  </button>
                  <button type="button" class="px-2.5 py-1 rounded border border-[#EF4444]/40 text-[#EF4444] hover:bg-[#EF4444] hover:text-white font-label-sm text-[10px] uppercase transition-all" onclick="KultAdmin.deletePortfolioItem(${item.id})">
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    `;
  },

  openPortfolioModal(portfolioId = null) {
    const { portfolio = [], barbers = [], services = [] } = KultStore.admin.overview;
    const item = portfolioId ? portfolio.find(p => Number(p.id) === Number(portfolioId)) : null;
    const isAdmin = KultStore.user && KultStore.user.role === 'admin';

    const modal = document.getElementById('generic-admin-modal');
    const content = document.getElementById('generic-admin-modal-content');
    if (!modal || !content) return;

    content.innerHTML = `
      <div class="flex items-center justify-between pb-4 mb-4 border-b border-zinc-200">
        <div>
          <span class="font-label-sm text-label-sm uppercase text-outline">Lookbook &amp; Reels</span>
          <h3 class="font-headline-md text-xl text-primary font-bold uppercase">${item ? 'Editar Trabajo del Portafolio' : 'Publicar Foto o Video de Trabajo'}</h3>
        </div>
        <button type="button" class="text-outline hover:text-zinc-900" onclick="KultAdmin.closeModal()">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <form onsubmit="KultAdmin.savePortfolioItem(event, ${item ? item.id : 'null'})" class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="kult-label">Título del Corte / Trabajo *</label>
            <input id="pf-title" type="text" required value="${KultUI.escapeHtml(item ? item.title : '')}" placeholder="Ej. Skin Fade Quirúrgico & Textura Crop" class="kult-input" />
          </div>
          <div>
            <label class="kult-label">Tipo de Archivo *</label>
            <select id="pf-media-type" class="kult-input">
              <option value="image" ${(!item || item.media_type === 'image') ? 'selected' : ''}>Fotografía (JPG / PNG / WEBP)</option>
              <option value="video" ${(item && item.media_type === 'video') ? 'selected' : ''}>Video / Reel (MP4 / WEBM)</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="kult-label">Barbero Autor *</label>
            <select id="pf-barber" ${!isAdmin ? 'disabled' : ''} class="kult-input">
              ${barbers.map(b => `
                <option value="${b.id}" ${(item && item.barber_id === b.id) || (!item && !isAdmin && b.id === KultStore.user.barber_id) ? 'selected' : ''}>
                  ${KultUI.escapeHtml(b.name)}
                </option>
              `).join('')}
            </select>
          </div>
          <div>
            <label class="kult-label">Categoría</label>
            <select id="pf-category" class="kult-input">
              <option value="cortes" ${item && item.category_slug === 'cortes' ? 'selected' : ''}>Cortes &amp; Fades</option>
              <option value="barba" ${item && item.category_slug === 'barba' ? 'selected' : ''}>Barba &amp; Navaja</option>
              <option value="combos" ${item && item.category_slug === 'combos' ? 'selected' : ''}>Combos VIP</option>
              <option value="tratamientos" ${item && item.category_slug === 'tratamientos' ? 'selected' : ''}>Tratamientos</option>
            </select>
          </div>
          <div>
            <label class="kult-label">Servicio Vinculado (Para Reserva 1-Click)</label>
            <select id="pf-service" class="kult-input">
              <option value="">Cualquier servicio</option>
              ${services.map(s => `<option value="${s.id}" ${item && item.service_id === s.id ? 'selected' : ''}>${KultUI.escapeHtml(s.name)} ($${s.price})</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="kult-label">Técnica Aplicada (Tag)</label>
            <input id="pf-technique" type="text" value="${KultUI.escapeHtml(item ? item.technique_tag : '0.0mm Foil + Razor Line')}" placeholder="Ej. Drop Fade + Matte Clay" class="kult-input" />
          </div>
          <div>
            <label class="kult-label">Duración / Etiqueta</label>
            <input id="pf-duration" type="text" value="${KultUI.escapeHtml(item ? item.duration_label : '45 min')}" placeholder="Ej. 0:45 Reel o 45 min" class="kult-input" />
          </div>
        </div>

        <div>
          <label class="kult-label">Descripción Técnica del Trabajo</label>
          <textarea id="pf-description" rows="2" placeholder="Explica el proceso, herramientas o acabado de este corte..." class="kult-input">${KultUI.escapeHtml(item ? item.description : '')}</textarea>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <div>
            <label class="kult-label">URL de Foto o Video (.mp4 / .jpg / .webp) *</label>
            <input id="pf-media-url" type="text" required value="${KultUI.escapeHtml(item ? item.media_url : '')}" placeholder="https://... o sube archivo a la derecha" class="kult-input" />
          </div>
          <div>
            <label class="kult-label">Subir Foto o Video desde tu Equipo</label>
            <input type="file" accept="image/*,video/mp4,video/webm" onchange="KultAdmin.handlePortfolioFileUpload(this)" class="kult-input py-2 text-xs" />
          </div>
        </div>

        <div>
          <label class="kult-label">Portada / Poster URL (Opcional para Videos)</label>
          <input id="pf-thumb-url" type="text" value="${KultUI.escapeHtml(item ? item.thumbnail_url : '')}" placeholder="https://... (imagen de portada para el video)" class="kult-input" />
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div class="flex items-center gap-4">
            <label class="flex items-center gap-2 cursor-pointer">
              <input id="pf-featured" type="checkbox" ${(item && item.featured) ? 'checked' : ''} class="w-4 h-4 accent-white" />
              <span class="font-label-sm text-xs uppercase text-primary">Destacar en Inicio</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input id="pf-active" type="checkbox" ${(!item || item.active) ? 'checked' : ''} class="w-4 h-4 accent-white" />
              <span class="font-label-sm text-xs uppercase text-primary">Visible al Público</span>
            </label>
          </div>
          <div class="flex gap-2">
            <button type="button" class="btn-kult-secondary" onclick="KultAdmin.closeModal()">Cancelar</button>
            <button type="submit" class="btn-kult-primary">Publicar Trabajo</button>
          </div>
        </div>
      </form>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  },

  async handlePortfolioFileUpload(fileInput) {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    try {
      const isVid = file.type.startsWith('video/');
      const mediaTypeSelect = document.getElementById('pf-media-type');
      if (mediaTypeSelect) {
        mediaTypeSelect.value = isVid ? 'video' : 'image';
      }
      KultUI.toast(`Subiendo ${isVid ? 'video' : 'fotografía'}...`);
      const dataUrl = await KultAPI.fileToDataUrl(file);
      const res = await KultAPI.post('/api/admin/upload', { dataUrl, prefix: isVid ? 'reel' : 'look' });
      const targetEl = document.getElementById('pf-media-url');
      if (targetEl) targetEl.value = res.url;
      KultUI.toast('Archivo cargado correctamente.');
    } catch (err) {
      KultUI.toast(err.message, 'error');
    }
  },

  async savePortfolioItem(event, portfolioId) {
    event.preventDefault();
    try {
      const payload = {
        title: document.getElementById('pf-title').value,
        media_type: document.getElementById('pf-media-type').value,
        barber_id: Number(document.getElementById('pf-barber').value),
        category_slug: document.getElementById('pf-category').value,
        service_id: document.getElementById('pf-service').value ? Number(document.getElementById('pf-service').value) : null,
        technique_tag: document.getElementById('pf-technique').value,
        duration_label: document.getElementById('pf-duration').value,
        description: document.getElementById('pf-description').value,
        media_url: document.getElementById('pf-media-url').value,
        thumbnail_url: document.getElementById('pf-thumb-url').value,
        featured: document.getElementById('pf-featured').checked,
        active: document.getElementById('pf-active').checked
      };

      if (portfolioId) {
        await KultAPI.put(`/api/admin/portfolio/${portfolioId}`, payload);
        KultUI.toast('Trabajo actualizado en el portafolio.');
      } else {
        await KultAPI.post('/api/admin/portfolio', payload);
        KultUI.toast('Trabajo publicado en la galería de Inicio.');
      }

      this.closeModal();
      const bootstrap = await KultAPI.get('/api/public/bootstrap');
      KultStore.portfolio = bootstrap.portfolio || [];
      KultApp.renderInicioView();
      await this.loadAdminPortal();
    } catch (err) {
      KultUI.toast(err.message, 'error');
    }
  },

  async deletePortfolioItem(portfolioId) {
    const ok = await KultUI.confirmDialog({
      title: 'Eliminar Foto / Video',
      message: '¿Confirmas que deseas eliminar esta publicación del portafolio de Inicio?',
      confirmText: 'Eliminar',
      destructive: true
    });
    if (!ok) return;

    try {
      await KultAPI.delete(`/api/admin/portfolio/${portfolioId}`);
      KultUI.toast('Publicación eliminada.');
      const bootstrap = await KultAPI.get('/api/public/bootstrap');
      KultStore.portfolio = bootstrap.portfolio || [];
      KultApp.renderInicioView();
      await this.loadAdminPortal();
    } catch (err) {
      KultUI.toast(err.message, 'error');
    }
  }
};

window.KultAdmin = KultAdmin;

/**
 * S BARBER STUDIO — Main Application Controller & Barber Work Showcase (Inicio — Mobile & Desktop Responsive)
 */

const KultApp = {
  async init() {
    try {
      const bootstrap = await KultAPI.get('/api/public/bootstrap');
      KultStore.settings = bootstrap.settings;
      KultStore.categories = bootstrap.categories || [];
      KultStore.services = bootstrap.services || [];
      KultStore.barbers = bootstrap.barbers || [];
      KultStore.studioHours = bootstrap.studioHours || [];
      KultStore.portfolio = bootstrap.portfolio || [];
      KultStore.user = bootstrap.user || null;

      this.applyBranding();
      this.updateHeaderUserBadge();
      this.renderInicioView();
      KultBooking.init(bootstrap.initialAvailability);

      const urlParams = new URLSearchParams(window.location.search);
      const pathname = window.location.pathname;

      if (urlParams.get('auth') === 'required') {
        KultUI.toast('Debes iniciar sesión como Administrador o Barbero para acceder a esa ruta.', 'error');
        this.switchView('dashboard');
      } else if (pathname === '/admin' || pathname === '/dashboard') {
        this.switchView('dashboard');
      } else if (pathname === '/agenda' || pathname === '/mis-citas') {
        this.switchView('agenda');
      } else if (pathname === '/reservar') {
        this.switchView('reservar');
      } else {
        this.switchView('inicio');
      }
    } catch (err) {
      KultUI.toast(err.message || 'Error al inicializar S Barber Studio.', 'error');
    }
  },

  applyBranding() {
    const s = KultStore.settings;
    if (!s) return;

    const brandTitle = document.getElementById('header-brand-title');
    const hygieneTitle = document.getElementById('studio-hygiene-title');
    const hygieneDesc = document.getElementById('studio-hygiene-desc');

    if (brandTitle) brandTitle.textContent = s.commercial_name || 'S BARBER STUDIO';
    if (hygieneTitle) hygieneTitle.textContent = s.hygiene_title || 'Protocolo S Barber Zero-Delay';
    if (hygieneDesc) hygieneDesc.textContent = s.hygiene_description;
  },

  updateHeaderUserBadge() {
    const statusDot = document.getElementById('header-user-status-dot');
    const roleLabel = document.getElementById('header-user-role-label');
    if (KultStore.user) {
      if (statusDot) statusDot.className = 'absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#059669] rounded-full ring-2 ring-white';
      if (roleLabel) {
        roleLabel.textContent = `${KultStore.user.name.split(' ')[0]} (${KultStore.user.role === 'admin' ? 'Admin' : 'Barbero'})`;
        roleLabel.classList.remove('hidden');
      }
    } else {
      if (statusDot) statusDot.className = 'absolute bottom-0 right-0 w-2.5 h-2.5 bg-primary rounded-full ring-2 ring-white';
      if (roleLabel) {
        roleLabel.textContent = 'Admin Login';
        roleLabel.classList.add('hidden');
      }
    }
  },

  switchView(viewName, lookupCode = null) {
    KultStore.currentView = viewName;

    const views = ['inicio', 'reservar', 'dashboard', 'agenda'];
    for (const v of views) {
      const section = document.getElementById(`view-${v}`);
      if (section) {
        if (v === viewName) {
          section.classList.remove('hidden');
        } else {
          section.classList.add('hidden');
        }
      }

      const navLink = document.getElementById(`nav-item-${v}`);
      if (navLink) {
        if (v === viewName) {
          navLink.className = 'flex flex-col items-center justify-center gap-0.5 py-1 transition-all text-primary font-bold';
        } else {
          navLink.className = 'flex flex-col items-center justify-center gap-0.5 py-1 text-on-surface-variant hover:text-on-surface transition-all';
        }
      }

      const deskLink = document.getElementById(`desk-nav-${v}`);
      if (deskLink) {
        if (v === viewName) {
          deskLink.className = 'font-label-md text-xs uppercase tracking-widest text-primary border-b-2 border-primary pb-1 font-bold transition-all';
        } else {
          deskLink.className = 'font-label-md text-xs uppercase tracking-widest text-on-surface-variant hover:text-primary pb-1 transition-all';
        }
      }
    }

    const headerSub = document.getElementById('header-brand-subtitle');
    const floatingBar = document.getElementById('floating-booking-summary-bar');

    if (viewName === 'reservar') {
      if (headerSub) headerSub.textContent = 'Reservar Cita';
      if (floatingBar) floatingBar.classList.remove('hidden');
    } else {
      if (floatingBar) floatingBar.classList.add('hidden');
      if (headerSub) {
        const subMap = {
          inicio: 'Lookbook · Videos & Fotos',
          dashboard: 'Panel Administrativo',
          agenda: 'Agenda & Mis Citas'
        };
        headerSub.textContent = subMap[viewName] || 'Studio';
      }
    }

    if (viewName === 'inicio') {
      this.renderInicioView();
    } else if (viewName === 'dashboard') {
      KultAdmin.loadAdminPortal();
    } else if (viewName === 'agenda') {
      if (lookupCode) {
        const input = document.getElementById('agenda-lookup-input');
        if (input) input.value = lookupCode;
      }
      KultBooking.lookupClientBookings(lookupCode || undefined);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  async quickBookService(serviceId) {
    await KultBooking.selectService(serviceId);
    this.switchView('reservar');
    KultBooking.switchStep(2, true);
  },

  async quickBookBarber(barberId) {
    await KultBooking.selectBarber(barberId);
    this.switchView('reservar');
    KultBooking.switchStep(3, true);
  },

  async bookFromPortfolio(portfolioId) {
    const item = (KultStore.portfolio || []).find(p => Number(p.id) === Number(portfolioId));
    this.closeLightbox();
    if (!item) {
      this.switchView('reservar');
      return;
    }

    if (item.service_id) {
      KultStore.booking.serviceId = Number(item.service_id);
    }
    if (item.barber_id) {
      KultStore.booking.barberId = Number(item.barber_id);
    }

    KultBooking.renderAll();
    this.switchView('reservar');
    await KultBooking.refreshAvailability({ keepTime: true });
    KultBooking.switchStep(3, true);
    KultUI.toast(`Estilo seleccionado con ${item.barber_name}. Elige tu fecha y hora.`);
  },

  // ============================================================================
  // INICIO MODULE: BARBER WORK SHOWCASE (VIDEOS & PHOTOS — MOBILE FIRST)
  // ============================================================================
  setPortfolioFilter(key, value) {
    KultStore.portfolioFilters[key] = value;
    this.renderInicioView();
  },

  resetPortfolioFilters() {
    KultStore.portfolioFilters = {
      mediaType: 'all',
      barberId: 'all',
      category: 'all'
    };
    this.renderInicioView();
  },

  async likePortfolio(portfolioId, event) {
    if (event) event.stopPropagation();
    const likedKey = `kult_liked_${portfolioId}`;
    try {
      const res = await KultAPI.post(`/api/public/portfolio/${portfolioId}/like`, {});
      const idx = KultStore.portfolio.findIndex(p => Number(p.id) === Number(portfolioId));
      if (idx !== -1 && res.item) {
        KultStore.portfolio[idx] = res.item;
      }
      localStorage.setItem(likedKey, '1');
      this.renderInicioView();
    } catch (err) {
      KultUI.toast(err.message, 'error');
    }
  },

  toggleInlineVideo(videoId, btnEl, event) {
    if (event) event.stopPropagation();
    const video = document.getElementById(videoId);
    if (!video) return;
    if (video.paused) {
      document.querySelectorAll('video.kult-portfolio-video').forEach(v => {
        if (v.id !== videoId) v.pause();
      });
      video.play().catch(() => {});
      if (btnEl) {
        btnEl.innerHTML = `<span class="material-symbols-outlined text-[20px]">pause</span>`;
      }
    } else {
      video.pause();
      if (btnEl) {
        btnEl.innerHTML = `<span class="material-symbols-outlined text-[20px]">play_arrow</span>`;
      }
    }
  },

  toggleVideoMute(videoId, btnEl, event) {
    if (event) event.stopPropagation();
    const video = document.getElementById(videoId);
    if (!video) return;
    video.muted = !video.muted;
    if (btnEl) {
      btnEl.innerHTML = `<span class="material-symbols-outlined text-[18px]">${video.muted ? 'volume_off' : 'volume_up'}</span>`;
    }
  },

  openLightbox(portfolioId, event) {
    if (event) event.stopPropagation();
    const item = (KultStore.portfolio || []).find(p => Number(p.id) === Number(portfolioId));
    if (!item) return;

    document.querySelectorAll('video.kult-portfolio-video').forEach(v => v.pause());

    const modal = document.getElementById('generic-admin-modal');
    const content = document.getElementById('generic-admin-modal-content');
    if (!modal || !content) return;

    const symbol = (KultStore.settings && KultStore.settings.currency_symbol) || '$';

    content.innerHTML = `
      <div class="flex items-center justify-between pb-3 mb-3 border-b border-zinc-200">
        <div class="flex items-center gap-2.5 min-w-0">
          <img src="${KultUI.escapeHtml(item.barber_avatar)}" alt="${KultUI.escapeHtml(item.barber_name)}" class="w-9 h-9 rounded-full object-cover border border-zinc-300 shrink-0" />
          <div class="min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="font-title-md text-sm text-primary font-bold truncate">${KultUI.escapeHtml(item.barber_name)}</span>
              <span class="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-800 border border-zinc-200 font-label-sm text-[9px] uppercase">
                ${KultUI.escapeHtml(item.barber_specialty)}
              </span>
            </div>
            <span class="font-label-sm text-[9px] uppercase text-outline block truncate">${item.media_type === 'video' ? 'Video Reel' : 'Fotografía'} · ${KultUI.escapeHtml(item.technique_tag || '')}</span>
          </div>
        </div>
        <button type="button" class="text-zinc-500 hover:text-zinc-900 p-1 shrink-0" onclick="KultApp.closeLightbox()">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <div class="rounded-lg overflow-hidden bg-zinc-950 border border-zinc-200 mb-3 flex items-center justify-center max-h-[55vh] sm:max-h-[62vh]">
        ${item.media_type === 'video' ? `
          <video src="${KultUI.escapeHtml(item.media_url)}"
                 poster="${KultUI.escapeHtml(item.thumbnail_url || '')}"
                 controls
                 autoplay
                 playsinline
                 class="w-full max-h-[55vh] sm:max-h-[62vh] object-contain bg-black"></video>
        ` : `
          <img src="${KultUI.escapeHtml(item.media_url)}"
               alt="${KultUI.escapeHtml(item.title)}"
               class="w-full max-h-[55vh] sm:max-h-[62vh] object-contain" />
        `}
      </div>

      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="space-y-1 flex-1 min-w-0">
          <div class="flex items-center flex-wrap gap-1.5">
            <span class="px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-primary font-label-sm text-[9px] uppercase">
              ${KultUI.escapeHtml(item.technique_tag || 'S Barber Craft')}
            </span>
            ${item.service_name ? `
              <span class="font-label-sm text-[11px] text-[#059669] font-bold">
                ${KultUI.escapeHtml(item.service_name)} (${KultUI.formatPrice(item.service_price, symbol)})
              </span>
            ` : ''}
          </div>
          <h3 class="font-headline-md text-base sm:text-xl text-primary font-bold uppercase">${KultUI.escapeHtml(item.title)}</h3>
          <p class="font-body-sm text-xs text-on-surface-variant">${KultUI.escapeHtml(item.description)}</p>
        </div>

        <div class="flex items-center gap-2 shrink-0 w-full sm:w-auto">
          <button type="button"
                  onclick="KultApp.likePortfolio(${item.id}, event)"
                  class="btn-kult-secondary py-2.5 px-3.5">
            <span class="material-symbols-outlined text-[17px] text-red-600" style="font-variation-settings: 'FILL' 1;">favorite</span>
            <span>${item.likes_count || 0}</span>
          </button>
          <button type="button"
                  onclick="KultApp.bookFromPortfolio(${item.id})"
                  class="btn-kult-primary py-2.5 px-4 flex-1 sm:flex-initial">
            <span>Reservar este Estilo</span>
            <span class="material-symbols-outlined text-[17px]">event_available</span>
          </button>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  },

  closeLightbox() {
    KultAdmin.closeModal();
  },

  openUploadWorkShortcut() {
    if (!KultStore.user) {
      KultUI.toast('Inicia sesión como Barbero o Administrador para subir fotos y videos.');
      this.switchView('dashboard');
      return;
    }
    KultStore.admin.activeTab = 'portafolio';
    this.switchView('dashboard');
  },

  renderInicioView() {
    const container = document.getElementById('inicio-content-container');
    if (!container) return;

    const allItems = KultStore.portfolio || [];
    const filters = KultStore.portfolioFilters;

    const totalVideos = allItems.filter(i => i.media_type === 'video').length;
    const totalImages = allItems.filter(i => i.media_type === 'image').length;

    const filteredItems = allItems.filter(item => {
      if (filters.mediaType !== 'all' && item.media_type !== filters.mediaType) return false;
      if (filters.barberId !== 'all' && Number(item.barber_id) !== Number(filters.barberId)) return false;
      if (filters.category !== 'all' && item.category_slug !== filters.category) return false;
      return true;
    });

    const featuredVideo = allItems.find(i => i.media_type === 'video' && i.featured) || allItems.find(i => i.media_type === 'video') || allItems[0];
    const selectedBarberObj = filters.barberId !== 'all'
      ? (KultStore.barbers || []).find(b => Number(b.id) === Number(filters.barberId))
      : null;

    container.innerHTML = `
      <!-- ================================================================== -->
      <!-- 1. HERO SHOWCASE: FEATURED BARBER REEL & LOOKBOOK INTRO            -->
      <!-- ================================================================== -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 pb-6 mb-6 border-b border-zinc-200">
        <!-- Left Column: Editorial Statement & Barber Stories Strip -->
        <div class="lg:col-span-6 flex flex-col justify-between space-y-4 min-w-0">
          <div class="space-y-3">
            <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-zinc-100 border border-zinc-200 max-w-full">
              <span class="status-pip-avail shrink-0"></span>
              <span class="font-label-sm text-[9px] sm:text-[10px] uppercase tracking-wider text-primary truncate">
                S BARBER STUDIO · ${totalVideos} Videos &amp; ${totalImages} Fotos Reales
              </span>
            </div>

            <h1 class="font-headline-xl text-2xl sm:text-4xl lg:text-5xl font-extrabold uppercase tracking-tight text-primary leading-[1.08] break-words">
              TRABAJO DE AUTOR EN VIDEOS Y FOTOS.
            </h1>

            <p class="font-body-sm sm:font-body-md text-xs sm:text-sm text-on-surface-variant">
              Explora las sesiones en video, degradados milimétricos, corte a tijera y rituales de navaja de nuestros barberos. Elige tu estilo y agenda directamente con el autor.
            </p>

            <div class="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 pt-1">
              <button type="button" class="btn-kult-primary py-2.5 px-3 sm:px-5 text-[11px] sm:text-xs" onclick="KultApp.switchView('reservar')">
                <span>Agendar Cita</span>
                <span class="material-symbols-outlined text-[16px]">calendar_add_on</span>
              </button>
              <button type="button" class="btn-kult-secondary py-2.5 px-3 sm:px-4 text-[11px] sm:text-xs" onclick="KultApp.openUploadWorkShortcut()">
                <span class="material-symbols-outlined text-[16px]">upload_file</span>
                <span>Subir Trabajo</span>
              </button>
            </div>
          </div>

          <!-- Barber Filter Avatars -->
          <div class="surface-level-1 rounded-xl p-3 sm:p-4 border border-zinc-200 min-w-0">
            <div class="flex items-center justify-between mb-2">
              <span class="kult-label m-0">Filtrar por Barbero Especialista</span>
              ${filters.barberId !== 'all' ? `
                <button type="button" onclick="KultApp.setPortfolioFilter('barberId', 'all')" class="font-label-sm text-[10px] uppercase text-primary underline">
                  Ver Todos
                </button>
              ` : ''}
            </div>
            <div class="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              <!-- All Barbers Pill -->
              <button type="button"
                      onclick="KultApp.setPortfolioFilter('barberId', 'all')"
                      class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg shrink-0 transition-all border ${
                        filters.barberId === 'all'
                          ? 'bg-primary text-on-primary border-primary font-bold shadow-sm'
                          : 'bg-zinc-50 text-on-surface border-zinc-200 hover:border-zinc-400'
                      }">
                <div class="w-8 h-8 rounded-full ${filters.barberId === 'all' ? 'bg-white text-primary' : 'bg-zinc-200 text-primary'} flex items-center justify-center shrink-0">
                  <span class="material-symbols-outlined text-[16px]">grid_view</span>
                </div>
                <div class="text-left">
                  <span class="font-title-md text-xs font-bold block leading-tight">Todos</span>
                  <span class="font-label-sm text-[9px] ${filters.barberId === 'all' ? 'text-white/80' : 'text-outline'} uppercase">${allItems.length} items</span>
                </div>
              </button>

              ${(KultStore.barbers || []).map(b => {
                const isSelected = String(filters.barberId) === String(b.id);
                const count = allItems.filter(i => Number(i.barber_id) === Number(b.id)).length;
                return `
                  <button type="button"
                          onclick="KultApp.setPortfolioFilter('barberId', ${b.id})"
                          class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg shrink-0 transition-all border ${
                            isSelected
                              ? 'bg-primary text-on-primary border-primary font-bold shadow-sm'
                              : 'bg-zinc-50 text-on-surface border-zinc-200 hover:border-zinc-400'
                          }">
                    <img src="${KultUI.escapeHtml(b.avatar_url)}" alt="${KultUI.escapeHtml(b.name)}" class="w-8 h-8 rounded-full object-cover border ${isSelected ? 'border-white' : 'border-zinc-300'} shrink-0" />
                    <div class="text-left">
                      <span class="font-title-md text-xs font-bold block leading-tight">${KultUI.escapeHtml(b.name)}</span>
                      <span class="font-label-sm text-[9px] ${isSelected ? 'text-white/80' : 'text-outline'} uppercase">${KultUI.escapeHtml(b.specialty)} · ${count}</span>
                    </div>
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- Right Column: Featured Video Reel Showcase (Clean non-overlapping footer on mobile) -->
        <div class="lg:col-span-6 min-w-0">
          ${featuredVideo ? `
            <div class="surface-level-1 rounded-xl overflow-hidden border border-zinc-200 flex flex-col justify-between shadow-sm">
              <div class="relative w-full h-56 sm:h-72 bg-zinc-950 overflow-hidden">
                ${featuredVideo.media_type === 'video' ? `
                  <video id="hero-featured-video"
                         class="kult-portfolio-video w-full h-full object-cover"
                         src="${KultUI.escapeHtml(featuredVideo.media_url)}"
                         poster="${KultUI.escapeHtml(featuredVideo.thumbnail_url || '')}"
                         autoplay
                         muted
                         loop
                         playsinline></video>
                ` : `
                  <img src="${KultUI.escapeHtml(featuredVideo.media_url)}"
                       alt="${KultUI.escapeHtml(featuredVideo.title)}"
                       class="w-full h-full object-cover" />
                `}
                <div class="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/30 pointer-events-none"></div>

                <!-- Top Controls on Featured Reel -->
                <div class="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2">
                  <span class="px-2 py-1 rounded bg-white text-zinc-900 font-label-sm text-[9px] sm:text-[10px] uppercase tracking-wider font-bold flex items-center gap-1 shadow">
                    <span class="material-symbols-outlined text-[13px]">videocam</span> Reel Destacado
                  </span>

                  ${featuredVideo.media_type === 'video' ? `
                    <div class="flex items-center gap-1.5">
                      <button type="button"
                              title="Activar/Silenciar Audio"
                              onclick="KultApp.toggleVideoMute('hero-featured-video', this, event)"
                              class="w-8 h-8 rounded-full bg-white/90 hover:bg-white text-zinc-900 flex items-center justify-center shadow transition-all">
                        <span class="material-symbols-outlined text-[16px]">volume_off</span>
                      </button>
                      <button type="button"
                              title="Pausar/Reproducir"
                              onclick="KultApp.toggleInlineVideo('hero-featured-video', this, event)"
                              class="w-8 h-8 rounded-full bg-white/90 hover:bg-white text-zinc-900 flex items-center justify-center shadow transition-all">
                        <span class="material-symbols-outlined text-[18px]">pause</span>
                      </button>
                      <button type="button"
                              title="Pantalla Completa"
                              onclick="KultApp.openLightbox(${featuredVideo.id}, event)"
                              class="w-8 h-8 rounded-full bg-white/90 hover:bg-white text-zinc-900 flex items-center justify-center shadow transition-all">
                        <span class="material-symbols-outlined text-[16px]">open_in_full</span>
                      </button>
                    </div>
                  ` : ''}
                </div>

                <!-- Author pill bottom-left of video -->
                <div class="absolute bottom-2.5 left-3 right-3 flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <img src="${KultUI.escapeHtml(featuredVideo.barber_avatar)}" alt="${KultUI.escapeHtml(featuredVideo.barber_name)}" class="w-6 h-6 rounded-full object-cover border border-white" />
                    <span class="font-label-sm text-[11px] text-white font-bold uppercase">${KultUI.escapeHtml(featuredVideo.barber_name)}</span>
                  </div>
                  <span class="px-2 py-0.5 rounded bg-black/70 text-white border border-white/20 font-label-sm text-[9px] uppercase">
                    ${KultUI.escapeHtml(featuredVideo.technique_tag || 'Master Session')}
                  </span>
                </div>
              </div>

              <!-- Clean White Footer below video so text never collides on mobile -->
              <div class="p-3.5 sm:p-4 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="min-w-0">
                  <h2 class="font-title-md text-sm sm:text-base text-primary font-bold uppercase leading-snug truncate">${KultUI.escapeHtml(featuredVideo.title)}</h2>
                  <p class="font-body-sm text-xs text-on-surface-variant line-clamp-1 mt-0.5">${KultUI.escapeHtml(featuredVideo.description)}</p>
                </div>
                <button type="button"
                        onclick="KultApp.bookFromPortfolio(${featuredVideo.id})"
                        class="btn-kult-primary py-2 px-3.5 text-xs shrink-0 w-full sm:w-auto">
                  <span>Reservar este Look</span>
                  <span class="material-symbols-outlined text-[15px]">arrow_forward</span>
                </button>
              </div>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- ================================================================== -->
      <!-- 2. ACTIVE BARBER SPOTLIGHT BANNER (WHEN FILTERED BY A BARBER)      -->
      <!-- ================================================================== -->
      ${selectedBarberObj ? `
        <div class="surface-level-2 rounded-xl p-4 mb-5 border border-zinc-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <img src="${KultUI.escapeHtml(selectedBarberObj.avatar_url)}" alt="${KultUI.escapeHtml(selectedBarberObj.name)}" class="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover border-2 border-zinc-900 shrink-0" />
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="font-headline-md text-base sm:text-lg text-primary font-bold uppercase">${KultUI.escapeHtml(selectedBarberObj.name)}</h3>
                <span class="px-2 py-0.5 rounded-full bg-zinc-900 text-white font-label-sm text-[9px] uppercase font-bold">
                  ★ ${Number(selectedBarberObj.rating).toFixed(1)}
                </span>
              </div>
              <span class="font-label-sm text-[10px] uppercase text-[#059669] font-bold block">${KultUI.escapeHtml(selectedBarberObj.specialty)}</span>
              <p class="font-body-sm text-xs text-on-surface-variant mt-0.5 line-clamp-2">${KultUI.escapeHtml(selectedBarberObj.bio)}</p>
            </div>
          </div>
          <button type="button" class="btn-kult-primary text-xs shrink-0 w-full sm:w-auto" onclick="KultApp.quickBookBarber(${selectedBarberObj.id})">
            <span>Reservar con ${KultUI.escapeHtml(selectedBarberObj.name.split(' ')[0])}</span>
            <span class="material-symbols-outlined text-[16px]">event_available</span>
          </button>
        </div>
      ` : ''}

      <!-- ================================================================== -->
      <!-- 3. FILTER CONTROLS: VIDEOS / PHOTOS & SPECIALTY CATEGORIES         -->
      <!-- ================================================================== -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-2.5 mb-5 min-w-0">
        <!-- Media Type Filter Tabs -->
        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar min-w-0">
          <button type="button"
                  onclick="KultApp.setPortfolioFilter('mediaType', 'all')"
                  class="px-3 py-1.5 rounded-lg font-label-md text-[11px] uppercase tracking-wider flex items-center gap-1.5 shrink-0 transition-all ${
                    filters.mediaType === 'all'
                      ? 'bg-primary text-on-primary font-bold shadow-sm'
                      : 'surface-level-1 text-on-surface-variant hover:text-primary'
                  }">
            <span class="material-symbols-outlined text-[15px]">perm_media</span>
            <span>Todo (${allItems.length})</span>
          </button>
          <button type="button"
                  onclick="KultApp.setPortfolioFilter('mediaType', 'video')"
                  class="px-3 py-1.5 rounded-lg font-label-md text-[11px] uppercase tracking-wider flex items-center gap-1.5 shrink-0 transition-all ${
                    filters.mediaType === 'video'
                      ? 'bg-primary text-on-primary font-bold shadow-sm'
                      : 'surface-level-1 text-on-surface-variant hover:text-primary'
                  }">
            <span class="material-symbols-outlined text-[15px]">movie</span>
            <span>Videos (${totalVideos})</span>
          </button>
          <button type="button"
                  onclick="KultApp.setPortfolioFilter('mediaType', 'image')"
                  class="px-3 py-1.5 rounded-lg font-label-md text-[11px] uppercase tracking-wider flex items-center gap-1.5 shrink-0 transition-all ${
                    filters.mediaType === 'image'
                      ? 'bg-primary text-on-primary font-bold shadow-sm'
                      : 'surface-level-1 text-on-surface-variant hover:text-primary'
                  }">
            <span class="material-symbols-outlined text-[15px]">photo_camera</span>
            <span>Fotos (${totalImages})</span>
          </button>
        </div>

        <!-- Category Filter Pills -->
        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar min-w-0">
          ${[
            { slug: 'all', name: 'Todas' },
            { slug: 'cortes', name: 'Cortes & Fades' },
            { slug: 'barba', name: 'Barba & Navaja' },
            { slug: 'combos', name: 'Combos VIP' },
            { slug: 'tratamientos', name: 'Tratamientos' }
          ].map(cat => {
            const isActive = filters.category === cat.slug;
            return `
              <button type="button"
                      onclick="KultApp.setPortfolioFilter('category', '${cat.slug}')"
                      class="px-3 py-1 rounded-full font-label-sm text-[10px] uppercase tracking-wider shrink-0 transition-all ${
                        isActive
                          ? 'bg-zinc-900 text-white font-bold shadow-sm'
                          : 'bg-zinc-100 text-on-surface-variant hover:text-zinc-900 border border-zinc-200'
                      }">
                ${KultUI.escapeHtml(cat.name)}
              </button>
            `;
          }).join('')}
        </div>
      </div>

      <!-- ================================================================== -->
      <!-- 4. PORTFOLIO GALLERY GRID (VIDEOS & PHOTOS)                        -->
      <!-- ================================================================== -->
      ${filteredItems.length === 0 ? `
        <div class="surface-level-1 rounded-xl p-8 text-center space-y-3 mb-8">
          <span class="material-symbols-outlined text-[32px] text-outline">video_library</span>
          <h3 class="font-headline-md text-base text-primary font-bold uppercase">No hay fotos o videos con este filtro</h3>
          <p class="font-body-sm text-xs text-on-surface-variant">Prueba seleccionando otro barbero o categoría.</p>
          <button type="button" class="btn-kult-secondary text-xs" onclick="KultApp.resetPortfolioFilters()">
            Mostrar Todo
          </button>
        </div>
      ` : `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          ${filteredItems.map(item => {
            const isVideo = item.media_type === 'video';
            const videoDomId = `portfolio-vid-${item.id}`;
            const isLiked = localStorage.getItem(`kult_liked_${item.id}`) === '1';

            return `
              <article class="bg-white rounded-xl overflow-hidden border border-zinc-200 hover:border-zinc-400 shadow-sm flex flex-col justify-between transition-all group min-w-0">
                <!-- Media Frame -->
                <div class="relative w-full h-60 sm:h-64 bg-zinc-900 overflow-hidden cursor-pointer"
                     onclick="KultApp.openLightbox(${item.id}, event)">
                  ${isVideo ? `
                    <video id="${videoDomId}"
                           class="kult-portfolio-video w-full h-full object-cover"
                           src="${KultUI.escapeHtml(item.media_url)}"
                           poster="${KultUI.escapeHtml(item.thumbnail_url || '')}"
                           muted
                           loop
                           playsinline></video>
                  ` : `
                    <img src="${KultUI.escapeHtml(item.media_url)}"
                         alt="${KultUI.escapeHtml(item.title)}"
                         loading="lazy"
                         class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  `}

                  <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent pointer-events-none"></div>

                  <!-- Top Left Media Type Badge -->
                  <div class="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                    <span class="px-2 py-0.5 rounded ${
                      isVideo ? 'bg-white text-zinc-900 font-bold shadow' : 'bg-black/75 text-white border border-white/20'
                    } font-label-sm text-[9px] uppercase tracking-wider flex items-center gap-1">
                      <span class="material-symbols-outlined text-[12px]">${isVideo ? 'videocam' : 'photo_camera'}</span>
                      ${isVideo ? 'Video' : 'Foto'}
                    </span>
                    ${item.duration_label ? `
                      <span class="px-1.5 py-0.5 rounded bg-white/90 text-zinc-900 font-mono font-bold text-[9px] shadow">
                        ${KultUI.escapeHtml(item.duration_label)}
                      </span>
                    ` : ''}
                  </div>

                  <!-- Top Right Play / Expand Controls -->
                  <div class="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                    ${isVideo ? `
                      <button type="button"
                              title="Reproducir / Pausar Video"
                              onclick="KultApp.toggleInlineVideo('${videoDomId}', this, event)"
                              class="w-8 h-8 rounded-full bg-white text-zinc-900 hover:scale-105 flex items-center justify-center shadow-lg transition-all">
                        <span class="material-symbols-outlined text-[20px]">play_arrow</span>
                      </button>
                    ` : ''}
                    <button type="button"
                            title="Ampliar"
                            onclick="KultApp.openLightbox(${item.id}, event)"
                            class="w-8 h-8 rounded-full bg-white/90 hover:bg-white text-zinc-900 flex items-center justify-center shadow transition-all">
                      <span class="material-symbols-outlined text-[16px]">open_in_full</span>
                    </button>
                  </div>

                  <!-- Bottom Barber Author & Technique Tag inside Frame -->
                  <div class="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2 min-w-0">
                      <img src="${KultUI.escapeHtml(item.barber_avatar)}"
                           alt="${KultUI.escapeHtml(item.barber_name)}"
                           class="w-6 h-6 rounded-full object-cover border border-white shrink-0" />
                      <div class="min-w-0">
                        <span class="font-title-md text-xs text-white font-bold block truncate">${KultUI.escapeHtml(item.barber_name)}</span>
                        <span class="font-label-sm text-[9px] text-[#34D399] uppercase block truncate">${KultUI.escapeHtml(item.barber_specialty)}</span>
                      </div>
                    </div>
                    <span class="px-2 py-0.5 rounded bg-white/90 text-zinc-900 font-label-sm text-[9px] uppercase font-bold shrink-0 max-w-[130px] truncate">
                      ${KultUI.escapeHtml(item.technique_tag || item.category_slug)}
                    </span>
                  </div>
                </div>

                <!-- Card Details & Direct Booking Footer -->
                <div class="p-3.5 flex-1 flex flex-col justify-between gap-3 bg-white">
                  <div>
                    <h3 class="font-title-md text-sm sm:text-base text-primary font-bold leading-snug mb-1">${KultUI.escapeHtml(item.title)}</h3>
                    <p class="font-body-sm text-xs text-on-surface-variant line-clamp-2">${KultUI.escapeHtml(item.description)}</p>
                  </div>

                  <div class="pt-2.5 border-t border-zinc-200 flex items-center justify-between gap-2">
                    <button type="button"
                            onclick="KultApp.likePortfolio(${item.id}, event)"
                            class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 text-xs transition-all ${
                              isLiked ? 'text-zinc-900 font-bold border-zinc-400' : 'text-zinc-600'
                            }">
                      <span class="material-symbols-outlined text-[14px] text-red-600" style="font-variation-settings: 'FILL' 1;">favorite</span>
                      <span>${item.likes_count || 0}</span>
                    </button>

                    <button type="button"
                            onclick="KultApp.bookFromPortfolio(${item.id})"
                            class="btn-kult-primary py-1.5 px-3 text-[11px]">
                      <span>Reservar Look</span>
                      <span class="material-symbols-outlined text-[14px]">arrow_forward</span>
                    </button>
                  </div>
                </div>
              </article>
            `;
          }).join('')}
        </div>
      `}
    `;
  }
};

window.KultApp = KultApp;
document.addEventListener('DOMContentLoaded', () => {
  KultApp.init();
});

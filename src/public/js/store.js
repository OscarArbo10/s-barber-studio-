/**
 * KULT Barber Studio — Application State Store
 */

const KultStore = {
  settings: null,
  categories: [],
  services: [],
  barbers: [],
  studioHours: [],
  portfolio: [],
  portfolioFilters: {
    mediaType: 'all', // 'all' | 'video' | 'image'
    barberId: 'all',  // 'all' or numeric barberId
    category: 'all'   // 'all' | 'cortes' | 'barba' | 'combos' | 'tratamientos'
  },
  user: null,
  currentView: 'reservar', // 'inicio' | 'reservar' | 'dashboard' | 'agenda'

  // 4-Step Booking Flow State
  booking: {
    step: 1,
    activeCategory: 'all',
    serviceId: null,
    barberId: 'any', // 'any' or numeric barber ID
    date: null,
    calendarStartDate: null,
    time: null,
    availability: null,
    loadingAvailability: false,
    submitting: false,
    confirmedBooking: null,
    client: {
      name: '',
      phone: '',
      email: '',
      notes: ''
    }
  },

  // Admin Panel State
  admin: {
    activeTab: 'dashboard', // 'dashboard' | 'reservas' | 'servicios' | 'barberos' | 'horarios' | 'clientes' | 'config'
    overview: null,
    bookings: [],
    clients: [],
    filters: {
      search: '',
      date: '',
      barberId: '',
      serviceId: '',
      status: ''
    }
  },

  getSelectedService() {
    return this.services.find(s => Number(s.id) === Number(this.booking.serviceId)) || this.services[0] || null;
  },

  getSelectedBarber() {
    if (!this.booking.barberId || this.booking.barberId === 'any') {
      return {
        id: 'any',
        name: 'Cualquiera disponible',
        shortName: 'Cualquiera',
        specialty: 'Primer turno libre'
      };
    }
    const b = this.barbers.find(x => Number(x.id) === Number(this.booking.barberId));
    if (!b) {
      return {
        id: 'any',
        name: 'Cualquiera disponible',
        shortName: 'Cualquiera',
        specialty: 'Primer turno libre'
      };
    }
    const parts = b.name.split(' ');
    const shortName = parts[0] + (parts[1] ? ` ${parts[1][0]}.` : '');
    return {
      ...b,
      shortName
    };
  }
};

window.KultStore = KultStore;

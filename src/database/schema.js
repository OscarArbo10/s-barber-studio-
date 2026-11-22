const { db } = require('./connection');

function initSchema() {
  if (db.isSupabase) {
    return;
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS business_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      commercial_name TEXT NOT NULL DEFAULT 'S BARBER STUDIO',
      tagline TEXT NOT NULL DEFAULT 'Arquitectura de Barbería & Precisión Editorial',
      logo_url TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT 'Av. Presidente Masaryk 412, Polanco, CDMX',
      phone TEXT NOT NULL DEFAULT '+52 55 8421 9000',
      email TEXT NOT NULL DEFAULT 'concierge@sbarberstudio.com',
      instagram TEXT NOT NULL DEFAULT '@sbarberstudio',
      whatsapp TEXT NOT NULL DEFAULT '+525584219000',
      tiktok TEXT NOT NULL DEFAULT '@sbarberstudio',
      currency TEXT NOT NULL DEFAULT 'USD',
      currency_symbol TEXT NOT NULL DEFAULT '$',
      timezone TEXT NOT NULL DEFAULT 'America/Mexico_City',
      slot_interval_minutes INTEGER NOT NULL DEFAULT 15,
      booking_policy TEXT NOT NULL DEFAULT 'Tolerancia máxima de 10 minutos para preservar el Protocolo S Barber Zero-Delay.',
      cancellation_policy TEXT NOT NULL DEFAULT 'Cancelaciones o reprogramaciones sin cargo hasta 3 horas antes de la sesión.',
      hygiene_title TEXT NOT NULL DEFAULT 'Protocolo S Barber Zero-Delay',
      hygiene_description TEXT NOT NULL DEFAULT 'Navajas esterilizadas en autoclave hospitalario y puntualidad exacta sin esperas en sala.',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      price REAL NOT NULL CHECK (price >= 0),
      duration_minutes INTEGER NOT NULL CHECK (duration_minutes >= 10),
      badge TEXT DEFAULT '',
      feature_icon TEXT DEFAULT 'brush',
      feature_label TEXT DEFAULT 'Acabado premium',
      image_url TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS barbers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      specialty TEXT NOT NULL,
      bio TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      rating REAL NOT NULL DEFAULT 5.0,
      reviews_count INTEGER NOT NULL DEFAULT 1,
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS barber_services (
      barber_id INTEGER NOT NULL,
      service_id INTEGER NOT NULL,
      PRIMARY KEY (barber_id, service_id),
      FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'barber', 'client')),
      barber_id INTEGER DEFAULT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS working_hours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barber_id INTEGER DEFAULT NULL,
      day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
      is_working INTEGER NOT NULL DEFAULT 1,
      start_time TEXT NOT NULL DEFAULT '10:00',
      end_time TEXT NOT NULL DEFAULT '20:00',
      break_start TEXT DEFAULT '14:00',
      break_end TEXT DEFAULT '15:00',
      UNIQUE(barber_id, day_of_week),
      FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS availability_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barber_id INTEGER DEFAULT NULL,
      type TEXT NOT NULL CHECK (type IN ('holiday', 'vacation', 'break', 'special')),
      title TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      start_time TEXT DEFAULT NULL,
      end_time TEXT DEFAULT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
    CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_code TEXT NOT NULL UNIQUE,
      client_id INTEGER NOT NULL,
      service_id INTEGER NOT NULL,
      barber_id INTEGER NOT NULL,
      requested_any_barber INTEGER NOT NULL DEFAULT 0,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      price REAL NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')) DEFAULT 'confirmed',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT,
      FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_date_barber ON bookings(date, barber_id, status);
    CREATE INDEX IF NOT EXISTS idx_bookings_client ON bookings(client_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_code ON bookings(booking_code);

    CREATE TABLE IF NOT EXISTS booking_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      previous_status TEXT DEFAULT '',
      new_status TEXT DEFAULT '',
      details TEXT DEFAULT '',
      performed_by TEXT NOT NULL DEFAULT 'Sistema',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS portfolio_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')) DEFAULT 'image',
      media_url TEXT NOT NULL,
      thumbnail_url TEXT DEFAULT '',
      category_slug TEXT NOT NULL DEFAULT 'cortes',
      barber_id INTEGER NOT NULL,
      service_id INTEGER DEFAULT NULL,
      technique_tag TEXT DEFAULT 'Precision Craft',
      duration_label TEXT DEFAULT '',
      featured INTEGER NOT NULL DEFAULT 0,
      likes_count INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_portfolio_barber ON portfolio_items(barber_id, active);
    CREATE INDEX IF NOT EXISTS idx_portfolio_type ON portfolio_items(media_type, active);
  `);
}

module.exports = { initSchema };

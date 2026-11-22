const { db, withTransaction } = require('./connection');
const { hashPassword } = require('../utils/security');
const { getNowInTimezone, addDays, getDayOfWeek } = require('../utils/dateUtils');

function seedPortfolioIfEmpty() {
  const countRow = db.prepare('SELECT COUNT(*) as cnt FROM portfolio_items').get();
  if (countRow && countRow.cnt > 0) return;

  const barbers = db.prepare('SELECT id, name FROM barbers ORDER BY id ASC').all();
  const services = db.prepare('SELECT id, name FROM services ORDER BY id ASC').all();
  if (barbers.length === 0) return;

  const mateoId = (barbers.find(b => b.name.includes('Mateo')) || barbers[0]).id;
  const alexId = (barbers.find(b => b.name.includes('Alex')) || barbers[0]).id;
  const lucasId = (barbers.find(b => b.name.includes('Lucas')) || barbers[0]).id;

  const srvFade = (services.find(s => s.name.includes('Fade')) || services[0])?.id || null;
  const srvCombo = (services.find(s => s.name.includes('Signature')) || services[0])?.id || null;
  const srvBarba = (services.find(s => s.name.includes('Esculpido')) || services[0])?.id || null;
  const srvMask = (services.find(s => s.name.includes('Mask')) || services[0])?.id || null;
  const srvScissor = (services.find(s => s.name.includes('Scissor')) || services[0])?.id || null;

  const insertPortfolio = db.prepare(`
    INSERT INTO portfolio_items (
      title, description, media_type, media_url, thumbnail_url,
      category_slug, barber_id, service_id, technique_tag, duration_label,
      featured, likes_count, active, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);

  withTransaction(() => {
    // 1. Featured Video Reel — Mateo Silva (Skin Fade Session)
    insertPortfolio.run(
      'Sesión en Vivo: Razor Skin Fade & Texturizado',
      'Proceso completo de degradado alto desde acero 0.0mm, transición limpia con máquina sobre peine y sellado con navaja libre.',
      'video',
      'https://assets.mixkit.co/videos/preview/mixkit-barber-cutting-the-hair-of-a-client-43232-large.mp4',
      'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=1000&q=85',
      'cortes',
      mateoId,
      srvFade,
      '0.0mm Foil + Clipper Over Comb',
      '0:45 Reel',
      1,
      184,
      1
    );

    // 2. Video Reel — Alex Vance (Beard Sculpting & Razor Work)
    insertPortfolio.run(
      'Ritual de Navaja Libre & Perfilado Geométrico',
      'Vaporización con ozono, toalla caliente aromática y delineado quirúrgico de mejillas y cuello con navaja de acero japonés.',
      'video',
      'https://assets.mixkit.co/videos/preview/mixkit-man-getting-his-beard-trimmed-in-a-barbershop-43225-large.mp4',
      'https://images.unsplash.com/photo-1621607512214-68297480165e?auto=format&fit=crop&w=1000&q=85',
      'barba',
      alexId,
      srvBarba,
      'Hot Towel + Straight Razor',
      '0:38 Reel',
      1,
      149,
      2
    );

    // 3. Photo — Mateo Silva (High Contrast Mid Drop Fade)
    insertPortfolio.run(
      'Mid Drop Fade + French Crop Texturizado',
      'Caída curva detrás del hueso occipital para preservar volumen parietal y flequillo corto texturizado con arcilla volcánica mate.',
      'image',
      'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=1000&q=85',
      '',
      'cortes',
      mateoId,
      srvFade,
      'Drop Fade + Matte Clay',
      '45 min',
      1,
      216,
      3
    );

    // 4. Video Reel — Lucas Rossi (Scissor Architecture)
    insertPortfolio.run(
      'Arquitectura Capilar 100% a Tijera en Movimiento',
      'Seccionamiento geométrico en 6 paneles, corte en ángulo de 45° y desfilado de puntas para flujo natural sin uso de máquina.',
      'video',
      'https://assets.mixkit.co/videos/preview/mixkit-hairdresser-cutting-mans-hair-with-scissors-40533-large.mp4',
      'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=1000&q=85',
      'cortes',
      lucasId,
      srvScissor,
      'Point Cutting + Slide Shears',
      '0:52 Reel',
      0,
      167,
      4
    );

    // 5. Photo — Alex Vance (Kult Signature Combo)
    insertPortfolio.run(
      'Kult Signature: Taper Fade & Barba Imperial',
      'Integración perfecta entre patilla degradada y barba densa estructurada a mano alzada con acabado en bálsamo de cedro.',
      'image',
      'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=1000&q=85',
      '',
      'combos',
      alexId,
      srvCombo,
      'Taper Blend + Beard Structure',
      '75 min',
      0,
      193,
      5
    );

    // 6. Photo — Lucas Rossi (Editorial Slick Back)
    insertPortfolio.run(
      'Obsidian Slick Back & Contornos a Navaja',
      'Estilo clásico reinterpretado con laterales desconectados suaves y pulido direccional hacia atrás.',
      'image',
      'https://images.unsplash.com/photo-1517832607067-4db24a2ae47c?auto=format&fit=crop&w=1000&q=85',
      '',
      'cortes',
      lucasId,
      srvScissor,
      'Shear Over Comb + Pomade',
      '50 min',
      0,
      138,
      6
    );

    // 7. Photo — Mateo Silva (Burst Fade Mullet Moderno)
    insertPortfolio.run(
      'Burst Fade & Textura Radial Contemporánea',
      'Degradado semicircular alrededor de la oreja con nuca texturizada a navaja y definición de líneas frontales.',
      'image',
      'https://images.unsplash.com/photo-1534297635766-a262cdcb8ee4?auto=format&fit=crop&w=1000&q=85',
      '',
      'cortes',
      mateoId,
      srvFade,
      'Radial Burst + Line-Up',
      '45 min',
      0,
      175,
      7
    );

    // 8. Photo — Alex Vance (Black Mask Detox & Spa Facial)
    insertPortfolio.run(
      'Detox de Carbón Activado & Vaporización Facial',
      'Purificación profunda de poros post-afeitado, extracción de impurezas y sellado con tónico frío.',
      'image',
      'https://images.unsplash.com/photo-1512690459411-b9245aed614b?auto=format&fit=crop&w=1000&q=85',
      '',
      'tratamientos',
      alexId,
      srvMask,
      'Activated Charcoal + Ozone',
      '25 min',
      0,
      112,
      8
    );
  });
}

function migrateBrandingToSBarber() {
  db.prepare(`
    UPDATE business_settings
    SET
      commercial_name = 'S BARBER STUDIO',
      hygiene_title = 'Protocolo S Barber Zero-Delay',
      booking_policy = replace(booking_policy, 'Kult', 'S Barber'),
      instagram = '@sbarberstudio',
      tiktok = '@sbarberstudio'
    WHERE id = 1 AND commercial_name LIKE '%KULT%'
  `).run();

  db.prepare(`
    UPDATE services
    SET name = 'S Barber Signature Combo'
    WHERE name = 'Kult Signature Combo'
  `).run();

  db.prepare(`
    UPDATE portfolio_items
    SET title = replace(title, 'Kult Signature', 'S Barber Signature')
    WHERE title LIKE '%Kult Signature%'
  `).run();

  db.prepare(`
    UPDATE users
    SET name = 'Director S Barber Admin'
    WHERE name = 'Director KULT Admin'
  `).run();
}

function seedDatabase() {
  const existingSettings = db.prepare('SELECT id FROM business_settings WHERE id = 1').get();
  if (existingSettings) {
    migrateBrandingToSBarber();
    seedPortfolioIfEmpty();
    return;
  }

  withTransaction(() => {
    // 1. Business Settings
    db.prepare(`
      INSERT INTO business_settings (
        id, commercial_name, tagline, logo_url, address, phone, email,
        instagram, whatsapp, tiktok, currency, currency_symbol, timezone,
        slot_interval_minutes, booking_policy, cancellation_policy,
        hygiene_title, hygiene_description
      ) VALUES (
        1,
        'S BARBER STUDIO',
        'Arquitectura de Barbería & Precisión Editorial',
        'https://lh3.googleusercontent.com/aida/ALJJyrD4g7IVZcDcVfjPQOFM3NruEPse-OGd4P9cyEMss5YHeWXyXrPS9dyAUIdayku8gNibhuRuLwcNvOzyjElo0xBcQMMoEw5PDBCVBs4xiFQAG-M3yCST33dHPUK6Dm1q9q1jm9LbplWwEdYgD19EY9nSdkb6u5YRKkh2uzMZTYTo_fYzu464-HWpcSFCVRSo6Y-vWmrmoVLZ5GYxlDcGTCvSwmYnkJ2cw5MY3WwQg0m4',
        'Av. Presidente Masaryk 412, Polanco, CDMX',
        '+52 55 8421 9000',
        'concierge@sbarberstudio.com',
        '@sbarberstudio',
        '+525584219000',
        '@sbarberstudio',
        'USD',
        '$',
        'America/Mexico_City',
        15,
        'Llegar 5 minutos antes de su cita. Tolerancia máxima de 10 minutos para garantizar el Protocolo S Barber Zero-Delay.',
        'Cancelaciones y cambios de horario permitidos hasta 3 horas antes del turno reservado.',
        'Protocolo S Barber Zero-Delay',
        'Navajas esterilizadas y puntualidad exacta sin esperas en sala.'
      )
    `).run();

    // 2. Categories
    const insertCat = db.prepare('INSERT INTO categories (slug, name, sort_order, active) VALUES (?, ?, ?, 1)');
    const catCortes = insertCat.run('cortes', 'Cortes', 1).lastInsertRowid;
    const catBarba = insertCat.run('barba', 'Barba', 2).lastInsertRowid;
    const catCombos = insertCat.run('combos', 'Combos', 3).lastInsertRowid;
    const catTratamientos = insertCat.run('tratamientos', 'Tratamientos', 4).lastInsertRowid;

    // 3. Reference Services + Additional Studio Services
    const insertService = db.prepare(`
      INSERT INTO services (
        category_id, name, description, price, duration_minutes,
        badge, feature_icon, feature_label, image_url, active, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);

    const srvSkinFade = insertService.run(
      catCortes,
      'Skin Fade Pro',
      'Degradado milimétrico a navaja, perfilado de patillas y acabado con pomada mate premium.',
      35,
      45,
      'Top Choice',
      'brush',
      'Acabado mate',
      '',
      1
    ).lastInsertRowid;

    const srvSignatureCombo = insertService.run(
      catCombos,
      'Kult Signature Combo',
      'Corte personalizado completo, ritual de barba con toalla caliente y vapor ozono + masaje capilar.',
      55,
      75,
      'VIP Ritual',
      'spa',
      'Ritual completo',
      '',
      2
    ).lastInsertRowid;

    const srvEsculpido = insertService.run(
      catBarba,
      'Esculpido & Navaja',
      'Delineado geométrico milimétrico, tratamiento de aceites esenciales y bálsamo hidratante.',
      25,
      30,
      '',
      'water_drop',
      'Aceite natural',
      '',
      3
    ).lastInsertRowid;

    const srvBlackMask = insertService.run(
      catTratamientos,
      'Black Mask Detox',
      'Exfoliación facial profunda con carbón activado, tónico refrescante y descongestión de poros.',
      20,
      25,
      '',
      'face',
      'Carbón puro',
      '',
      4
    ).lastInsertRowid;

    const srvScissorCut = insertService.run(
      catCortes,
      'Scissor Architecture Cut',
      'Corte clásico o contemporáneo 100% a tijera, texturizado orgánico, lavado detox y styling.',
      40,
      50,
      'Editorial',
      'content_cut',
      'Técnica a tijera',
      '',
      5
    ).lastInsertRowid;

    const srvExecutivePack = insertService.run(
      catCombos,
      'Obsidian Total Grooming',
      'Skin Fade o corte a tijera, esculpido de barba al vapor, Black Mask Detox y bebida de cortesía.',
      70,
      90,
      'Full Session',
      'diamond',
      'Experiencia total',
      '',
      6
    ).lastInsertRowid;

    // 4. Barbers
    const insertBarber = db.prepare(`
      INSERT INTO barbers (
        name, specialty, bio, avatar_url, rating, reviews_count, email, phone, active, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);

    const barberMateo = insertBarber.run(
      'Mateo Silva',
      'Master Fade',
      'Especialista en degradados de alta precisión, transiciones invisibles a navaja y geometría craneal.',
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAN0VZwi_O_6KWfSHVTReQVqEREU-BOVsG3q-n-56KfMCGRcSStXGLRsT_WuGc-8kqbS60KrAXBx9bM6UwISnsT1hc91NZM9aGdr7zsuWYq-EE7z-CGk3e9PYu3JppUFRDK9KbD-wOzRhjm9R36aocHfMmszawyAsWKBn3d6cAmMRZVDbBCBG5diwNe_4Wt-m8ouTv9RbCYGbZJPL1mKfzS5dFQPUMrFqyt3iylmZi5',
      4.9,
      142,
      'mateo@kultstudio.com',
      '+52 55 8421 9001',
      1
    ).lastInsertRowid;

    const barberAlex = insertBarber.run(
      'Alex Vance',
      'Beard Specialist',
      'Maestro en visagismo de barba, rituales de toalla caliente con ozono y perfilado tradicional con navaja libre.',
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDSj174wKmMTGnPkc_FdCZnwxJDNWq_JiuCCNKbVP9koFA6znzRsZKySMEFoo9Csb1GFHCOnMoWRH_9yo5ZjHicQxIWDr4dBh0mxCe0IoWilPAQ0Lvmk6Sbd8MaBMnUMsR56IfpL3MsasiKUCWkyQRco6wJzNWm35Bn09Rsva0RbaOSFMYmgo_yl7zhmA2gvfOX4OITIBBCkLRv5om0Hct54Cw5iBD7qU-qXrpG43fS',
      4.8,
      98,
      'alex@kultstudio.com',
      '+52 55 8421 9002',
      2
    ).lastInsertRowid;

    const barberLucas = insertBarber.run(
      'Lucas Rossi',
      'Scissor Craft',
      'Director creativo formado en Milán. Experto en arquitectura capilar a tijera, texturas largas y cortes editoriales.',
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCcUqX9XC0SbekBHnmMZyb_zcA6q4x8ylUsPNsPRyXPBzuioHRXQD7m5yS8Zy88ki0gL9FUO1Xfmn3cwGrTBIAGfiM83hIoLER2ssM4owTf5_j6Ekvm01F0ofsVTAj8syLiZeag4IcmMI3DOmOsx3D4UU_83srAQf9hUnqDBMCS1SuTAzxtYmw-AjskUPm7b48DkVRark8SGUpK8wbqgJyK4tySzNXqj4v-6aZg7o_H',
      5.0,
      116,
      'lucas@kultstudio.com',
      '+52 55 8421 9003',
      3
    ).lastInsertRowid;

    // 5. Assign Services to Barbers
    const insertBarberService = db.prepare('INSERT INTO barber_services (barber_id, service_id) VALUES (?, ?)');
    // Mateo performs all fade, combo, beard, treatment services
    for (const sId of [srvSkinFade, srvSignatureCombo, srvEsculpido, srvBlackMask, srvExecutivePack]) {
      insertBarberService.run(barberMateo, sId);
    }
    // Alex performs beard, combo, fade, treatment services
    for (const sId of [srvSkinFade, srvSignatureCombo, srvEsculpido, srvBlackMask, srvExecutivePack]) {
      insertBarberService.run(barberAlex, sId);
    }
    // Lucas performs all services including Scissor Architecture Cut
    for (const sId of [srvSkinFade, srvSignatureCombo, srvEsculpido, srvBlackMask, srvScissorCut, srvExecutivePack]) {
      insertBarberService.run(barberLucas, sId);
    }

    // 6. General & Individual Working Hours (0=Sun .. 6=Sat)
    const insertHours = db.prepare(`
      INSERT INTO working_hours (
        barber_id, day_of_week, is_working, start_time, end_time, break_start, break_end
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (let day = 0; day <= 6; day++) {
      // Studio open Mon-Sat 09:30 to 20:00, Sun 10:00 to 17:00
      const isSunday = day === 0;
      const start = isSunday ? '10:00' : '09:30';
      const end = isSunday ? '17:00' : '20:00';
      const brkStart = isSunday ? '13:30' : '14:00';
      const brkEnd = isSunday ? '14:00' : '15:00';

      insertHours.run(null, day, 1, start, end, brkStart, brkEnd);
      insertHours.run(barberMateo, day, 1, start, end, brkStart, brkEnd);
      insertHours.run(barberAlex, day, 1, start, end, '14:30', '15:15');
      insertHours.run(barberLucas, day, isSunday ? 0 : 1, start, end, brkStart, brkEnd);
    }

    // 7. Users (Admin + Barbers)
    const insertUser = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, barber_id, active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    insertUser.run('Director KULT Admin', 'admin@kultstudio.com', hashPassword('KultAdmin2026!'), 'admin', null);
    insertUser.run('Mateo Silva', 'mateo@kultstudio.com', hashPassword('KultBarber2026!'), 'barber', barberMateo);
    insertUser.run('Alex Vance', 'alex@kultstudio.com', hashPassword('KultBarber2026!'), 'barber', barberAlex);
    insertUser.run('Lucas Rossi', 'lucas@kultstudio.com', hashPassword('KultBarber2026!'), 'barber', barberLucas);

    // 8. Seed Initial Clients & Bookings around current date so Dashboard & Availability reflect real data
    const { dateStr: today } = getNowInTimezone('America/Mexico_City');
    const tomorrow = addDays(today, 1);
    const yesterday = addDays(today, -1);

    const insertClient = db.prepare(`
      INSERT INTO clients (name, phone, email, notes) VALUES (?, ?, ?, ?)
    `);
    const client1 = insertClient.run('Sebastián Mendoza', '+52 55 4123 7890', 's.mendoza@arquitectura.mx', 'Prefiere navaja fría y pomada mate').lastInsertRowid;
    const client2 = insertClient.run('Diego Villarreal', '+52 55 6789 1234', 'diego.v@finanzas.com', 'Degradado medio sin marcar línea').lastInsertRowid;
    const client3 = insertClient.run('Julián Herrera', '+52 55 9012 3456', 'julian.herrera@studio.io', 'Piel sensible, usar aceite de sándalo').lastInsertRowid;
    const client4 = insertClient.run('Rodrigo Castellanos', '+52 55 3344 5566', 'rodrigo.c@legal.mx', 'Cliente frecuente cada 15 días').lastInsertRowid;

    const insertBooking = db.prepare(`
      INSERT INTO bookings (
        booking_code, client_id, service_id, barber_id, requested_any_barber,
        date, start_time, end_time, duration_minutes, price, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertHistory = db.prepare(`
      INSERT INTO booking_history (booking_id, action, previous_status, new_status, details, performed_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Yesterday completed booking
    const b1 = insertBooking.run(
      'KLT-782104', client1, srvSignatureCombo, barberMateo, 0,
      yesterday, '11:00', '12:15', 75, 55, 'completed', 'Servicio completado a tiempo'
    ).lastInsertRowid;
    insertHistory.run(b1, 'created', '', 'completed', 'Reserva completada y cobrada', 'Mateo Silva');

    // Today bookings
    const b2 = insertBooking.run(
      'KLT-841920', client2, srvSkinFade, barberMateo, 0,
      today, '13:15', '14:00', 45, 35, 'confirmed', 'Confirmado vía web'
    ).lastInsertRowid;
    insertHistory.run(b2, 'created', '', 'confirmed', 'Reserva registrada por el cliente', 'Diego Villarreal');

    const b3 = insertBooking.run(
      'KLT-910238', client3, srvEsculpido, barberAlex, 0,
      today, '16:00', '16:30', 30, 25, 'confirmed', 'Toalla caliente aromática'
    ).lastInsertRowid;
    insertHistory.run(b3, 'created', '', 'confirmed', 'Reserva registrada por el cliente', 'Julián Herrera');

    const b4 = insertBooking.run(
      'KLT-553819', client4, srvExecutivePack, barberMateo, 0,
      today, '17:30', '19:00', 90, 70, 'pending', 'Solicita confirmación por WhatsApp'
    ).lastInsertRowid;
    insertHistory.run(b4, 'created', '', 'pending', 'Reserva pendiente de validación', 'Rodrigo Castellanos');

    // Tomorrow booking (only if tomorrow is not Sunday for Lucas, so use Mateo)
    const b5 = insertBooking.run(
      'KLT-629401', client1, srvBlackMask, barberMateo, 1,
      tomorrow, '12:00', '12:25', 25, 20, 'confirmed', 'Asignado automáticamente al primer sillón libre'
    ).lastInsertRowid;
    insertHistory.run(b5, 'created', '', 'confirmed', 'Reserva confirmada (Cualquiera disponible)', 'Sebastián Mendoza');
  });

  seedPortfolioIfEmpty();
}

module.exports = { seedDatabase };

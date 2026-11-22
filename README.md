# S BARBER STUDIO — Sistema Integral de Reservas, Lookbook y Gestión Administrativa

Implementación Full Stack completa para **S BARBER STUDIO** con paleta cromática invertida predominantemente blanca (*Optic White & Obsidian Ink*).

---

## 1. Arquitectura del Proyecto

```
kult-barber-studio/
├── .env.example                 # Plantilla de variables de entorno e integraciones
├── .env                         # Configuración activa del entorno
├── package.json                 # Scripts de ejecución (Node.js >= 22.5 / v24)
├── DESIGN.md                    # Especificación del sistema de diseño Obsidian & Chrome
├── data/
│   └── kult.sqlite              # Base de datos relacional SQLite (modo WAL + transacciones IMMEDIATE)
└── src/
    ├── server.js                # Servidor HTTP, enrutador estático y guardia de rutas protegidas
    ├── config/
    │   └── env.js               # Cargador de variables de entorno tipadas
    ├── database/
    │   ├── connection.js        # Conexión node:sqlite y helper transaccional atómico
    │   ├── schema.js            # Esquema DDL completo (12 tablas relacionales e índices)
    │   └── seed.js              # Semilla inicial con datos reales de referencia
    ├── models/
    │   ├── userModel.js         # Usuarios, roles, hash scrypt y sesiones persistentes
    │   ├── serviceModel.js      # Categorías y catálogo de servicios
    │   ├── barberModel.js       # Barberos, asignación de servicios y horarios por barbero
    │   ├── scheduleModel.js     # Horarios laborales del estudio, descansos y bloqueos
    │   ├── clientModel.js       # Directorio de clientes e historial acumulado
    │   ├── bookingModel.js      # Reservas y bitácora de auditoría (booking_history)
    │   └── settingsModel.js     # Configuración general del negocio
    ├── services/
    │   ├── availabilityService.js # Motor de disponibilidad real y reserva atómica anti-colisiones
    │   ├── dashboardService.js    # KPIs operativos, ingresos, gráficos y rendimiento por barbero
    │   └── integrationService.js  # Conectores para SMTP, WhatsApp Business API y subida de imágenes
    ├── middlewares/
    │   └── authMiddleware.js    # Validación de sesión por cookie HttpOnly / Bearer y control RBAC
    ├── validation/
    │   └── validators.js        # Validaciones de entrada en servidor
    ├── controllers/
    │   ├── publicController.js  # Endpoints públicos de catálogo, disponibilidad y reservas
    │   ├── authController.js    # Login, logout y verificación de sesión
    │   └── adminController.js   # Operaciones administrativas protegidas por rol
    ├── routes/
    │   └── apiRoutes.js         # Enrutador central de la API REST
    └── public/
        ├── index.html           # Interfaz principal responsive (12/8/4 columnas)
        ├── css/
        │   └── styles.css       # Tokens Obsidian & Chrome, superficies y transiciones 150ms
        └── js/
            ├── api.js           # Cliente HTTP, notificaciones toast y diálogos de confirmación
            ├── store.js         # Estado reactivo del flujo de reservas y administración
            ├── booking.js       # Motor de reservas en 4 pasos, barra flotante y autogestión
            ├── admin.js         # Consola administrativa (7 módulos completos)
            └── app.js           # Orquestador de vistas y navegación
```

---

## 2. Ejecución

```bash
node src/server.js
```

El sistema estará disponible en: `http://localhost:3000`

---

## 3. Credenciales Administrativas por Defecto

- **Administrador General** (acceso total a todos los módulos):
  - **Correo:** `admin@kultstudio.com`
  - **Contraseña:** `KultAdmin2026!`
- **Barberos Especialistas** (acceso a sus propias citas, métricas, perfil y bloqueos):
  - **Mateo Silva:** `mateo@kultstudio.com` / `KultBarber2026!`
  - **Alex Vance:** `alex@kultstudio.com` / `KultBarber2026!`
  - **Lucas Rossi:** `lucas@kultstudio.com` / `KultBarber2026!`

---

## 4. Configuración de Integraciones Externas (`.env`)

Para habilitar notificaciones externas en producción, completa las siguientes variables en `.env`:

- **Correo Electrónico (SMTP):** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- **WhatsApp Business Cloud API:** `WHATSAPP_API_URL`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`
- **Almacenamiento de Imágenes:** `STORAGE_PROVIDER=local` (activo por defecto en `/uploads`), extensible a S3 o Cloudinary.

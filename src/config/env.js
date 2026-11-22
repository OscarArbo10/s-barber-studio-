const fs = require('node:fs');
const path = require('node:path');

function loadDotEnv() {
  const envPath = path.resolve(__dirname, '../../.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadDotEnv();

const ROOT_DIR = path.resolve(__dirname, '../..');

const env = {
  rootDir: ROOT_DIR,
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  sessionSecret: process.env.SESSION_SECRET || 'sbarber_studio_secret_key_2026_prod',
  sessionTtlHours: parseInt(process.env.SESSION_TTL_HOURS || '24', 10),
  dbPath: path.resolve(ROOT_DIR, process.env.DB_PATH || './data/kult.sqlite'),
  supabase: {
    url: process.env.SUPABASE_URL || 'https://iqweqloruoiwuvirhkzs.supabase.co',
    anonKey:
      process.env.SUPABASE_ANON_KEY ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlxd2VxbG9ydW9pd3V2aXJoa3pzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwNDY5MDksImV4cCI6MjEwODYyMjkwOX0.IV-vmqeZL5A3dI9A9vEumjGEG-7pxmiKsY5OlpQMfnA',
    rpcSecret: process.env.SBARBER_RPC_SECRET || '5abb17f87cd6a24256dc8a19338bf9ee22f074d55d4a5e53'
  },
  defaultTimezone: process.env.DEFAULT_TIMEZONE || 'America/Mexico_City',
  defaultCurrency: process.env.DEFAULT_CURRENCY || 'USD',
  defaultCurrencySymbol: process.env.DEFAULT_CURRENCY_SYMBOL || '$',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'S Barber Studio <no-reply@sbarberstudio.com>'
  },
  whatsapp: {
    apiUrl: process.env.WHATSAPP_API_URL || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || ''
  },
  storage: {
    provider: process.env.STORAGE_PROVIDER || 'supabase',
    uploadDir: path.resolve(ROOT_DIR, process.env.UPLOAD_DIR || './src/public/uploads')
  }
};

module.exports = env;

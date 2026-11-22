const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const env = require('./config/env');
const { db } = require('./database/connection');
const { initSchema } = require('./database/schema');
const { seedDatabase } = require('./database/seed');
const { handleApiRoute } = require('./routes/apiRoutes');
const { getAuthenticatedUser } = require('./middlewares/authMiddleware');

let initialized = false;
function ensureInitialized() {
  if (initialized) return;
  initialized = true;
  try {
    initSchema();
    seedDatabase();
  } catch (err) {
    console.error('[DB Init Warning]', err.message);
  }
}

const PUBLIC_DIR = path.resolve(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime'
};

function serveStaticFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Recurso no encontrado');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(data);
  });
}

async function requestHandler(req, res) {
  try {
    ensureInitialized();

    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(urlObj.pathname);

    // 1. API Routes
    if (pathname.startsWith('/api/')) {
      await handleApiRoute(req, res, urlObj);
      return;
    }

    // 2. Serve Uploaded Media from Supabase (sbarber.media_uploads) or Local Disk
    if (pathname.startsWith('/uploads/')) {
      const filename = path.basename(pathname);
      if (db.isSupabase) {
        const mediaRow = db.prepare(`SELECT mime_type, data_base64 FROM media_uploads WHERE filename = ?`).get(filename);
        if (mediaRow && mediaRow.data_base64) {
          const buf = Buffer.from(mediaRow.data_base64, 'base64');
          res.writeHead(200, {
            'Content-Type': mediaRow.mime_type || 'application/octet-stream',
            'Cache-Control': 'public, max-age=86400'
          });
          res.end(buf);
          return;
        }
      }
    }

    // 3. Server-side protection for direct administrative URLs (/admin, /dashboard, /agenda)
    if (pathname === '/admin' || pathname.startsWith('/admin/') || pathname === '/dashboard' || pathname === '/agenda') {
      const user = getAuthenticatedUser(req);
      if (!user || !['admin', 'barber'].includes(user.role)) {
        res.writeHead(302, {
          Location: '/?auth=required&target=admin',
          'Cache-Control': 'no-store'
        });
        res.end();
        return;
      }
      return serveStaticFile(res, path.join(PUBLIC_DIR, 'index.html'));
    }

    // 4. Static Assets
    let safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    if (safePath === '/' || safePath === '\\') {
      safePath = '/index.html';
    }
    const targetFile = path.join(PUBLIC_DIR, safePath);

    if (targetFile.startsWith(PUBLIC_DIR) && fs.existsSync(targetFile) && fs.statSync(targetFile).isFile()) {
      return serveStaticFile(res, targetFile);
    }

    // SPA Fallback for client views (/reservar, /inicio, /mis-citas)
    if (['/reservar', '/inicio', '/mis-citas'].includes(pathname)) {
      return serveStaticFile(res, path.join(PUBLIC_DIR, 'index.html'));
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 - Página no encontrada');
  } catch (err) {
    console.error('[Server Error]', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Error interno del servidor.' }));
    }
  }
}

if (!process.env.VERCEL) {
  const server = http.createServer(requestHandler);
  server.listen(env.port, env.host, () => {
    ensureInitialized();
    console.log(`============================================================`);
    console.log(`  S BARBER STUDIO — SUPABASE & VERCEL READY SYSTEM ONLINE`);
    console.log(`  URL:      http://localhost:${env.port}`);
    console.log(`  SUPABASE: ${env.supabase.url} (schema: sbarber)`);
    console.log(`============================================================`);
  });
}

module.exports = requestHandler;

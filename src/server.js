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
  if (initialized || db.isSupabase) {
    initialized = true;
    return;
  }
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

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico']);

// In-memory cache for static public assets
const staticFileCache = new Map();

// In-memory LRU cache (max 50 items, < 2MB each) for uploaded Supabase media
const UPLOAD_CACHE_MAX_ITEMS = 50;
const UPLOAD_CACHE_MAX_BYTES = 2 * 1024 * 1024;
const uploadMediaCache = new Map();

function getCachedUpload(filename) {
  if (!uploadMediaCache.has(filename)) return null;
  const entry = uploadMediaCache.get(filename);
  // Refresh LRU recency
  uploadMediaCache.delete(filename);
  uploadMediaCache.set(filename, entry);
  return entry;
}

function setCachedUpload(filename, entry) {
  if (!entry || !entry.buffer || entry.buffer.length >= UPLOAD_CACHE_MAX_BYTES) return;
  if (uploadMediaCache.has(filename)) {
    uploadMediaCache.delete(filename);
  } else if (uploadMediaCache.size >= UPLOAD_CACHE_MAX_ITEMS) {
    const oldestKey = uploadMediaCache.keys().next().value;
    uploadMediaCache.delete(oldestKey);
  }
  uploadMediaCache.set(filename, entry);
}

function getCacheControlForStatic(ext, urlObj) {
  if (ext === '.html') {
    return 'no-cache';
  }
  const hasVersionParam = Boolean(urlObj && urlObj.searchParams && urlObj.searchParams.has('v'));
  if (hasVersionParam || IMAGE_EXTS.has(ext)) {
    return 'public, max-age=31536000, immutable';
  }
  return 'public, max-age=3600, stale-while-revalidate=86400';
}

function serveStaticFile(res, filePath, urlObj = null) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const cacheControl = getCacheControlForStatic(ext, urlObj);

  const cached = staticFileCache.get(filePath);
  if (cached) {
    res.writeHead(200, {
      'Content-Type': cached.contentType,
      'Cache-Control': cacheControl,
      'Content-Length': cached.buffer.length
    });
    res.end(cached.buffer);
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Recurso no encontrado');
      return;
    }
    staticFileCache.set(filePath, { buffer: data, contentType });
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      'Content-Length': data.length
    });
    res.end(data);
  });
}

async function requestHandler(req, res) {
  try {
    res._req = req;
    ensureInitialized();

    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const rewrittenPath = urlObj.searchParams.get('__path');
    if (rewrittenPath) {
      urlObj.pathname = rewrittenPath.startsWith('/') ? rewrittenPath : `/${rewrittenPath}`;
      urlObj.searchParams.delete('__path');
    } else if (urlObj.pathname === '/api/index.js' || urlObj.pathname === '/api/index') {
      const forwardedPath = req.headers['x-matched-path'] || req.headers['x-invoke-path'] || '/';
      urlObj.pathname = forwardedPath === '/api/index.js' || forwardedPath === '/api/index' ? '/' : forwardedPath;
    }
    const pathname = decodeURIComponent(urlObj.pathname);

    // 1. API Routes
    if (pathname.startsWith('/api/')) {
      await handleApiRoute(req, res, urlObj);
      return;
    }

    // 2. Serve Uploaded Media from Supabase (sbarber.media_uploads) asynchronously with LRU cache
    if (pathname.startsWith('/uploads/')) {
      const filename = path.basename(pathname);
      if (db.isSupabase && typeof db.callRpcAsync === 'function') {
        const cachedUpload = getCachedUpload(filename);
        if (cachedUpload) {
          res.writeHead(200, {
            'Content-Type': cachedUpload.contentType,
            'Cache-Control': 'public, max-age=604800, immutable',
            'Content-Length': cachedUpload.buffer.length
          });
          res.end(cachedUpload.buffer);
          return;
        }

        const safeFilename = filename.replace(/'/g, "''");
        const rows = await db.callRpcAsync('sbarber_exec', {
          sql_text: `SELECT mime_type, data_base64 FROM media_uploads WHERE filename = '${safeFilename}' LIMIT 1`,
          is_run: false
        });
        const mediaRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
        if (mediaRow && mediaRow.data_base64) {
          const buf = Buffer.from(mediaRow.data_base64, 'base64');
          const contentType = mediaRow.mime_type || 'application/octet-stream';
          setCachedUpload(filename, { buffer: buf, contentType });
          res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=604800, immutable',
            'Content-Length': buf.length
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
      return serveStaticFile(res, path.join(PUBLIC_DIR, 'index.html'), urlObj);
    }

    // 4. Static Assets
    let safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    if (safePath === '/' || safePath === '\\') {
      safePath = '/index.html';
    }
    const targetFile = path.join(PUBLIC_DIR, safePath);

    if (targetFile.startsWith(PUBLIC_DIR) && fs.existsSync(targetFile) && fs.statSync(targetFile).isFile()) {
      return serveStaticFile(res, targetFile, urlObj);
    }

    // SPA Fallback for client views (/reservar, /inicio, /mis-citas)
    if (['/reservar', '/inicio', '/mis-citas'].includes(pathname)) {
      return serveStaticFile(res, path.join(PUBLIC_DIR, 'index.html'), urlObj);
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

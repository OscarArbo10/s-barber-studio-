const zlib = require('node:zlib');

function sendJson(res, statusCode, payload, extraHeaders = {}, req = null) {
  const rawBuf = Buffer.from(JSON.stringify(payload), 'utf8');
  const acceptEncoding = String((req || res._req)?.headers?.['accept-encoding'] || '').toLowerCase();

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  };

  let bodyBuf = rawBuf;
  if (rawBuf.length > 1024) {
    if (acceptEncoding.includes('br')) {
      bodyBuf = zlib.brotliCompressSync(rawBuf, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 4
        }
      });
      headers['Content-Encoding'] = 'br';
      headers['Vary'] = 'Accept-Encoding';
    } else if (acceptEncoding.includes('gzip')) {
      bodyBuf = zlib.gzipSync(rawBuf, { level: 6 });
      headers['Content-Encoding'] = 'gzip';
      headers['Vary'] = 'Accept-Encoding';
    }
  }

  headers['Content-Length'] = bodyBuf.length;
  res.writeHead(statusCode, headers);
  res.end(bodyBuf);
}

function readJsonBody(req, maxBytes = 35 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    let received = 0;
    req.on('data', chunk => {
      received += chunk.length;
      if (received > maxBytes) {
        req.destroy();
        reject(new Error('El tamaño de la solicitud excede el límite permitido.'));
        return;
      }
      body += chunk.toString('utf8');
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (_) {
        reject(new Error('El cuerpo JSON enviado no es válido.'));
      }
    });
    req.on('error', err => reject(err));
  });
}

module.exports = {
  sendJson,
  readJsonBody
};

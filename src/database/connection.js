const { Worker, MessageChannel, receiveMessageOnPort } = require('node:worker_threads');
const env = require('../config/env');

const WORKER_SCRIPT = `
const { parentPort } = require('node:worker_threads');

parentPort.on('message', async ({ port, lock, url, key, body }) => {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = text;
    }
    port.postMessage({ ok: res.ok, status: res.status, data });
  } catch (err) {
    port.postMessage({ ok: false, status: 500, error: err.message });
  } finally {
    Atomics.store(lock, 0, 1);
    Atomics.notify(lock, 0, 1);
  }
});
`;

let rpcWorker = null;

function getWorker() {
  if (!rpcWorker) {
    rpcWorker = new Worker(WORKER_SCRIPT, { eval: true });
    rpcWorker.unref();
  }
  return rpcWorker;
}

function callSupabaseRpcSync(rpcName, payload) {
  const worker = getWorker();
  const { port1, port2 } = new MessageChannel();
  const sab = new SharedArrayBuffer(4);
  const lock = new Int32Array(sab);

  const url = `${env.supabase.url.replace(/\/$/, '')}/rest/v1/rpc/${rpcName}`;
  worker.postMessage(
    {
      port: port2,
      lock,
      url,
      key: env.supabase.anonKey,
      body: payload
    },
    [port2]
  );

  Atomics.wait(lock, 0, 0, 20000);
  const received = receiveMessageOnPort(port1);
  port1.close();

  if (!received || !received.message) {
    throw new Error(`Timeout o error de comunicación con Supabase RPC (${rpcName}).`);
  }

  const msg = received.message;
  if (!msg.ok) {
    const errMsg =
      (msg.data && (msg.data.message || msg.data.details || msg.data.error)) ||
      msg.error ||
      `Error HTTP ${msg.status} en Supabase RPC ${rpcName}`;
    throw new Error(errMsg);
  }

  return msg.data;
}

function escapePgLiteral(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (typeof val === 'number') {
    return Number.isFinite(val) ? String(val) : 'NULL';
  }
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

function bindSqlParams(rawSql, params) {
  let paramIdx = 0;
  let result = '';
  let inSingleQuote = false;

  for (let i = 0; i < rawSql.length; i++) {
    const ch = rawSql[i];
    if (ch === "'") {
      if (inSingleQuote && rawSql[i + 1] === "'") {
        result += "''";
        i++;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      result += ch;
      continue;
    }
    if (ch === '?' && !inSingleQuote) {
      const val = paramIdx < params.length ? params[paramIdx++] : null;
      result += escapePgLiteral(val);
    } else {
      result += ch;
    }
  }
  return result;
}

function translateSqliteToPostgres(sql, isRun) {
  let out = sql.trim();

  // Translate datetime('now') and session expiry comparisons
  out = out.replace(/datetime\(\s*expires_at\s*\)\s*<=\s*datetime\(\s*'now'\s*\)/gi, 'expires_at::timestamptz <= NOW()');
  out = out.replace(/datetime\(\s*'now'\s*\)/gi, 'NOW()::text');
  out = out.replace(/\bLIKE\b/g, 'ILIKE');

  // Translate INSERT OR IGNORE INTO ... VALUES (...) -> INSERT INTO ... VALUES (...) ON CONFLICT DO NOTHING
  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(out)) {
    out = out.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
    out = out.replace(/;?\s*$/, ' ON CONFLICT DO NOTHING');
  }

  // Strip trailing semicolons for SELECT subqueries wrapped by sbarber_exec
  if (!isRun) {
    out = out.replace(/;+\s*$/, '');
  }

  return out;
}

const db = {
  isSupabase: true,

  callRpc(rpcName, payload = {}) {
    return callSupabaseRpcSync(rpcName, {
      secret_token: env.supabase.rpcSecret,
      ...payload
    });
  },

  exec(rawSql) {
    const clean = rawSql.trim();
    if (!clean || /^PRAGMA/i.test(clean) || /^BEGIN/i.test(clean) || /^COMMIT/i.test(clean) || /^ROLLBACK/i.test(clean)) {
      return;
    }
    const pgSql = translateSqliteToPostgres(clean, true);
    return callSupabaseRpcSync('sbarber_exec', {
      secret_token: env.supabase.rpcSecret,
      sql_text: pgSql,
      is_run: true
    });
  },

  prepare(rawSql) {
    return {
      get(...params) {
        const bound = bindSqlParams(rawSql, params);
        const pgSql = translateSqliteToPostgres(bound, false);
        const rows = callSupabaseRpcSync('sbarber_exec', {
          secret_token: env.supabase.rpcSecret,
          sql_text: pgSql,
          is_run: false
        });
        return Array.isArray(rows) && rows.length > 0 ? rows[0] : undefined;
      },

      all(...params) {
        const bound = bindSqlParams(rawSql, params);
        const pgSql = translateSqliteToPostgres(bound, false);
        const rows = callSupabaseRpcSync('sbarber_exec', {
          secret_token: env.supabase.rpcSecret,
          sql_text: pgSql,
          is_run: false
        });
        return Array.isArray(rows) ? rows : [];
      },

      run(...params) {
        const bound = bindSqlParams(rawSql, params);
        const pgSql = translateSqliteToPostgres(bound, true);
        const res = callSupabaseRpcSync('sbarber_exec', {
          secret_token: env.supabase.rpcSecret,
          sql_text: pgSql,
          is_run: true
        });
        return {
          changes: res && typeof res.changes === 'number' ? res.changes : 0,
          lastInsertRowid: res && res.lastInsertRowid ? Number(res.lastInsertRowid) : 0
        };
      }
    };
  },

  uploadMedia(filename, mimeType, base64Content) {
    return callSupabaseRpcSync('sbarber_upload_media', {
      secret_token: env.supabase.rpcSecret,
      file_name: filename,
      mime: mimeType,
      base64_content: base64Content
    });
  }
};

function withTransaction(fn) {
  return fn(db);
}

module.exports = {
  db,
  withTransaction
};

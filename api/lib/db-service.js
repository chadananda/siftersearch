// DB service — owns single better-sqlite3 connection; serializes writes via JS event loop.
// All other PM2 processes connect as clients via Unix domain socket at ./data/sifter-db.sock.
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { logger } from './logger.js';

const SOCKET_PATH = path.resolve('./data/sifter-db.sock');
const SLOW_QUERY_THRESHOLD_MS = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '150', 10);

function openDb() {
  const url = process.env.TURSO_DATABASE_URL || 'file:./data/sifter.db';
  const dbPath = url.startsWith('file:') ? url.slice(5) : url;
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 30000');
  db.pragma('cache_size = -524288');
  db.pragma('mmap_size = 1073741824');
  logger.info({ path: dbPath }, 'DB service: content DB opened');
  return db;
}

function logTiming(name, sql, params, duration) {
  logger.trace({ name, duration }, `query [${name}] ${duration}ms`);
  if (duration >= SLOW_QUERY_THRESHOLD_MS) {
    logger.warn(
      { name, duration, sql: sql?.slice(0, 200), params: params?.length > 5 ? `[${params.length} params]` : params },
      `Slow query (${duration}ms) [${name}]`
    );
  }
}

function execRequest(db, req) {
  const { type, sql, params = [], statements = [], pragma, name = '' } = req;
  const start = Date.now();
  let result;
  if (type === 'queryOne') {
    result = db.prepare(sql).get(...params) ?? null;
  } else if (type === 'queryAll') {
    result = db.prepare(sql).all(...params);
  } else if (type === 'run') {
    const info = db.prepare(sql).run(...params);
    result = { lastInsertRowid: info.lastInsertRowid, changes: info.changes };
  } else if (type === 'transaction') {
    const txn = db.transaction((stmts) => stmts.map(({ sql: s, params: p = [] }) => {
      const info = db.prepare(s).run(...p);
      return { lastInsertRowid: info.lastInsertRowid, changes: info.changes };
    }));
    result = txn(statements);
  } else if (type === 'pragma') {
    result = db.pragma(pragma);
  } else if (type === 'database_list') {
    result = db.pragma('database_list');
  } else {
    throw new Error(`Unknown request type: ${type}`);
  }
  const duration = Date.now() - start;
  logTiming(name, sql || pragma, params, duration);
  return { result, duration };
}

export function startDbService() {
  return new Promise((resolve, reject) => {
    const db = openDb();
    let writeQueue = Promise.resolve();
    const isWrite = (type) => type === 'run' || type === 'transaction';

    if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH);

    const server = net.createServer((socket) => {
      let buf = '';
      socket.on('data', (chunk) => {
        buf += chunk.toString();
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          let req;
          try { req = JSON.parse(line); } catch { return; }
          const { id } = req;
          const run = () => {
            try {
              const { result, duration } = execRequest(db, req);
              socket.write(JSON.stringify({ id, result, duration }) + '\n');
            } catch (err) {
              const duration = 0;
              socket.write(JSON.stringify({ id, error: err.message, duration }) + '\n');
            }
          };
          if (isWrite(req.type)) {
            writeQueue = writeQueue.then(run, run);
          } else {
            run();
          }
        }
      });
      socket.on('error', (err) => logger.warn({ err }, 'DB service: socket error'));
    });

    server.on('error', reject);
    server.listen(SOCKET_PATH, () => {
      fs.chmodSync(SOCKET_PATH, 0o660);
      logger.info({ socket: SOCKET_PATH }, 'DB service: listening');
      resolve(server);
    });

    const shutdown = () => {
      logger.info('DB service: SIGTERM — draining writes then closing');
      server.close(() => {
        writeQueue.then(() => {
          db.close();
          logger.info('DB service: shutdown complete');
          process.exit(0);
        });
      });
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  });
}

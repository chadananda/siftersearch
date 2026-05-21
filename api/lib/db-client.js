// DB client — connects to db-service via Unix socket. Name convention: 'worker-name:operation-description'.
// Reconnects with exponential backoff (max 30s). Queues requests while connecting.
import net from 'node:net';
import path from 'node:path';
import { logger } from './logger.js';

const SOCKET_PATH = path.resolve('./data/sifter-db.sock');
const MAX_BACKOFF_MS = 30000;

let socket = null;
let connected = false;
let reconnecting = false;
let pendingQueue = [];
const inFlight = new Map();
let buf = '';

function connect(delay = 0) {
  if (reconnecting) return;
  reconnecting = true;
  setTimeout(() => {
    reconnecting = false;
    const sock = net.createConnection(SOCKET_PATH);
    sock.on('connect', () => {
      socket = sock;
      connected = true;
      logger.info({ socket: SOCKET_PATH }, 'DB client: connected');
      const queued = pendingQueue.splice(0);
      for (const { data } of queued) sock.write(data);
    });
    sock.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        const pending = inFlight.get(msg.id);
        if (!pending) continue;
        inFlight.delete(msg.id);
        if (msg.error) pending.reject(new Error(msg.error));
        else pending.resolve(msg.result);
      }
    });
    sock.on('close', () => {
      connected = false;
      socket = null;
      const nextDelay = Math.min((delay || 100) * 2, MAX_BACKOFF_MS);
      logger.warn({ nextDelay }, 'DB client: disconnected, reconnecting');
      for (const [, pending] of inFlight) pending.reject(new Error('DB client: connection lost'));
      inFlight.clear();
      connect(nextDelay);
    });
    sock.on('error', (err) => logger.warn({ err }, 'DB client: socket error'));
  }, delay);
}

connect();

function send(req) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const data = JSON.stringify({ ...req, id }) + '\n';
    inFlight.set(id, { resolve, reject });
    if (connected && socket) {
      socket.write(data);
    } else {
      pendingQueue.push({ data });
    }
  });
}

export async function query(sql, params = [], name = '') {
  const isWrite = /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|PRAGMA|ANALYZE|VACUUM|REINDEX|ATTACH|DETACH)\b/i.test(sql);
  const type = isWrite ? 'run' : 'queryAll';
  const result = await send({ type, sql, params, name });
  if (isWrite) return { rows: [result], lastInsertRowid: result?.lastInsertRowid };
  return { rows: result };
}

export async function queryOne(sql, params = [], name = '') {
  const result = await send({ type: 'queryOne', sql, params, name });
  return result ?? null;
}

export async function queryAll(sql, params = [], name = '') {
  return send({ type: 'queryAll', sql, params, name });
}

export async function transaction(statements, name = '') {
  return send({ type: 'transaction', statements, name });
}

export async function getDb() {
  return {
    pragma: (str) => send({ type: 'pragma', pragma: str, name: 'getDb:pragma' }),
  };
}

export async function userQuery(sql, params = [], name = '') {
  return query(sql, params, `user:${name}`);
}

export async function userQueryOne(sql, params = [], name = '') {
  return queryOne(sql, params, `user:${name}`);
}

export async function userQueryAll(sql, params = [], name = '') {
  return queryAll(sql, params, `user:${name}`);
}

export async function userTransaction(statements, name = '') {
  return transaction(statements, `user:${name}`);
}

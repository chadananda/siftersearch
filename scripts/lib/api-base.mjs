// Default API base for ops scripts: tower's local gateway when running ON tower (has /tank), the public API anywhere else (dev Macs). SIFTER_API overrides.
import fs from 'node:fs';
export const apiBase = (env = process.env) => env.SIFTER_API || (fs.existsSync('/tank') ? 'http://127.0.0.1:7839' : 'https://api.siftersearch.com');

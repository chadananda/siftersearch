// Badí‘ calendar arithmetic. Naw-Rúz: March 21 before 172 B.E. (2015); from then the March equinox at Tehran (UTC+3:30), the day after if it falls after sunset (~18:10). Pure. Deps: none
const NAMES = ['Bahá', 'Jalál', 'Jamál', '‘Aẓamat', 'Núr', 'Raḥmat', 'Kalimát', 'Kamál', 'Asmá’', '‘Izzat', 'Mashíyyat', '‘Ilm', 'Qudrat', 'Qawl', 'Masá’il', 'Sharaf', 'Sulṭán', 'Mulk', '‘Alá’'];
const A = [485, 203, 199, 182, 156, 136, 77, 74, 70, 58, 52, 50, 45, 44, 29, 18, 17, 16, 14, 12, 12, 12, 9, 8];
const B = [324.96, 337.23, 342.08, 27.85, 73.14, 171.52, 222.54, 296.72, 243.58, 119.81, 297.17, 21.02, 247.54, 325.15, 60.93, 155.12, 288.79, 198.04, 199.76, 95.39, 287.11, 320.81, 227.73, 15.45];
const C = [1934.136, 32964.467, 20.186, 445267.112, 45036.886, 22518.443, 65928.934, 3034.906, 9037.513, 33718.147, 150.678, 2281.226, 29929.562, 31555.956, 4443.417, 67555.328, 4562.452, 62894.029, 31436.921, 14577.848, 31931.756, 34777.259, 1222.114, 16859.074];
const rad = Math.PI / 180, DAY = 86400000;
/** March equinox of a Gregorian year as a UTC ms timestamp (Meeus ch. 27, ΔT ≈ 69 s). */
export function marchEquinox(year) {
  const y = (year - 2000) / 1000, j0 = 2451623.80984 + 365242.37404 * y + 0.05169 * y ** 2 - 0.00411 * y ** 3 - 0.00057 * y ** 4;
  const T = (j0 - 2451545) / 36525, W = 35999.373 * T - 2.47, dl = 1 + 0.0334 * Math.cos(W * rad) + 0.0007 * Math.cos(2 * W * rad);
  const S = A.reduce((s, a, i) => s + a * Math.cos((B[i] + C[i] * T) * rad), 0), jde = j0 + (0.00001 * S) / dl;
  return (jde - 2440587.5) * DAY - 69000;
}
/** Naw-Rúz of Gregorian year → UTC-midnight ms of its civil day. */
export function nawRuz(year) {
  if (year < 2015) return Date.UTC(year, 2, 21);
  const local = marchEquinox(year) + 3.5 * 3600000, d = new Date(local), mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + (mins >= 18 * 60 + 10 ? 1 : 0));
}
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
/** 'YYYY-MM-DD' → { year (B.E.), month (1-19; 0 = Ayyám-i-Há), month_name, day, naw_ruz, naw_ruz_date }. */
export function badiDate(date) {
  const [Y, M, D] = date.split('-').map(Number), t = Date.UTC(Y, M - 1, D);
  if (Number.isNaN(t) || Y < 1844 || iso(t) !== date) throw Object.assign(new Error(`not a valid civil date from 1844: ${date}`), { code: 'invalid_input', retryable: false });
  const start = nawRuz(Y), gy = t >= start ? Y : Y - 1, ny = gy === Y ? start : nawRuz(gy), next = nawRuz(gy + 1);
  const d = Math.round((t - ny) / DAY), ayyam = Math.round((next - ny) / DAY) - 361;
  const r = d < 342 ? { month: Math.floor(d / 19) + 1, day: (d % 19) + 1 } : d < 342 + ayyam ? { month: 0, day: d - 341 } : { month: 19, day: d - 342 - ayyam + 1 };
  return { year: gy - 1843, ...r, month_name: r.month ? NAMES[r.month - 1] : 'Ayyám-i-Há', naw_ruz: d === 0, naw_ruz_date: iso(ny) };
}

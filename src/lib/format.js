export const TZ = 'Asia/Colombo';

const moneyFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function money(n) {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return '';
  return moneyFmt.format(Number(n));
}
export function lkr(n) {
  if (n === null || n === undefined || n === '') return '';
  return 'LKR ' + money(n);
}
export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
export function same(a, b) {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= 0.005;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' (or timestamp) -> '9 Oct 2026'. Plain dates are not shifted by time zone. */
export function day(v) {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
  }
  const iso = isoDay(v);
  return iso ? day(iso) : '';
}
/** timestamp -> 'YYYY-MM-DD' in Colombo */
export function isoDay(v) {
  if (!v) return '';
  const dt = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(dt.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(dt);
}
export function todayLK() {
  return isoDay(new Date());
}
export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
export function daysBetween(a, b) {
  const pa = Date.UTC(...a.split('-').map((x, i) => (i === 1 ? Number(x) - 1 : Number(x))));
  const pb = Date.UTC(...b.split('-').map((x, i) => (i === 1 ? Number(x) - 1 : Number(x))));
  return Math.round((pb - pa) / 86400000);
}
/** timestamp -> '9 Oct 2026, 2:15 pm' in Colombo */
export function when(v) {
  if (!v) return '';
  const dt = new Date(v);
  const t = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(dt);
  return `${day(isoDay(dt))}, ${t.replace(' ', ' ').toLowerCase()}`;
}
/** 'YYYY-MM-DD' -> 'dd/mm/yyyy' */
export function dmy(v) {
  if (!v) return '';
  const s = /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : isoDay(v);
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}
export function ago(v) {
  if (!v) return '';
  const mins = Math.round((Date.now() - new Date(v).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export const STATUS = {
  submitted: { label: 'With finance', tone: 'amber', step: 0 },
  assigned: { label: 'To collect', tone: 'blue', step: 1 },
  collected: { label: 'With driver', tone: 'blue', step: 2 },
  received: { label: 'To deposit', tone: 'amber', step: 3 },
  deposited: { label: 'In bank?', tone: 'teal', step: 4 },
  closed: { label: 'Closed', tone: 'green', step: 5 },
  cancelled: { label: 'Cancelled', tone: 'grey', step: -1 },
  returned: { label: 'Returned', tone: 'red', step: -1 },
};
export const STEPS = ['Requested', 'Driver assigned', 'Collected', 'With finance', 'Deposited', 'In bank'];
export const OPEN_STATUSES = ['submitted', 'assigned', 'collected', 'received', 'deposited'];

export const ROLE_LABEL = { sales: 'Sales', driver: 'Driver', finance: 'Finance', executive: 'Management' };

export const TAGS = {
  customer_transfer: 'Customer transfer (not a cheque)',
  internal_transfer: 'Internal transfer',
  other: 'Other',
};

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many || one + 's'}`;
}

export function telHref(p) {
  if (!p) return null;
  return 'tel:' + String(p).replace(/[^0-9+]/g, '');
}
export function mapsHref(c) {
  if (c.lat != null && c.lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`;
  if (c.location_text) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(c.location_text)}`;
  return null;
}

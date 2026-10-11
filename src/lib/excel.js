import * as XLSX from 'xlsx';

/* All Business Central column captions the app understands, in one place.
   Columns are matched by caption (lower case, letters and digits only), so
   their order and any extra columns don't matter. The first caption found wins. */
export const CAPTIONS = {
  customers: {
    customer_no: ['No.', 'Customer No.'],
    name: ['Name', 'Customer Name'],
    phone: ['Phone No.', 'Mobile Phone No.'],
    contact: ['Contact'],
    address: ['Address'],
    city: ['City'],
    posting_group: ['Customer Posting Group'],
    gen_bus_posting_group: ['Gen. Bus. Posting Group'],
    currency_code: ['Currency Code'],
    balance_lcy: ['Balance (LCY)'],
  },
  ledger: {
    entry_no: ['Entry No.'],
    customer_no: ['Customer No.'],
    customer_name: ['Customer Name'],
    posting_date: ['Posting Date'],
    document_type: ['Document Type'],
    document_no: ['Document No.'],
    external_document_no: ['External Document No.'],
    description: ['Description'],
    due_date: ['Due Date'],
    currency_code: ['Currency Code'],
    original_amount: ['Original Amt. (LCY)', 'Amount (LCY)', 'Original Amount'],
    remaining_amount: ['Remaining Amt. (LCY)', 'Remaining Amount (LCY)', 'Remaining Amount'],
    remaining_amount_fcy: ['Remaining Amount'],
    amount: ['Amount (LCY)', 'Amount'],
    open: ['Open'],
    business_unit: ['Bu Code', 'BU Code', 'Business Unit Code', 'Business Unit', 'Global Dimension 1 Code', 'Shortcut Dimension 1 Code'],
    salesperson_code: ['Salesperson Code'],
    bal_account_no: ['Bal. Account No.'],
  },
  detailed: {
    entry_no: ['Entry No.'],
    entry_type: ['Entry Type'],
    posting_date: ['Posting Date'],
    document_type: ['Document Type'],
    document_no: ['Document No.'],
    customer_no: ['Customer No.'],
    amount: ['Amount (LCY)', 'Amount'],
    cust_ledger_entry_no: ['Cust. Ledger Entry No.', 'Customer Ledger Entry No.', 'Cust Ledger Entry No'],
  },
  bankLedger: {
    entry_no: ['Entry No.'],
    bank_account_no: ['Bank Account No.'],
    posting_date: ['Posting Date'],
    document_type: ['Document Type'],
    document_no: ['Document No.'],
    description: ['Description'],
    amount: ['Amount (LCY)', 'Amount'],
    ext_doc_no: ['External Document No.'],
    reversed: ['Reversed'],
  },
  bankAccounts: {
    bc_code: ['No.'],
    bc_name: ['Name'],
    account_no: ['Bank Account No.'],
  },
};

export const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export async function readGrid(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
}

/** Find the header row (within the first rows) and the column of each field. */
export function locate(grid, spec, required, scan = 10) {
  let best = { score: -1, row: -1 };
  for (let i = 0; i < Math.min(scan, grid.length); i++) {
    const cells = (grid[i] || []).map(norm);
    let score = 0;
    for (const caps of Object.values(spec)) if (caps.some((c) => cells.includes(norm(c)))) score++;
    if (score > best.score) best = { score, row: i };
  }
  if (best.row < 0) return { error: 'The file is empty.' };
  const header = (grid[best.row] || []).map(norm);
  const cols = {};
  for (const [field, caps] of Object.entries(spec)) {
    for (const c of caps) {
      const idx = header.indexOf(norm(c));
      if (idx >= 0) { cols[field] = idx; break; }
    }
  }
  const missing = (required || []).filter((f) => cols[f] === undefined);
  return { row: best.row, cols, missing, captions: grid[best.row] };
}

export function excelSerialToISO(n) {
  const ms = Date.UTC(1899, 11, 30) + Math.round(Number(n) * 86400000);
  return new Date(ms).toISOString().slice(0, 10);
}

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, '0');
function iso(y, m, d) {
  y = Number(y); m = Number(m); d = Number(d);
  if (y < 100) y += 2000;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y > 1900 && y < 2200)) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Dates: Excel serials (UTC), Date objects, or text written dd/mm/yyyy (Sri Lankan and BC style). */
export function toISODate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v > 20000 && v < 80000 ? excelSerialToISO(v) : null;
  if (v instanceof Date) return iso(v.getFullYear(), v.getMonth() + 1, v.getDate());
  const s = String(v).trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return iso(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{2,4})\b/))) return iso(m[3], m[2], m[1]);
  if ((m = s.match(/^(\d{1,2})[\s\-/.]*([A-Za-z]{3,4})[A-Za-z]*[\s\-/.,]*(\d{2,4})\b/))) {
    const mo = MON[m[2].toLowerCase()];
    return mo ? iso(m[3], mo, m[1]) : null;
  }
  if ((m = s.match(/^([A-Za-z]{3,4})[A-Za-z]*\s+(\d{1,2}),?\s+(\d{4})/))) {
    const mo = MON[m[1].toLowerCase()];
    return mo ? iso(m[3], mo, m[2]) : null;
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) return excelSerialToISO(Number(s));
  return null;
}

/** Amounts: numbers, or text like "12,000.00", "(1,200.00)", "1,200.00 CR", "-". */
export function toNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s || s === '-' || s === '--') return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) { sign = -1; s = s.slice(1, -1); }
  if (/\bDR\.?$/i.test(s)) { sign = -1; }
  s = s.replace(/\b(LKR|Rs\.?|CR|DR)\.?/gi, '').replace(/[,\s]/g, '');
  if (/-$/.test(s)) { sign = -sign; s = s.slice(0, -1); }
  if (!/^[-+]?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s) * sign;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function toText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return String(v).trim();
}

function toBool(v) {
  if (v === true || v === 1) return true;
  if (v === false || v === 0 || v === null || v === undefined) return false;
  return /^(yes|true|1|y)$/i.test(String(v).trim());
}

function pick(grid, spec, required, conv) {
  const loc = locate(grid, spec, required);
  if (loc.error) return { error: loc.error };
  if (loc.missing.length) {
    const want = loc.missing.map((f) => `"${spec[f][0]}"`).join(', ');
    return { error: `This file has no ${want} column. Show it in Business Central (Personalize) and export again.`, loc };
  }
  const rows = [];
  for (let i = loc.row + 1; i < grid.length; i++) {
    const r = grid[i];
    if (!r || r.every((c) => c === null || c === '')) continue;
    const get = (f) => (loc.cols[f] === undefined ? null : r[loc.cols[f]]);
    const row = conv(get);
    if (row) rows.push(row);
  }
  return { rows, loc };
}

export async function readCustomers(file) {
  const grid = await readGrid(file);
  return pick(grid, CAPTIONS.customers, ['customer_no', 'name'], (g) => {
    const no = toText(g('customer_no'));
    if (!no) return null;
    return {
      customer_no: no, name: toText(g('name')), phone: toText(g('phone')) || null, contact: toText(g('contact')) || null,
      address: toText(g('address')) || null, city: toText(g('city')) || null,
      posting_group: toText(g('posting_group')) || null, gen_bus_posting_group: toText(g('gen_bus_posting_group')) || null,
      currency_code: toText(g('currency_code')) || null, balance_lcy: toNum(g('balance_lcy')),
    };
  });
}

/** Customer Ledger Entries: open entries for the snapshot, and payments for the posting check. */
export async function readLedger(file) {
  const grid = await readGrid(file);
  const res = pick(grid, CAPTIONS.ledger,
    ['entry_no', 'customer_no', 'document_no', 'remaining_amount', 'business_unit'], (g) => {
      const entry = toNum(g('entry_no'));
      if (!entry) return null;
      const remaining = toNum(g('remaining_amount')) ?? 0;
      return {
        entry_no: entry,
        customer_no: toText(g('customer_no')),
        customer_name: toText(g('customer_name')),
        posting_date: toISODate(g('posting_date')),
        document_type: toText(g('document_type')),
        document_no: toText(g('document_no')),
        external_document_no: toText(g('external_document_no')) || null,
        description: toText(g('description')),
        due_date: toISODate(g('due_date')),
        currency_code: toText(g('currency_code')).toUpperCase(),
        original_amount: toNum(g('original_amount')),
        remaining_amount: remaining,
        remaining_amount_fcy: toNum(g('remaining_amount_fcy')),
        amount: toNum(g('amount')),
        business_unit: toText(g('business_unit')),
        salesperson_code: toText(g('salesperson_code')) || null,
        bal_account_no: toText(g('bal_account_no')) || null,
        open: g('open'),
      };
    });
  if (res.error) return res;
  const hasOpen = res.loc.cols.open !== undefined;
  const open = res.rows.filter((r) => (hasOpen ? toBool(r.open) : true) && Math.abs(r.remaining_amount) > 0.005);
  const payments = res.rows.filter((r) => /^payment$/i.test(r.document_type));
  for (const r of [...open, ...payments]) delete r.open;
  return { open, payments, all: res.rows.length, hasOpen, loc: res.loc };
}

export async function readDetailed(file) {
  const grid = await readGrid(file);
  return pick(grid, CAPTIONS.detailed, ['entry_no', 'document_no', 'amount', 'entry_type'], (g) => {
    const entry = toNum(g('entry_no'));
    if (!entry) return null;
    return {
      entry_no: entry, entry_type: toText(g('entry_type')), posting_date: toISODate(g('posting_date')),
      document_type: toText(g('document_type')), document_no: toText(g('document_no')),
      customer_no: toText(g('customer_no')) || null, amount: toNum(g('amount')),
      cust_ledger_entry_no: toNum(g('cust_ledger_entry_no')),
    };
  });
}

export async function readBankLedger(file) {
  const grid = await readGrid(file);
  return pick(grid, CAPTIONS.bankLedger, ['entry_no', 'document_no', 'amount', 'posting_date'], (g) => {
    const entry = toNum(g('entry_no'));
    if (!entry) return null;
    return {
      entry_no: entry, bank_account_no: toText(g('bank_account_no')) || null, posting_date: toISODate(g('posting_date')),
      document_type: toText(g('document_type')), document_no: toText(g('document_no')),
      description: toText(g('description')), amount: toNum(g('amount')), ext_doc_no: toText(g('ext_doc_no')) || null,
      reversed: g('reversed') === null ? null : toBool(g('reversed')),
    };
  });
}

export async function readBankAccounts(file) {
  const grid = await readGrid(file);
  return pick(grid, CAPTIONS.bankAccounts, ['bc_code', 'bc_name'], (g) => {
    const code = toText(g('bc_code'));
    if (!code) return null;
    return { bc_code: code, bc_name: toText(g('bc_name')), account_no: toText(g('account_no')) || null };
  });
}

/** The header row of the Cash Receipt Journal opened in Excel from BC. */
export async function readJournalHeader(file) {
  const grid = await readGrid(file);
  const row = grid.find((r) => r && r.filter((c) => c !== null && String(c).trim() !== '').length >= 5);
  if (!row) return { error: 'No header row found in that file.' };
  const cols = row.map((c) => toText(c));
  while (cols.length && !cols[cols.length - 1]) cols.pop();
  return { columns: cols };
}

export function chunk(arr, size = 1000) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

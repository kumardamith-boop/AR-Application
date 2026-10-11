import * as XLSX from 'xlsx';
import { norm, toISODate, toNum, toText } from './excel.js';

/* One reader for every bank. Files that are HTML or text saved as ".xls"
   (common for Sri Lankan banks) are read as text so values stay as printed. */

export const FIELDS = [
  { key: 'txn_date', label: 'Date', required: true },
  { key: 'value_date', label: 'Value date' },
  { key: 'narration', label: 'Description', required: true },
  { key: 'reference', label: 'Reference' },
  { key: 'cheque_no', label: 'Cheque no.' },
  { key: 'credit', label: 'Credit (money in)' },
  { key: 'debit', label: 'Debit (money out)' },
  { key: 'amount', label: 'Amount (one column, + in / − out)' },
  { key: 'drcr', label: 'Dr/Cr marker' },
  { key: 'balance', label: 'Balance' },
];

const SYN = {
  txn_date: ['date', 'txndate', 'transactiondate', 'trandate', 'postingdate', 'posteddate', 'bookingdate', 'trndate', 'transdate', 'datetime'],
  value_date: ['valuedate', 'valuedt', 'effectivedate'],
  narration: ['description', 'particulars', 'narration', 'narrative', 'details', 'remarks', 'transactiondetails',
    'transactiondescription', 'transactionparticulars', 'memo'],
  reference: ['reference', 'ref', 'refno', 'referenceno', 'referencenumber', 'tranid', 'transactionid', 'transactionreference', 'trnref', 'instrumentid'],
  cheque_no: ['chequeno', 'chqno', 'cheque', 'chequenumber', 'instrumentno', 'instrumentnumber', 'checkno', 'chqnumber'],
  debit: ['debit', 'debits', 'withdrawal', 'withdrawals', 'debitamount', 'dr', 'paidout', 'withdrawalamount', 'withdrawalsdr', 'debitlkr'],
  credit: ['credit', 'credits', 'deposit', 'deposits', 'creditamount', 'cr', 'paidin', 'depositamount', 'depositscr', 'creditlkr'],
  amount: ['amount', 'transactionamount', 'amountlkr', 'txnamount'],
  drcr: ['drcr', 'crdr', 'debitcredit', 'dc', 'type', 'trantype', 'transactiontype'],
  balance: ['balance', 'runningbalance', 'closingbalance', 'availablebalance', 'ledgerbalance', 'balancelkr', 'bookbalance'],
};

function decode(buf) {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if (!utf8.includes('�')) return utf8;
  try { return new TextDecoder('windows-1252').decode(buf); } catch { return utf8; }
}

function parseDelimited(text) {
  const lines = text.split(/\r?\n/).slice(0, 20);
  const counts = ['\t', ',', ';', '|'].map((d) => [d, lines.reduce((s, l) => s + l.split(d).length - 1, 0)]);
  counts.sort((a, b) => b[1] - a[1]);
  const delim = counts[0][1] > 0 ? counts[0][0] : ',';
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') inQ = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim()));
}

function parseHtml(text) {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const tables = [...doc.querySelectorAll('table')];
  // the table with the most rows is the statement
  tables.sort((a, b) => b.rows.length - a.rows.length);
  const out = [];
  for (const t of tables.slice(0, 1)) {
    for (const tr of t.rows) {
      out.push([...tr.cells].map((td) => td.textContent.replace(/\s+/g, ' ').trim()));
    }
  }
  return out;
}

/** -> { grid: cell[][], kind: 'excel' | 'html' | 'text' } */
export async function readStatementGrid(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
  const isOle = buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
  if (isZip || isOle) {
    const wb = XLSX.read(buf, { type: 'array', cellDates: false });
    // the sheet with the most rows
    let best = null;
    for (const n of wb.SheetNames) {
      const g = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false });
      if (!best || g.length > best.length) best = g;
    }
    return { grid: best || [], kind: 'excel' };
  }
  const text = decode(buf);
  if (/<table[\s>]/i.test(text)) return { grid: parseHtml(text), kind: 'html' };
  return { grid: parseDelimited(text), kind: 'text' };
}

/** Score rows to find the header and guess the column of each field. */
export function detectMapping(grid) {
  let best = { score: 0, row: -1, map: {} };
  for (let i = 0; i < Math.min(grid.length, 40); i++) {
    const cells = (grid[i] || []).map((c) => norm(c));
    const map = {};
    let score = 0;
    for (const [field, syns] of Object.entries(SYN)) {
      const idx = cells.findIndex((c, j) => c && syns.includes(c) && !Object.values(map).includes(j));
      if (idx >= 0) { map[field] = idx; score++; }
    }
    if (map.txn_date === undefined) {
      const idx = cells.findIndex((c, j) => c.includes('date') && !c.includes('value') && !Object.values(map).includes(j));
      if (idx >= 0) { map.txn_date = idx; score++; }
    }
    if (score > best.score) best = { score, row: i, map };
  }
  if (best.map.amount !== undefined && (best.map.credit !== undefined || best.map.debit !== undefined)) delete best.map.amount;
  return { headerRow: best.row, mapping: best.map, score: best.score };
}

const CHQ_PATTERNS = [
  /^\s*(\d{6})\s*\/\s*\d{3,}/,                                   // Sampath: 123456/007083003/ACH/17-09-2026
  /(?:CHQ|CHEQUE|CHECK|CQ|CHQ\.?\s*NO|CHEQUE\s*NO)[^0-9A-Z]{0,6}(\d{6})(?!\d)/i,
  /(?:^|\D)(\d{6})\s*(?:CHQ|CHEQUE|CLG|CLEARING)/i,
];
export function chequeFromText(text) {
  const s = String(text || '');
  for (const re of CHQ_PATTERNS) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return null;
}

/** Turn the grid into statement lines with the confirmed mapping. Oldest first. */
export function extractLines(grid, headerRow, mapping) {
  const get = (r, f) => (mapping[f] === undefined || mapping[f] === null || mapping[f] === '' ? null : r[Number(mapping[f])]);
  const out = [];
  const skipped = [];
  for (let i = headerRow + 1; i < grid.length; i++) {
    const r = grid[i] || [];
    if (r.every((c) => c === null || String(c).trim() === '')) continue;
    const date = toISODate(get(r, 'txn_date'));
    let debit = toNum(get(r, 'debit'));
    let credit = toNum(get(r, 'credit'));
    if (mapping.amount !== undefined && mapping.amount !== null && mapping.amount !== '') {
      let amt = toNum(get(r, 'amount'));
      const raw = String(get(r, 'amount') ?? '');
      const marker = String(get(r, 'drcr') ?? '').trim().toUpperCase();
      if (amt !== null) {
        if (/^(DR|D|DEBIT|W)/.test(marker) || /DR\.?\s*$/i.test(raw)) amt = -Math.abs(amt);
        else if (/^(CR|C|CREDIT)/.test(marker) || /CR\.?\s*$/i.test(raw)) amt = Math.abs(amt);
        if (amt >= 0) { credit = amt; debit = 0; } else { debit = -amt; credit = 0; }
      }
    }
    debit = Math.abs(debit || 0);
    credit = Math.abs(credit || 0);
    if (!date) {
      if (debit || credit) skipped.push({ row: i + 1, why: 'no date' });
      continue;
    }
    if (!debit && !credit) continue;
    const narration = toText(get(r, 'narration'));
    const chqCol = toText(get(r, 'cheque_no')).replace(/\D/g, '');
    out.push({
      txn_date: date,
      value_date: toISODate(get(r, 'value_date')),
      narration,
      reference: toText(get(r, 'reference')) || null,
      cheque_no: chqCol || chequeFromText(narration) || chequeFromText(toText(get(r, 'reference'))),
      debit: Math.round(debit * 100) / 100,
      credit: Math.round(credit * 100) / 100,
      balance: toNum(get(r, 'balance')),
    });
  }
  if (out.length > 1 && out[0].txn_date > out[out.length - 1].txn_date) out.reverse();
  return { lines: out, skipped };
}

export function columnOptions(grid, headerRow) {
  const head = grid[headerRow] || [];
  const width = Math.max(head.length, ...(grid.slice(headerRow + 1, headerRow + 6).map((r) => (r || []).length)));
  const opts = [];
  for (let j = 0; j < width; j++) {
    const sample = grid.slice(headerRow + 1, headerRow + 4).map((r) => toText((r || [])[j])).filter(Boolean)[0] || '';
    opts.push({ value: j, label: `${toText(head[j]) || 'Column ' + (j + 1)}${sample ? ` (e.g. ${sample.slice(0, 24)})` : ''}` });
  }
  return opts;
}

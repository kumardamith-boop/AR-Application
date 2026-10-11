import * as XLSX from 'xlsx';
import { dmy, round2 } from './format.js';
import { norm } from './excel.js';

/* Builds Cash Receipt Journal rows in exactly the column order of the
   company's BC template (settings.journal_columns). Unknown columns stay blank. */

const AMOUNT_COLS = new Set(['amount', 'amountlcy', 'creditamount', 'debitamount', 'balance', 'totalbalance']);

function valueFor(col, doc, line, settings) {
  const k = norm(col);
  const applied = !!line.applied;
  switch (k) {
    case 'batchname':
    case 'journalbatchname':
      return settings.journal_batch_name || '';
    case 'postingdate':
      return dmy(doc.posting_date);
    case 'documentdate':
      return dmy(doc.posting_date);
    case 'documenttype':
      return settings.journal_document_type || 'Payment';
    case 'externaldocumentno':
      return line.ext_doc_no || '';
    case 'documentno':
      return doc.doc_no;
    case 'accounttype':
      return 'Customer';
    case 'accountno':
      return line.customer_no;
    case 'accountname':
    case 'name':
      return line.customer_name || '';
    case 'description':
      return line.description || '';
    case 'currencycode':
      return '';
    case 'amount':
    case 'amountlcy':
      return -round2(line.amount);
    case 'creditamount':
      return round2(line.amount);
    case 'debitamount':
      return '';
    case 'balaccounttype':
      return 'Bank Account';
    case 'balaccountno':
      return doc.bc_code || '';
    case 'balaccountname':
      return doc.bc_name || '';
    case 'appliedyesno':
    case 'applied':
      return applied ? 'Yes' : 'No';
    case 'appliestodoctype':
      return applied ? line.applies_doc_type || '' : '';
    case 'appliestodocno':
      return applied ? line.applies_doc_no || '' : '';
    case 'correction':
      return 'No';
    case 'bucode':
    case 'businessunitcode':
    case 'businessunit':
    case 'globaldimension1code':
    case 'shortcutdimension1code':
      return line.business_unit || '';
    case 'comment':
    case 'comments':
      return doc.narration || '';
    case 'paymentreference':
      return line.ext_doc_no || '';
    default: {
      const m = k.match(/^appliedamount([a-z0-9]+)$/);
      if (m && settings.fill_applied_amount_columns) {
        return applied && norm(line.department) === m[1] ? round2(line.amount) : '';
      }
      return '';
    }
  }
}

export function journalRows(docs, settings) {
  const cols = settings.journal_columns || [];
  const rows = [];
  for (const d of docs) for (const l of d.lines || []) rows.push(cols.map((c) => valueFor(c, d, l, settings)));
  return rows;
}

export function downloadJournalXlsx(docs, settings, fileName) {
  const cols = settings.journal_columns || [];
  const rows = journalRows(docs, settings);
  const aoa = [cols, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // keep text cells as text (dates, document and cheque numbers keep their format and leading zeros)
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let R = 1; R <= range.e.r; R++) {
    for (let C = 0; C <= range.e.c; C++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (!cell) continue;
      if (AMOUNT_COLS.has(norm(cols[C])) || /^appliedamount/.test(norm(cols[C]))) {
        if (cell.t === 'n') cell.z = '#,##0.00';
      } else {
        cell.t = 's';
        cell.v = String(cell.v ?? '');
        cell.z = '@';
      }
    }
  }
  ws['!cols'] = cols.map((c) => ({ wch: Math.max(10, Math.min(36, String(c).length + 4)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cash Receipt Journals');
  XLSX.writeFile(wb, fileName);
}

/** Tab-separated rows for pasting straight into the BC journal page. */
export function journalTSV(docs, settings, withHeader = false) {
  const cols = settings.journal_columns || [];
  const fmt = (v) => (typeof v === 'number' ? v.toFixed(2) : String(v ?? '').replace(/[\t\r\n]+/g, ' '));
  const rows = journalRows(docs, settings).map((r) => r.map(fmt).join('\t'));
  if (withHeader) rows.unshift(cols.join('\t'));
  return rows.join('\r\n');
}

export function downloadSheet(name, header, rows) {
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = header.map((h) => ({ wch: Math.max(10, Math.min(40, String(h).length + 6)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, name);
}

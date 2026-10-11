import { useState } from 'react';
import { useApp } from '../lib/ctx.jsx';
import { supabase, q, qAll, rpc } from '../lib/supabase.js';
import { day, lkr, money, round2, when } from '../lib/format.js';
import { chunk, readCustomers, readLedger } from '../lib/excel.js';
import { Btn, Dept, ErrorNote, Loading, Note, useAsync } from '../components/ui.jsx';

async function stageAll(token, kind, rows, startSeq = 0) {
  const parts = chunk(rows, 1000);
  for (let i = 0; i < parts.length; i++) await rpc('cc_stage_rows', { p_token: token, p_seq: startSeq + i, p_kind: kind, p_rows: parts[i] });
  return startSeq + parts.length;
}

function CustomersUpload({ known, onDone }) {
  const { toast } = useApp();
  const [res, setRes] = useState(null);
  const [file, setFile] = useState(null);
  const [err, setErr] = useState(null);
  async function pick(e) {
    setErr(null); setRes(null);
    const f = e.target.files?.[0];
    if (!f) return;
    const r = await readCustomers(f).catch((x) => ({ error: x.message }));
    if (r.error) { setErr(r.error); return; }
    const inFile = new Set(r.rows.map((x) => x.customer_no));
    setFile(f);
    setRes({ rows: r.rows, added: r.rows.filter((x) => !known.has(x.customer_no)).length, missing: [...known].filter((k) => !inFile.has(k)).length });
  }
  async function save() {
    setErr(null);
    try {
      const token = crypto.randomUUID();
      await stageAll(token, 'customers', res.rows);
      const r = await rpc('cc_import_customers', { p_file: file.name, p_token: token });
      toast(`${r.rows} customers loaded`);
      setRes(null); onDone();
    } catch (x) { setErr(x); }
  }
  return (
    <div className="panel stack">
      <h2>Customers</h2>
      <p className="muted">In BC, open Customers, choose Open in Excel, and upload the file. Customers missing from a new file are kept but marked as not in the latest list.</p>
      <input className="input" type="file" accept=".xlsx,.xls,.csv" onChange={pick} />
      <ErrorNote error={err} />
      {res ? (
        <>
          <Note>{res.rows.length} customers read: {res.added} new, {res.rows.length - res.added} already known.{res.missing ? ` ${res.missing} known customers are not in this file.` : ''}</Note>
          <div><Btn className="primary" onClick={save}>Save {res.rows.length} customers</Btn></div>
        </>
      ) : null}
    </div>
  );
}

function LedgerUpload({ known, onDone }) {
  const { depts, toast } = useApp();
  const [res, setRes] = useState(null);
  const [file, setFile] = useState(null);
  const [err, setErr] = useState(null);
  const deptOf = (bu) => depts.find((d) => d.active && d.bc_value.trim().toUpperCase() === String(bu || '').trim().toUpperCase())?.code || null;

  async function pick(e) {
    setErr(null); setRes(null);
    const f = e.target.files?.[0];
    if (!f) return;
    const r = await readLedger(f).catch((x) => ({ error: x.message }));
    if (r.error) { setErr(r.error); return; }
    const by = {};
    const unknown = [];
    for (const row of r.open) {
      const dpt = deptOf(row.business_unit);
      const k = dpt || '?';
      by[k] = by[k] || { count: 0, total: 0, invoices: 0 };
      by[k].count++; by[k].total = round2(by[k].total + row.remaining_amount);
      if (row.remaining_amount > 0) by[k].invoices++;
      if (!dpt) unknown.push(row);
    }
    setFile(f);
    setRes({
      ...r, by, unknown,
      notInList: [...new Set(r.open.map((x) => x.customer_no))].filter((c) => !known.has(c)),
      foreign: r.open.filter((x) => x.currency_code && x.currency_code !== 'LKR').length,
    });
  }
  async function save() {
    setErr(null);
    try {
      const token = crypto.randomUUID();
      const n = await stageAll(token, 'ledger', res.open);
      await stageAll(token, 'ledger_payments', res.payments, n);
      const r = await rpc('cc_import_ledger', { p_file: file.name, p_token: token });
      toast(`${r.rows} open entries loaded`);
      setRes(null); onDone();
    } catch (x) { setErr(x); }
  }
  return (
    <div className="panel stack">
      <h2>Customer Ledger Entries</h2>
      <p className="muted">In BC, open Customer Ledger Entries with the <b>Bu Code</b> column showing, choose Open in Excel, and upload the file.
        Export all entries, not only open ones: the app keeps the open invoices for requests and uses the payments to see what BC has posted.
        Uploading replaces the invoice list; requests already raised keep their own copy.</p>
      <input className="input" type="file" accept=".xlsx,.xls,.csv" onChange={pick} />
      <ErrorNote error={err} />
      {res ? (
        <div className="stack">
          <Note>{res.all} rows read: <b>{res.open.length} open entries</b> and {res.payments.length} payments.{res.hasOpen ? '' : ' There is no Open column, so every entry with a remaining amount counts as open.'}</Note>
          <div className="table-wrap">
            <table className="t compact">
              <thead><tr><th>Department</th><th className="num">Open entries</th><th className="num">Invoices</th><th className="num">Remaining (LKR)</th></tr></thead>
              <tbody>{Object.entries(res.by).map(([k, v]) => (
                <tr key={k}><td>{k === '?' ? <b style={{ color: 'var(--red)' }}>Unknown Bu Code</b> : <Dept code={k} />}</td><td className="num">{v.count}</td><td className="num">{v.invoices}</td><td className="num">{money(v.total)}</td></tr>
              ))}</tbody>
            </table>
          </div>
          {res.unknown.length ? (
            <Note kind="warn">
              <b>{res.unknown.length} open entries have a blank or unknown Bu Code</b> and can't be picked on a request. Fix them in BC:
              <div className="small" style={{ marginTop: 6, maxHeight: 160, overflow: 'auto' }}>
                {res.unknown.slice(0, 60).map((u) => <div key={u.entry_no}>{u.document_no} ({u.customer_no}) {u.business_unit ? `Bu Code "${u.business_unit}"` : 'no Bu Code'}, {money(u.remaining_amount)}</div>)}
              </div>
            </Note>
          ) : null}
          {res.notInList.length ? <Note kind="warn">{res.notInList.length} customer(s) with open entries are not in the customer list: {res.notInList.slice(0, 12).join(', ')}. Upload the latest Customers file too.</Note> : null}
          {res.foreign ? <Note kind="plain">{res.foreign} open entries are in a foreign currency. They are shown on requests but can't be picked.</Note> : null}
          <div><Btn className="primary" onClick={save}>Save {res.open.length} open entries</Btn></div>
        </div>
      ) : null}
    </div>
  );
}

export default function Customers() {
  const { tick, depts } = useApp();
  const { data, loading, error, reload } = useAsync(async () => {
    const [imports, ledger, customers] = await Promise.all([
      q(supabase.from('imports').select('*').in('kind', ['customers', 'ledger']).order('done_at', { ascending: false }).limit(10)),
      qAll(() => supabase.from('customer_ledger').select('entry_no, department, business_unit, remaining_amount, document_no, customer_no, customer_name, currency_code').order('entry_no')),
      qAll(() => supabase.from('customers').select('customer_no, in_latest_list').order('customer_no')),
    ]);
    return { imports, ledger, customers };
  }, [tick]);
  const { nameOf } = useApp();
  if (loading && !data) return <Loading />;
  const known = new Set((data?.customers || []).map((c) => c.customer_no));
  const by = {};
  for (const l of data?.ledger || []) {
    const k = l.department || '?';
    by[k] = by[k] || { n: 0, t: 0, inv: 0 };
    by[k].n++;
    if (Number(l.remaining_amount) > 0) { by[k].inv++; by[k].t = round2(by[k].t + Number(l.remaining_amount)); }
  }
  const unknown = (data?.ledger || []).filter((l) => !l.department);
  const lastLedger = data?.imports?.find((i) => i.kind === 'ledger');
  const lastCust = data?.imports?.find((i) => i.kind === 'customers');
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}><div><h1>Customer data</h1><p>The customer list and open invoices that sales pick from, uploaded from Business Central.</p></div></div>
      <ErrorNote error={error} />
      <div className="stats">
        <div className="stat"><div className="k">Customers</div><div className="v">{known.size}</div><div className="s">{lastCust ? `Uploaded ${when(lastCust.done_at)} by ${nameOf(lastCust.done_by)}` : 'Not uploaded yet'}</div></div>
        {depts.map((d) => (
          <div className="stat" key={d.code}><div className="k"><Dept code={d.code} /> open invoices</div><div className="v">{by[d.code]?.inv || 0}</div><div className="s">{lkr(by[d.code]?.t || 0)} to collect, {by[d.code]?.n || 0} open entries in all</div></div>
        ))}
        <div className="stat"><div className="k">Unknown Bu Code</div><div className="v" style={{ color: unknown.length ? 'var(--red)' : undefined }}>{unknown.length}</div><div className="s">{lastLedger ? `Ledger uploaded ${when(lastLedger.done_at)} by ${nameOf(lastLedger.done_by)}` : 'Ledger not uploaded yet'}</div></div>
      </div>
      <div className="grid2" style={{ alignItems: 'start' }}>
        <CustomersUpload known={known} onDone={reload} />
        <LedgerUpload known={known} onDone={reload} />
      </div>
      {unknown.length ? (
        <>
          <div className="section-title"><h2>Open entries without a known Bu Code</h2><span className="muted small">Fix these in BC, then upload the ledger again</span></div>
          <div className="table-wrap">
            <table className="t compact">
              <thead><tr><th>Document</th><th>Customer</th><th>Bu Code in BC</th><th className="num">Remaining</th></tr></thead>
              <tbody>{unknown.map((u) => (
                <tr key={u.entry_no}><td>{u.document_no}</td><td>{u.customer_name}<div className="small muted">{u.customer_no}</div></td><td>{u.business_unit || <i className="muted">blank</i>}</td><td className="num">{money(u.remaining_amount)}{u.currency_code ? ` (${u.currency_code})` : ''}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </>
      ) : null}
      <div className="section-title"><h2>Upload history</h2></div>
      <div className="table-wrap">
        <table className="t compact">
          <thead><tr><th>When</th><th>What</th><th>File</th><th className="num">Rows</th><th>By</th></tr></thead>
          <tbody>{(data?.imports || []).map((i) => (
            <tr key={i.id}><td className="nowrap">{when(i.done_at)}</td><td>{i.kind === 'ledger' ? 'Customer ledger' : 'Customers'}</td><td className="small">{i.file_name}</td><td className="num">{i.row_count}</td><td>{nameOf(i.done_by)}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <p className="small muted">Dates in BC exports are read as dd/mm/yyyy. Last ledger upload: {lastLedger ? day(lastLedger.done_at) : 'never'}.</p>
    </div>
  );
}

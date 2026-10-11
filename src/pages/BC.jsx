import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/ctx.jsx';
import { rpc } from '../lib/supabase.js';
import { day, lkr, money, round2, todayLK, when } from '../lib/format.js';
import { chunk, readBankLedger, readDetailed } from '../lib/excel.js';
import { downloadJournalXlsx, journalTSV } from '../lib/journal.js';
import { Btn, Dept, Empty, ErrorNote, Field, Loading, Note, Seg, useAsync } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}

function IssueFix({ issue, onDone }) {
  const [err, setErr] = useState(null);
  if (issue.kind === 'split' || issue.kind === 'customer') {
    return <div className="small" style={{ color: 'var(--red)' }}>{issue.text} {issue.collection_id ? <Link to={`/c/${issue.collection_id}`}>Open</Link> : null}</div>;
  }
  if (issue.kind === 'unapplied') {
    return (
      <div className="small" style={{ color: 'var(--red)' }}>{issue.text}{' '}
        <button className="btn quiet small" onClick={() => rpc('cc_set_allow_unapplied', { p_id: issue.collection_id, p_allow: true }).then(onDone).catch(setErr)}>Export as unapplied</button>
        <ErrorNote error={err} />
      </div>
    );
  }
  if (issue.kind === 'bank') return <div className="small" style={{ color: 'var(--red)' }}>{issue.text} <Link to="/bank">Bank page</Link></div>;
  if (issue.kind === 'which_cheque') {
    return (
      <div className="small">
        <div style={{ color: 'var(--red)' }}>{issue.text}</div>
        {(issue.cheques || []).map((x) => (
          <div key={x.cheque_id} className="row" style={{ marginTop: 4 }}>
            <span>{x.cheque_no} ({x.cc_no}, {x.customer_name}) {money(x.amount)}</span>
            <Btn className="small" onClick={() => rpc('cc_set_cheque_line', { p_cheque: x.cheque_id, p_line: issue.line_id }).then(onDone).catch(setErr)}>It's on this line</Btn>
          </div>
        ))}
        <ErrorNote error={err} />
      </div>
    );
  }
  return <div className="small" style={{ color: 'var(--red)' }}>{issue.text}</div>;
}

export default function ExportBC() {
  const { role, settings, toast, tick } = useApp();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [show, setShow] = useState('pending');
  const [sel, setSel] = useState(new Set());
  const [open, setOpen] = useState(new Set());
  const [firstNo, setFirstNo] = useState('');
  const [err, setErr] = useState(null);
  const [last, setLast] = useState(null);
  const { data, loading, error, reload } = useAsync(async () => {
    const [rows, hint] = await Promise.all([
      rpc('cc_export_preview', { p_from: from || null, p_to: to || null, p_account: null, p_show: show }),
      rpc('cc_series_hint'),
    ]);
    return { rows, hint };
  }, [from, to, show, tick]);
  const rows = data?.rows || [];
  const hint = data?.hint;
  const selected = rows.filter((r) => sel.has(r.line.id));
  const needsNumber = selected.some((r) => !r.doc);
  const byDept = useMemo(() => {
    const m = {};
    for (const r of selected) for (const l of r.journal.lines) m[l.department] = round2((m[l.department] || 0) + Number(l.amount));
    return m;
  }, [selected]);
  const finance = role === 'finance';
  const nextGuess = hint?.next_no ? `${hint.prefix}${String(hint.next_no).padStart(hint.width, '0')}` : '';

  async function record() {
    setErr(null);
    const res = await rpc('cc_export_record', { p_line_ids: selected.map((r) => r.line.id), p_first_no: needsNumber ? (firstNo || nextGuess || null) : null });
    setLast(res.docs);
    setSel(new Set()); setFirstNo('');
    reload();
    return res.docs;
  }
  async function download() {
    try {
      const docs = await record();
      downloadJournalXlsx(docs, settings, `Cash Receipt Journal ${todayLK()} ${docs[0]?.doc_no || ''}.xlsx`.replace(/\//g, '-'));
      toast(`${docs.length} document${docs.length === 1 ? '' : 's'} exported`);
    } catch (e) { setErr(e); }
  }
  async function copy() {
    try {
      const docs = await record();
      const ok = await copyText(journalTSV(docs, settings));
      toast(ok ? 'Journal lines copied. Paste them into the BC journal.' : 'Could not copy. Use the Excel download.');
    } catch (e) { setErr(e); }
  }

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div><h1>Export to BC</h1><p>One receipt journal document per bank statement line, with the department's Bu Code on every line.</p></div>
      </div>
      {!settings?.journal_batch_name ? <Note kind="warn">The journal Batch Name is blank. Set it in <Link to="/settings">Settings</Link> so the file lands in the right batch.</Note> : null}
      <div className="row">
        <Seg value={show} onChange={setShow} options={[{ value: 'pending', label: 'To export or not posted yet' }, { value: 'all', label: 'All' }]} />
        <Field label="From" className="row" ><input className="input inline" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To" className="row"><input className="input inline" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <ErrorNote error={error} />
      {loading && !data ? <Loading /> : !rows.length ? (
        <div className="panel"><Empty title="Nothing to export">Bank lines appear here once a deposit slip is matched to them.</Empty></div>
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th style={{ width: 36 }} /><th>Bank line</th><th>Account</th><th className="num">Amount</th><th>Document</th><th>Lines</th><th /></tr></thead>
            <tbody>{rows.map((r) => {
              const issues = r.journal.issues || [];
              const blocked = issues.length > 0 || r.doc?.post_status === 'posted';
              const depts = [...new Set(r.journal.lines.map((l) => l.department))];
              return (
                <Fragment key={r.line.id}>
                  <tr className={sel.has(r.line.id) ? 'sel' : issues.length ? 'hl' : ''}>
                    <td>{finance ? <input type="checkbox" style={{ width: 20, height: 20, accentColor: 'var(--purple)' }} disabled={blocked} checked={sel.has(r.line.id)}
                      onChange={() => setSel((s) => { const n = new Set(s); if (n.has(r.line.id)) n.delete(r.line.id); else n.add(r.line.id); return n; })} aria-label="Select line" /> : null}</td>
                    <td><b className="nowrap">{day(r.line.txn_date)}</b><div className="small muted">{r.line.narration}</div>
                      {issues.map((i, k) => <IssueFix key={k} issue={{ ...i, line_id: r.line.id }} onDone={reload} />)}</td>
                    <td className="small">{r.line.account_name}<div className="muted">{r.line.bc_code}, slip {r.line.dep_no}</div></td>
                    <td className="num">{money(r.line.credit)}</td>
                    <td className="nowrap">{r.doc ? <><b>{r.doc.doc_no}</b><div className="small muted">{r.doc.post_status === 'exported' ? `Exported ${r.doc.export_count}×, not posted yet` : r.doc.post_status === 'posted' ? 'Posted' : 'Posted with differences'}</div></> : <span className="muted">New</span>}</td>
                    <td><div className="row" style={{ gap: 4 }}>{depts.map((x) => <Dept key={x} code={x} />)}</div><span className="small muted">{r.journal.lines.length} line{r.journal.lines.length === 1 ? '' : 's'}</span></td>
                    <td><button className="btn quiet small" onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(r.line.id)) n.delete(r.line.id); else n.add(r.line.id); return n; })}>{open.has(r.line.id) ? 'Hide' : 'Show'} lines</button></td>
                  </tr>
                  {open.has(r.line.id) ? (
                    <tr><td /><td colSpan={6}>
                      <table className="t compact">
                        <thead><tr><th>Customer</th><th>Applies to</th><th>Cheque</th><th>Description</th><th>Bu Code</th><th className="num">Amount</th></tr></thead>
                        <tbody>{r.journal.lines.map((l, k) => (
                          <tr key={k}><td>{l.customer_no}<div className="small muted">{l.customer_name}</div></td>
                            <td>{l.applied ? `${l.applies_doc_type || ''} ${l.applies_doc_no}` : <i>Unapplied</i>}</td><td>{l.cheque_no}</td><td className="small">{l.description}</td>
                            <td><b>{l.business_unit}</b></td><td className="num">{money(l.amount)}</td></tr>
                        ))}</tbody>
                        <tfoot><tr><td colSpan={5}>Journal total</td><td className="num">{money(r.journal.total)}</td></tr></tfoot>
                      </table>
                    </td></tr>
                  ) : null}
                </Fragment>
              );
            })}</tbody>
          </table>
        </div>
      )}

      {finance && selected.length ? (
        <div className="action">
          <h2>Export {selected.length} bank line{selected.length === 1 ? '' : 's'}</h2>
          <p className="muted">{Object.entries(byDept).map(([k, v]) => `${k} ${lkr(v)}`).join(', ')}</p>
          {needsNumber ? (
            <div className="grid2" style={{ marginTop: 10 }}>
              <Field label="First new document number" hint={`Look up the next free number in BC. Last seen in BC uploads: ${hint?.last_in_bc || 'none'}; last used here: ${hint?.last_in_app || 'none'}.`}>
                <input className="input" value={firstNo} placeholder={nextGuess || `${hint?.prefix || ''}${'0'.repeat(Math.max((hint?.width || 5) - 1, 0))}1`} onChange={(e) => setFirstNo(e.target.value.trim())} />
              </Field>
            </div>
          ) : <p className="small muted">These lines already have document numbers; exporting again keeps them.</p>}
          <ErrorNote error={err} />
          <div className="row" style={{ marginTop: 12 }}>
            <Btn className="primary" onClick={download}><Icon name="download" size={18} /> Record and download Excel</Btn>
            <Btn onClick={copy}><Icon name="copy" size={18} /> Record and copy journal lines</Btn>
          </div>
        </div>
      ) : null}

      {last ? (
        <Note kind="ok">
          Exported {last.map((d) => d.doc_no).join(', ')}.{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); downloadJournalXlsx(last, settings, `Cash Receipt Journal ${todayLK()}.xlsx`); }}>Download again</a>{' '}
          or <a href="#" onClick={async (e) => { e.preventDefault(); await copyText(journalTSV(last, settings)); toast('Copied'); }}>copy again</a>.
          After posting in BC, upload the BC entries on the <Link to="/bc-check">BC check</Link> page.
        </Note>
      ) : null}
    </div>
  );
}

function BCUpload({ kind, onDone }) {
  const { toast } = useApp();
  const [rows, setRows] = useState(null);
  const [file, setFile] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const bank = kind === 'bank';

  async function pick(e) {
    setErr(null); setMsg(null);
    const f = e.target.files?.[0];
    if (!f) return;
    const r = await (bank ? readBankLedger(f) : readDetailed(f)).catch((x) => ({ error: x.message }));
    if (r.error) { setErr(r.error); setRows(null); return; }
    setFile(f); setRows(r.rows);
    if (!bank && r.loc.cols.cust_ledger_entry_no === undefined) setMsg('This file has no "Cust. Ledger Entry No." column, so the check can compare totals but not each invoice. Add the column in BC (Personalize) next time.');
    if (bank && r.loc.cols.bank_account_no === undefined) setMsg('This file has no "Bank Account No." column; the check then compares amounts and dates only.');
  }
  async function save() {
    setErr(null);
    try {
      const token = crypto.randomUUID();
      const parts = chunk(rows, 1500);
      for (let i = 0; i < parts.length; i++) await rpc('cc_stage_rows', { p_token: token, p_seq: i, p_kind: bank ? 'bc_bank' : 'bc_detailed', p_rows: parts[i] });
      const r = await rpc(bank ? 'cc_import_bc_bank' : 'cc_import_bc_detailed', { p_file: file.name, p_token: token });
      toast(`${r.new} new entr${r.new === 1 ? 'y' : 'ies'}, ${r.skipped} already loaded`);
      setRows(null); setFile(null);
      onDone();
    } catch (x) { setErr(x); }
  }
  return (
    <div className="panel stack">
      <h3>{bank ? 'Bank Account Ledger Entries' : 'Detailed Cust. Ledg. Entries'}</h3>
      <p className="small muted">In BC, open {bank ? 'the bank account\'s Bank Account Ledger Entries' : 'Detailed Cust. Ledg. Entries'}, choose Open in Excel and upload the file. Entries already loaded are skipped.</p>
      <input className="input" type="file" accept=".xlsx,.xls,.csv" onChange={pick} />
      {msg ? <Note kind="warn">{msg}</Note> : null}
      <ErrorNote error={err} />
      {rows ? <div className="row"><span>{rows.length} entries read.</span><Btn className="primary" onClick={save}>Upload {rows.length} entries</Btn></div> : null}
    </div>
  );
}

const POST_TXT = { exported: 'Not posted yet', posted: 'Posted', posted_diff: 'Posted with differences' };
const POST_TONE = { exported: 'amber', posted: 'green', posted_diff: 'red' };

export function BCCheck() {
  const { role, tick, toast } = useApp();
  const [filter, setFilter] = useState('open');
  const { data, loading, error, reload } = useAsync(() => rpc('cc_bc_check'), [tick]);
  if (loading && !data) return <Loading />;
  const docs = (data?.docs || []).filter((d) => (filter === 'open' ? d.post_status !== 'posted' : filter === 'all' ? true : d.post_status === filter));
  const counts = (data?.docs || []).reduce((m, d) => { m[d.post_status] = (m[d.post_status] || 0) + 1; return m; }, {});
  const r = data?.ranges || {};
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div><h1>BC check</h1><p>Did every exported receipt post in Business Central, to the right bank account, customer and invoices?</p></div>
        {role === 'finance' ? <Btn onClick={() => rpc('cc_bc_refresh').then(() => { toast('Checked again'); reload(); })}><Icon name="refresh" size={18} /> Check again</Btn> : null}
      </div>
      <ErrorNote error={error} />
      <div className="stats">
        <div className="stat"><div className="k">Not posted yet</div><div className="v">{counts.exported || 0}</div></div>
        <div className="stat"><div className="k">Posted with differences</div><div className="v" style={{ color: counts.posted_diff ? 'var(--red)' : undefined }}>{counts.posted_diff || 0}</div></div>
        <div className="stat"><div className="k">Posted</div><div className="v">{counts.posted || 0}</div></div>
        <div className="stat"><div className="k">BC entries loaded</div><div className="s">Bank: {r.bank_from ? `${day(r.bank_from)} to ${day(r.bank_to)}` : 'none'}</div><div className="s">Customer: {r.cust_from ? `${day(r.cust_from)} to ${day(r.cust_to)}` : 'none'}</div></div>
      </div>
      {role === 'finance' ? <div className="grid2"><BCUpload kind="bank" onDone={reload} /><BCUpload kind="detailed" onDone={reload} /></div> : null}
      <Seg value={filter} onChange={setFilter} options={[{ value: 'open', label: 'Needs attention' }, { value: 'posted', label: 'Posted' }, { value: 'all', label: 'All' }]} />
      <div className="table-wrap">
        {!docs.length ? <Empty title={filter === 'open' ? 'Everything exported is posted' : 'Nothing here'}>Export receipts on the Export to BC page, post them in BC, then upload the BC entries above.</Empty> : (
          <table className="t">
            <thead><tr><th>Document</th><th>Posting date</th><th>Account</th><th>Customers</th><th className="num">Total</th><th>Status</th></tr></thead>
            <tbody>{docs.map((d) => (
              <tr key={d.id}>
                <td><b>{d.doc_no}</b><div className="row" style={{ gap: 4, marginTop: 2 }}>{(d.departments || []).map((x) => <Dept key={x} code={x} />)}</div></td>
                <td className="nowrap">{day(d.posting_date)}</td>
                <td className="small">{d.account_name}<div className="muted">{d.bc_code}</div></td>
                <td className="small">{d.customers}</td>
                <td className="num">{money(d.total)}</td>
                <td><span className={`stamp ${POST_TONE[d.post_status]}`}>{POST_TXT[d.post_status]}</span>
                  {(d.diffs || []).map((x, i) => <div key={i} className="small" style={{ color: 'var(--red)', marginTop: 4 }}>{x}</div>)}
                  {d.post_status === 'posted' && d.bank_check === 'not uploaded' ? <div className="small muted">Bank side not checked (no bank entries uploaded)</div> : null}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      <div className="section-title"><h2>Returned cheques</h2></div>
      <div className="table-wrap">
        {!data?.returned?.length ? <Empty title="No returned cheques" /> : (
          <table className="t compact">
            <thead><tr><th>Cheque</th><th>Collection</th><th>Returned</th><th>Receipt in BC</th><th>Reversal</th></tr></thead>
            <tbody>{data.returned.map((x) => (
              <tr key={x.cheque_id}>
                <td>{x.cheque_no}<div className="small muted">{lkr(x.amount)}</div></td>
                <td><Link to={`/c/${x.collection_id}`}>{x.cc_no}</Link> <Dept code={x.department} /><div className="small muted">{x.customer_name}</div></td>
                <td className="small">{when(x.returned_at)}<div className="muted">{x.reason}</div></td>
                <td>{x.doc_no || <span className="muted">Not exported</span>}</td>
                <td>{x.reversal === 'posted' ? <span className="stamp green">Reversal posted</span> : x.reversal === 'not exported' ? <span className="muted small">Nothing to reverse</span> : <span className="stamp amber">Not posted yet</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      <div className="section-title"><h2>Recent uploads</h2></div>
      <div className="table-wrap">
        <table className="t compact">
          <thead><tr><th>When</th><th>What</th><th>File</th><th className="num">Rows</th><th>Result</th></tr></thead>
          <tbody>{(data?.uploads || []).map((u, i) => (
            <tr key={i}><td className="nowrap">{when(u.done_at)}<div className="small muted">{u.done_by}</div></td>
              <td>{{ bc_bank: 'Bank ledger entries', bc_detailed: 'Detailed cust. entries', ledger: 'Customer ledger' }[u.kind]}</td>
              <td className="small">{u.file_name}</td><td className="num">{u.row_count}</td>
              <td className="small">{u.summary?.new !== undefined ? `${u.summary.new} new` : u.summary?.receipts_seen !== undefined ? `${u.summary.payments_added} payments, ${u.summary.receipts_seen} receipts seen` : ''}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

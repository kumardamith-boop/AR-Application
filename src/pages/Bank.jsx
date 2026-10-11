import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../lib/ctx.jsx';
import { supabase, q, qAll, rpc } from '../lib/supabase.js';
import { TAGS, day, lkr, money, when } from '../lib/format.js';
import { readBankAccounts } from '../lib/excel.js';
import { FIELDS, columnOptions, detectMapping, extractLines, readStatementGrid } from '../lib/statement.js';
import { Btn, Empty, ErrorNote, Field, Loading, Modal, Note, useAsync } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

function AccountModal({ acc, onClose, onDone }) {
  const [v, setV] = useState({ name: acc?.name || '', bank: acc?.bank || '', account_no: acc?.account_no || '', bc_code: acc?.bc_code || '',
    bc_name: acc?.bc_name || '', active: acc ? acc.active : true });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  async function save() {
    setErr(null);
    try { await rpc('cc_save_bank_account', { p: { ...v, id: acc?.id || null } }); onDone(); onClose(); } catch (e) { setErr(e); }
  }
  return (
    <Modal title={acc ? `Edit ${acc.name}` : 'Add a bank account'} onClose={onClose}
      footer={<><Btn onClick={onClose}>Close</Btn><Btn className="primary" onClick={save}>Save account</Btn></>}>
      <div className="stack">
        <Field label="Name in this app"><input className="input" value={v.name} onChange={set('name')} placeholder="Sampath current account" /></Field>
        <div className="grid2">
          <Field label="Bank"><input className="input" value={v.bank} onChange={set('bank')} /></Field>
          <Field label="Account number"><input className="input" value={v.account_no} onChange={set('account_no')} /></Field>
          <Field label="BC Bank Account No." hint="Exactly as in Business Central, e.g. SAMPATH-C/A-7548"><input className="input" value={v.bc_code} onChange={set('bc_code')} /></Field>
          <Field label="BC name"><input className="input" value={v.bc_name} onChange={set('bc_name')} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={v.active} onChange={set('active')} /> Used for cheque deposits</label>
        <ErrorNote error={err} />
      </div>
    </Modal>
  );
}

function ImportAccountsModal({ existing, onClose, onDone }) {
  const [rows, setRows] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [err, setErr] = useState(null);
  async function pick(e) {
    setErr(null);
    const f = e.target.files?.[0];
    if (!f) return;
    const r = await readBankAccounts(f).catch((x) => ({ error: x.message }));
    if (r.error) { setErr(r.error); return; }
    setRows(r.rows.filter((x) => !existing.has(x.bc_code)));
  }
  async function save() {
    setErr(null);
    try {
      for (const r of rows.filter((x) => sel.has(x.bc_code))) {
        await rpc('cc_save_bank_account', { p: { name: `${r.bc_name.trim()} (${r.bc_code})`, bank: r.bc_name.trim(), bc_code: r.bc_code, bc_name: r.bc_name.trim(), account_no: r.account_no, active: true } });
      }
      onDone(); onClose();
    } catch (e2) { setErr(e2); }
  }
  return (
    <Modal title="Add accounts from Business Central" onClose={onClose} wide
      footer={<><Btn onClick={onClose}>Close</Btn><Btn className="primary" disabled={!sel.size} onClick={save}>Add {sel.size || ''} account{sel.size === 1 ? '' : 's'}</Btn></>}>
      <div className="stack">
        <p className="muted">In BC, open Bank Accounts, choose Open in Excel, and upload the file here. Tick only the accounts you deposit cheques into.</p>
        <input className="input" type="file" accept=".xlsx,.xls,.csv" onChange={pick} />
        <ErrorNote error={err} />
        {rows ? (rows.length ? (
          <div className="table-wrap"><table className="t compact"><tbody>{rows.map((r) => (
            <tr key={r.bc_code} className={sel.has(r.bc_code) ? 'sel' : ''}>
              <td style={{ width: 36 }}><input type="checkbox" style={{ width: 20, height: 20 }} checked={sel.has(r.bc_code)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(r.bc_code)) n.delete(r.bc_code); else n.add(r.bc_code); return n; })} aria-label={r.bc_code} /></td>
              <td><b>{r.bc_code}</b></td><td>{r.bc_name}</td>
            </tr>))}</tbody></table></div>
        ) : <Note kind="plain">Every account in that file is already here.</Note>) : null}
      </div>
    </Modal>
  );
}

function StatementUpload({ accounts, onDone }) {
  const { toast } = useApp();
  const [account, setAccount] = useState('');
  const [file, setFile] = useState(null);
  const [grid, setGrid] = useState(null);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState(null);
  const [inputKey, setInputKey] = useState(0);
  const acc = accounts.find((a) => String(a.id) === String(account));

  async function pick(e) {
    setErr(null); setPreview(null);
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const { grid: g } = await readStatementGrid(f);
      if (!g.length) throw new Error('That file looks empty.');
      setFile(f); setGrid(g);
      const saved = acc?.mapping;
      const det = detectMapping(g);
      if (saved && saved.headerRow !== undefined && g[saved.headerRow]) { setHeaderRow(saved.headerRow); setMapping(saved.mapping || {}); }
      else { setHeaderRow(Math.max(det.headerRow, 0)); setMapping(det.mapping); }
    } catch (x) { setErr(x); }
  }

  const extracted = useMemo(() => (grid ? extractLines(grid, headerRow, mapping) : null), [grid, headerRow, mapping]);
  const opts = useMemo(() => (grid ? columnOptions(grid, headerRow) : []), [grid, headerRow]);

  async function check() {
    setErr(null);
    try {
      if (!acc) throw new Error('Pick the bank account first.');
      if (!extracted?.lines.length) throw new Error('No transactions found with this mapping. Check the Date and amount columns.');
      setPreview(await rpc('cc_import_statement', { p_account: acc.id, p_file: file.name, p_rows: extracted.lines, p_commit: false }));
    } catch (x) { setErr(x); }
  }
  async function commit() {
    setErr(null);
    try {
      const r = await rpc('cc_import_statement', { p_account: acc.id, p_file: file.name, p_rows: extracted.lines, p_commit: true });
      await rpc('cc_save_mapping', { p_account: acc.id, p_mapping: { headerRow, mapping } });
      toast(`${r.new} new line${r.new === 1 ? '' : 's'} loaded`);
      setGrid(null); setFile(null); setPreview(null); setInputKey((k) => k + 1);
      onDone();
    } catch (x) { setErr(x); }
  }

  return (
    <div className="panel stack">
      <h2>Upload a bank statement</h2>
      <p className="muted">Excel, CSV or the bank's own ".xls" download. Lines already loaded are skipped, and nothing already matched changes.</p>
      <div className="grid2">
        <Field label="Account">
          <select className="input" value={account} onChange={(e) => { setAccount(e.target.value); setGrid(null); setPreview(null); }}>
            <option value="">Pick the account</option>
            {accounts.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Statement file"><input key={inputKey} className="input" type="file" accept=".xls,.xlsx,.csv,.txt,.htm,.html" disabled={!account} onChange={pick} /></Field>
      </div>
      <ErrorNote error={err} />
      {grid ? (
        <>
          <h3>Check the columns</h3>
          <p className="small muted">The app guessed these from the file. Fix any that are wrong; it remembers them for {acc?.name}.</p>
          <div className="grid3">
            <Field label="Header row">
              <select className="input" value={headerRow} onChange={(e) => setHeaderRow(Number(e.target.value))}>
                {grid.slice(0, 40).map((r, i) => <option key={i} value={i}>Row {i + 1}: {(r || []).filter(Boolean).slice(0, 4).join(' | ').slice(0, 50)}</option>)}
              </select>
            </Field>
            {FIELDS.map((f) => (
              <Field key={f.key} label={f.label + (f.required ? '' : ' (optional)')}>
                <select className="input" value={mapping[f.key] ?? ''} onChange={(e) => { const v = e.target.value; setMapping((m) => { const n = { ...m }; if (v === '') delete n[f.key]; else n[f.key] = Number(v); return n; }); setPreview(null); }}>
                  <option value="">Not in this file</option>
                  {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            ))}
          </div>
          {extracted ? (
            <>
              <p className="small muted">{extracted.lines.length} transactions found{extracted.skipped.length ? `, ${extracted.skipped.length} rows skipped (no date)` : ''}. First lines:</p>
              <div className="table-wrap">
                <table className="t compact">
                  <thead><tr><th>Date</th><th>Description</th><th>Cheque</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th></tr></thead>
                  <tbody>{extracted.lines.slice(0, 8).map((l, i) => (
                    <tr key={i}><td className="nowrap">{day(l.txn_date)}</td><td className="small">{l.narration}</td><td>{l.cheque_no}</td>
                      <td className="num">{l.debit ? money(l.debit) : ''}</td><td className="num">{l.credit ? money(l.credit) : ''}</td><td className="num">{money(l.balance)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          ) : null}
          {preview ? (
            <div className="stack-s">
              <Note kind={preview.balance_breaks?.length ? 'warn' : 'ok'}>
                {preview.lines} lines from {day(preview.first_date)} to {day(preview.last_date)}: <b>{preview.new} new</b>, {preview.already_loaded} already loaded.
                Money in {lkr(preview.credits)}, out {lkr(preview.debits)}.
                {preview.balance_breaks?.length ? ` The running balance doesn't add up on ${preview.balance_breaks.length} line(s), first at row ${preview.balance_breaks[0].row} (${day(preview.balance_breaks[0].txn_date)}). Check the debit and credit columns.` : ' The running balance adds up.'}
              </Note>
              {preview.new ? <div className="row"><Btn className="primary" onClick={commit}>Load {preview.new} new line{preview.new === 1 ? '' : 's'}</Btn></div>
                : <p className="muted">Nothing new in this file: every line is already loaded.</p>}
            </div>
          ) : <div><Btn className="primary" onClick={check}>Check the statement</Btn></div>}
        </>
      ) : null}
    </div>
  );
}

export default function Bank() {
  const { role, tick } = useApp();
  const [modal, setModal] = useState(null);
  const { data, loading, error, reload } = useAsync(async () => {
    const accounts = await q(supabase.from('bank_accounts').select('*').order('active', { ascending: false }).order('name'));
    const uploads = await q(supabase.from('statement_uploads').select('*, bank_accounts(name)').order('done_at', { ascending: false }).limit(15));
    const unid = await q(supabase.from('statement_lines').select('account_id').is('link_kind', null).gt('credit', 0).limit(5000));
    const counts = unid.reduce((m, r) => { m[r.account_id] = (m[r.account_id] || 0) + 1; return m; }, {});
    return { accounts, uploads, counts };
  }, [tick]);
  if (loading && !data) return <Loading />;
  const accounts = data?.accounts || [];
  const finance = role === 'finance';
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div><h1>Bank</h1><p>Accounts used for cheque deposits, their statements, and money nobody has identified yet.</p></div>
        {finance ? <div className="row"><Btn onClick={() => setModal({ kind: 'import' })}><Icon name="upload" size={18} /> Add from BC file</Btn><Btn className="primary" onClick={() => setModal({ kind: 'acc' })}><Icon name="plus" size={18} /> Add an account</Btn></div> : null}
      </div>
      <ErrorNote error={error} />
      <div className="table-wrap">
        {!accounts.length ? <Empty title="No bank accounts yet">Add the accounts you deposit cheques into, with their BC Bank Account No.</Empty> : (
          <table className="t">
            <thead><tr><th>Account</th><th>Bank and number</th><th>BC code</th><th>Unidentified credits</th><th /></tr></thead>
            <tbody>{accounts.map((a) => (
              <tr key={a.id} className={a.active ? '' : 'dim'}>
                <td><b>{a.name}</b>{a.active ? '' : <div className="small">Not used for deposits</div>}</td>
                <td>{a.bank}{a.account_no ? <div className="small muted">{a.account_no}</div> : null}</td>
                <td>{a.bc_code || <span style={{ color: 'var(--red)' }}>Missing: needed for BC export</span>}</td>
                <td>{data.counts[a.id] ? <Link to={`/bank/${a.id}?show=unidentified`}>{data.counts[a.id]} to look at</Link> : <span className="muted">None</span>}</td>
                <td className="nowrap right"><Link className="btn small" to={`/bank/${a.id}`}>Statement</Link> {finance ? <button className="btn quiet small" onClick={() => setModal({ kind: 'acc', acc: a })}>Edit</button> : null}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      {finance && accounts.length ? <StatementUpload accounts={accounts} onDone={reload} /> : null}
      <div className="section-title"><h2>Recent statement uploads</h2></div>
      <div className="table-wrap">
        {!data.uploads.length ? <Empty title="No statements uploaded yet" /> : (
          <table className="t compact">
            <thead><tr><th>When</th><th>Account</th><th>File</th><th>Period</th><th className="num">Lines</th><th className="num">New</th></tr></thead>
            <tbody>{data.uploads.map((u) => (
              <tr key={u.id}><td className="nowrap">{when(u.done_at)}</td><td>{u.bank_accounts?.name}</td><td className="small">{u.file_name}</td>
                <td className="nowrap small">{day(u.first_date)} to {day(u.last_date)}</td><td className="num">{u.line_count}</td><td className="num">{u.new_count}</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
      {modal?.kind === 'acc' ? <AccountModal acc={modal.acc} onClose={() => setModal(null)} onDone={reload} /> : null}
      {modal?.kind === 'import' ? <ImportAccountsModal existing={new Set(accounts.map((a) => a.bc_code))} onClose={() => setModal(null)} onDone={reload} /> : null}
    </div>
  );
}

export function Statement() {
  const { id } = useParams();
  const { role, tick, toast } = useApp();
  const params = new URLSearchParams(window.location.search);
  const [onlyUnid, setOnlyUnid] = useState(params.get('show') === 'unidentified');
  const [month, setMonth] = useState('');
  const [sel, setSel] = useState(new Set());
  const [tagModal, setTagModal] = useState(false);
  const [tag, setTag] = useState('customer_transfer');
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);
  const { data, loading, error, reload } = useAsync(async () => {
    const acc = await q(supabase.from('bank_accounts').select('*').eq('id', id).maybeSingle());
    const lines = await qAll(() => supabase.from('statement_lines').select('*, deposits(dep_no, id)').eq('account_id', id)
      .order('txn_date').order('upload_id').order('seq'));
    return { acc, lines };
  }, [id, tick]);
  const months = useMemo(() => [...new Set((data?.lines || []).map((l) => l.txn_date.slice(0, 7)))].sort().reverse(), [data]);
  const m = month || months[0] || '';
  const rows = (data?.lines || []).filter((l) => (onlyUnid ? !l.link_kind && Number(l.credit) > 0 : l.txn_date.startsWith(m)));

  async function doTag() {
    setErr(null);
    try { await rpc('cc_tag_lines', { p_ids: [...sel], p_tag: tag, p_note: note || null }); toast('Lines tagged'); setSel(new Set()); setTagModal(false); setNote(''); reload(); } catch (e) { setErr(e); }
  }
  async function untag(lineId) {
    await rpc('cc_untag_lines', { p_ids: [lineId] }); reload();
  }

  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  return (
    <div className="stack">
      <Link to="/bank" className="btn quiet small" style={{ alignSelf: 'flex-start' }}>← Bank</Link>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div><h1>{data.acc?.name}</h1><p>{data.acc?.bc_code} statement in bank order. Unidentified money in is highlighted.</p></div>
        <div className="row">
          <label className="check"><input type="checkbox" checked={onlyUnid} onChange={(e) => setOnlyUnid(e.target.checked)} /> Only unidentified credits</label>
          {!onlyUnid ? (
            <select className="input inline" value={m} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
              {months.map((x) => <option key={x} value={x}>{new Date(x + '-01T00:00:00').toLocaleString('en-GB', { month: 'long', year: 'numeric' })}</option>)}
            </select>
          ) : null}
        </div>
      </div>
      {role === 'finance' && sel.size ? (
        <div className="row"><Btn className="primary small" onClick={() => setTagModal(true)}>Tag {sel.size} line{sel.size > 1 ? 's' : ''} as not a cheque receipt</Btn><button className="btn quiet small" onClick={() => setSel(new Set())}>Clear</button></div>
      ) : null}
      <div className="table-wrap">
        {!rows.length ? <Empty title={onlyUnid ? 'Every credit is identified' : 'No lines for this month'}>{onlyUnid ? null : 'Upload a statement on the Bank page.'}</Empty> : (
          <table className="t compact">
            <thead><tr>{role === 'finance' ? <th style={{ width: 32 }} /> : null}<th>Date</th><th>Description</th><th>Cheque</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th><th>Linked to</th></tr></thead>
            <tbody>{rows.map((l) => {
              const unid = !l.link_kind && Number(l.credit) > 0;
              return (
                <tr key={l.id} className={sel.has(l.id) ? 'sel' : unid ? 'hl' : ''}>
                  {role === 'finance' ? <td>{unid || l.link_kind === 'tag' ? <input type="checkbox" checked={sel.has(l.id)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; })} aria-label="Select line" /> : null}</td> : null}
                  <td className="nowrap">{day(l.txn_date)}</td>
                  <td className="small">{l.narration}{l.reference ? <div className="muted">{l.reference}</div> : null}</td>
                  <td className="small">{l.cheque_no}</td>
                  <td className="num">{Number(l.debit) ? money(l.debit) : ''}</td>
                  <td className="num">{Number(l.credit) ? money(l.credit) : ''}</td>
                  <td className="num">{money(l.balance)}</td>
                  <td className="small">
                    {l.link_kind === 'deposit' ? <Link to={`/deposits/${l.deposit_id}`}>Slip {l.deposits?.dep_no}</Link>
                      : l.link_kind === 'tag' ? <span>{TAGS[l.tag]}{l.tag_note ? `: ${l.tag_note}` : ''} {role === 'finance' ? <button className="btn quiet small" onClick={() => untag(l.id)}>Undo</button> : null}</span>
                        : unid ? <span style={{ color: 'var(--amber)', fontWeight: 650 }}>Unidentified</span> : ''}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </div>
      {tagModal ? (
        <Modal title="Not a cheque receipt" onClose={() => setTagModal(false)} footer={<><Btn onClick={() => setTagModal(false)}>Close</Btn><Btn className="primary" onClick={doTag}>Tag {sel.size} line{sel.size > 1 ? 's' : ''}</Btn></>}>
          <div className="stack">
            <Field label="What is this money?">
              <select className="input" value={tag} onChange={(e) => setTag(e.target.value)}>
                {Object.entries(TAGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label={tag === 'other' ? 'Note' : 'Note (optional)'}><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <ErrorNote error={err} />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

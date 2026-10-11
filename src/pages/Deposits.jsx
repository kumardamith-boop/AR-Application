import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/ctx.jsx';
import { supabase, q, rpc } from '../lib/supabase.js';
import { compressImage, newPath, uploadFile } from '../lib/files.js';
import { day, daysBetween, lkr, money, round2, same, todayLK } from '../lib/format.js';
import { chequeFromText } from '../lib/statement.js';
import { Btn, Dept, Empty, ErrorNote, Field, Loading, Note, Photo, PhotoViewer, ReasonModal, Seg, useAsync } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

const STATUS_TXT = { open: 'Not seen in the bank yet', matched: 'In the bank', cancelled: 'Sent back' };

export default function Deposits() {
  const { role, tick } = useApp();
  const [tab, setTab] = useState('open');
  const { data, loading, error } = useAsync(() => q(supabase.from('deposits')
    .select('*, bank_accounts(name), collections(id, department, cc_no, customer_name)')
    .order('deposit_date', { ascending: false }).order('id', { ascending: false }).limit(500)), [tick]);
  const rows = (data || []).filter((d) => d.status === tab);
  const today = todayLK();
  return (
    <div>
      <div className="page-head">
        <div><h1>Deposits</h1><p>Deposit slips and whether the bank has shown them yet.</p></div>
        {role === 'finance' || role === 'driver' ? <Link className="btn primary" to="/deposits/new"><Icon name="plus" size={18} /> Record a deposit slip</Link> : null}
      </div>
      <div style={{ marginBottom: 14 }}>
        <Seg value={tab} onChange={setTab} options={[
          { value: 'open', label: `Not in bank yet (${(data || []).filter((d) => d.status === 'open').length})` },
          { value: 'matched', label: 'In the bank' },
          { value: 'cancelled', label: 'Sent back' },
        ]} />
      </div>
      <ErrorNote error={error} />
      {loading && !data ? <Loading /> : !rows.length ? (
        <div className="panel"><Empty title={tab === 'open' ? 'Every slip is matched to the bank' : 'Nothing here yet'}>
          {tab === 'open' ? 'Record a slip after you deposit cheques at the bank.' : null}
        </Empty></div>
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Slip</th><th>Deposited</th><th>Account</th><th>Collections</th><th className="num">Total</th><th>Status</th></tr></thead>
            <tbody>{rows.map((d) => {
              const age = daysBetween(d.deposit_date, today);
              return (
                <tr key={d.id} className={d.status === 'open' && age > 3 ? 'hl' : ''}>
                  <td><Link to={`/deposits/${d.id}`}><b>{d.dep_no}</b></Link>{d.reference ? <div className="small muted">{d.reference}</div> : null}</td>
                  <td className="nowrap">{day(d.deposit_date)}{d.status === 'open' ? <div className="small muted">{age} day{age === 1 ? '' : 's'} ago</div> : null}</td>
                  <td>{d.bank_accounts?.name}</td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>{[...new Set((d.collections || []).map((c) => c.department))].map((x) => <Dept key={x} code={x} />)}</div>
                    <div className="small muted">{(d.collections || []).map((c) => c.cc_no).join(', ')}</div>
                  </td>
                  <td className="num">{money(d.slip_total)}</td>
                  <td>{STATUS_TXT[d.status]}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function DepositNew() {
  const { role, uid, toast } = useApp();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const preset = (params.get('ids') || '').split(',').filter(Boolean).map(Number);
  const [account, setAccount] = useState('');
  const [date, setDate] = useState(todayLK());
  const [reference, setReference] = useState('');
  const [slipTotal, setSlipTotal] = useState('');
  const [slip, setSlip] = useState(null);
  const [ticked, setTicked] = useState(new Set(preset));
  const [err, setErr] = useState(null);

  const { data, loading, error } = useAsync(async () => {
    const accounts = await q(supabase.from('bank_accounts').select('id, name, bc_code, active').eq('active', true).order('name'));
    let cq = supabase.from('collections').select('id, cc_no, department, customer_name, driver_id, status, cheques(id, cheque_no, bank, cheque_date, amount, returned_at)');
    cq = role === 'driver' ? cq.eq('status', 'collected').eq('driver_id', uid) : cq.eq('status', 'received');
    const cols = await q(cq.order('received_at', { ascending: true }));
    return { accounts, cols };
  }, [role, uid]);
  useEffect(() => { if (data?.accounts?.length === 1) setAccount(String(data.accounts[0].id)); }, [data]);

  const cols = data?.cols || [];
  const postDated = (c) => (c.cheques || []).find((x) => x.cheque_date > date);
  const total = useMemo(() => round2(cols.filter((c) => ticked.has(c.id)).reduce((s, c) => s + (c.cheques || []).reduce((a, x) => a + Number(x.amount), 0), 0)), [cols, ticked]);
  const slipNum = Number(String(slipTotal).replace(/,/g, '')) || 0;

  async function save() {
    setErr(null);
    try {
      let path = null;
      if (slip) path = await uploadFile(newPath(`u/${uid}`, slip.type === 'application/pdf' ? 'pdf' : 'jpg'), slip);
      const r = await rpc('cc_create_deposit', { p: {
        account_id: account ? Number(account) : null, deposit_date: date, reference, slip_total: slipTotal ? slipNum : null,
        slip_path: path, collection_ids: [...ticked],
      } });
      toast(`Slip ${r.dep_no} recorded`);
      nav(`/deposits/${r.id}`);
    } catch (e) { setErr(e); }
  }

  async function pickSlip(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { setErr('The file is over 10 MB. Take a smaller photo or PDF.'); return; }
    setSlip(f.type.startsWith('image/') ? await compressImage(f) : f);
  }

  if (loading && !data) return <Loading />;
  return (
    <div style={{ maxWidth: 900 }}>
      <div className="page-head"><div><h1>Record a deposit slip</h1><p>Tick the collections whose cheques are on the slip. A slip can carry DT and EU cheques together.</p></div></div>
      <ErrorNote error={error} />
      {!data?.accounts?.length ? <Note kind="warn">No bank accounts yet. Add one on the <Link to="/bank">Bank</Link> page first.</Note> : null}
      <div className="stack">
        <div className="panel stack">
          <div className="grid3">
            <Field label="Bank account">
              <select className="input" value={account} onChange={(e) => setAccount(e.target.value)}>
                <option value="">Pick the account</option>
                {(data?.accounts || []).map((a) => <option key={a.id} value={a.id}>{a.name}{a.bc_code ? ` (${a.bc_code})` : ''}</option>)}
              </select>
            </Field>
            <Field label="Date on the slip"><input className="input" type="date" value={date} max={todayLK()} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Slip reference (optional)"><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
          </div>
          <Field label="Photo or PDF of the slip" hint={role === 'driver' ? 'Required.' : 'Recommended. Up to 10 MB.'}>
            <input className="input" type="file" accept="image/*,application/pdf" capture="environment" onChange={pickSlip} />
          </Field>
        </div>

        <div className="panel flush">
          <div className="panel-head"><h3>Cheques {role === 'driver' ? 'you hold' : 'with finance, to deposit'}</h3><span className="muted small">{ticked.size} ticked</span></div>
          {!cols.length ? <Empty title="No cheques waiting to be deposited">{role === 'driver' ? 'Collected cheques show here.' : 'Receive cheques from the drivers first.'}</Empty> : (
            <table className="t">
              <thead><tr><th style={{ width: 40 }} /><th>Collection</th><th>Cheques</th><th className="num">Amount</th></tr></thead>
              <tbody>{cols.map((c) => {
                const pd = postDated(c);
                const amt = (c.cheques || []).reduce((a, x) => a + Number(x.amount), 0);
                return (
                  <tr key={c.id} className={ticked.has(c.id) ? 'sel' : pd ? 'dim' : ''}>
                    <td><input type="checkbox" style={{ width: 20, height: 20, accentColor: 'var(--purple)' }} checked={ticked.has(c.id)} disabled={!!pd && !ticked.has(c.id)}
                      onChange={() => setTicked((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} aria-label={`Tick ${c.cc_no}`} /></td>
                    <td><b>{c.customer_name}</b><div className="row small muted" style={{ gap: 6 }}><span>{c.cc_no}</span><Dept code={c.department} /></div></td>
                    <td className="small">
                      {(c.cheques || []).map((x) => <div key={x.id}>{x.cheque_no}, {x.bank}, {day(x.cheque_date)}</div>)}
                      {pd ? <div style={{ color: 'var(--amber)' }}>Post-dated: can be deposited from {day(pd.cheque_date)}</div> : null}
                    </td>
                    <td className="num">{money(amt)}</td>
                  </tr>
                );
              })}</tbody>
              <tfoot><tr><td /><td colSpan={2}>Ticked cheques add up to</td><td className="num">{money(total)}</td></tr></tfoot>
            </table>
          )}
        </div>

        <div className="panel stack">
          <Field label="Total on the slip (LKR)" hint="Type it from the paper slip. It must equal the ticked cheques.">
            <input className="input num" inputMode="decimal" value={slipTotal} onChange={(e) => setSlipTotal(e.target.value)} style={{ maxWidth: 240 }} />
          </Field>
          {slipTotal && total ? (same(slipNum, total)
            ? <Note kind="ok">The slip matches the ticked cheques.</Note>
            : <Note kind="warn">The slip says {lkr(slipNum)} but the ticked cheques add up to {lkr(total)}.</Note>) : null}
          <ErrorNote error={err} />
          <div className="row"><Btn className="primary big" onClick={save}>Record the deposit slip</Btn><Link className="btn big" to="/deposits">Cancel</Link></div>
        </div>
      </div>
    </div>
  );
}

export function DepositDetail() {
  const { id } = useParams();
  const { role, tick, toast, nameOf } = useApp();
  const [picked, setPicked] = useState(null);
  const [map, setMap] = useState({});
  const [err, setErr] = useState(null);
  const [modal, setModal] = useState(null);
  const [viewer, setViewer] = useState(null);

  const { data, loading, error, reload } = useAsync(async () => {
    const d = await q(supabase.from('deposits').select('*, bank_accounts(id, name, bc_code)').eq('id', id).maybeSingle());
    if (!d) return null;
    const cols = await q(supabase.from('collections').select('id, cc_no, department, customer_name, status, cheques(id, cheque_no, bank, amount, cheque_date, returned_at, statement_line_id)').eq('deposit_id', id));
    const lines = await q(supabase.from('statement_lines').select('*').eq('deposit_id', id).order('txn_date'));
    let sugg = null;
    if (d.status === 'open' && role === 'finance') sugg = await rpc('cc_deposit_suggestions', { p_deposit: Number(id) });
    const docs = lines.length ? await q(supabase.from('bc_docs').select('doc_no, line_id, post_status').in('line_id', lines.map((l) => l.id))) : [];
    return { d, cols, lines, sugg, docs };
  }, [id, tick]);

  useEffect(() => {
    if (data?.sugg) setPicked(new Set(data.sugg.suggested || []));
  }, [data]);

  const cheques = useMemo(() => (data?.cols || []).flatMap((c) => (c.cheques || []).map((x) => ({ ...x, cc_no: c.cc_no, customer_name: c.customer_name }))), [data]);
  const pickedLines = useMemo(() => (data?.sugg?.lines || []).filter((l) => picked?.has(l.id)), [data, picked]);
  const sum = round2(pickedLines.reduce((s, l) => s + Number(l.credit), 0));

  // default cheque -> line choice when several lines are ticked
  useEffect(() => {
    if (pickedLines.length < 2) { setMap({}); return; }
    const m = {};
    const used = new Set();
    for (const x of cheques) {
      const byNo = pickedLines.find((l) => l.cheque_no === x.cheque_no || chequeFromText(l.narration) === x.cheque_no || (l.narration || '').includes(x.cheque_no));
      const byAmt = pickedLines.filter((l) => same(l.credit, x.amount) && !used.has(l.id));
      const hit = byNo || (byAmt.length === 1 && cheques.filter((y) => same(y.amount, x.amount)).length === 1 ? byAmt[0] : null);
      if (hit) { m[x.id] = String(hit.id); used.add(hit.id); }
    }
    setMap(m);
  }, [pickedLines, cheques]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  if (!data) return <Empty title="Slip not found" />;
  const { d, cols, lines, sugg, docs } = data;
  const live = round2(cheques.filter((x) => !x.returned_at).reduce((s, x) => s + Number(x.amount), 0));
  const target = same(live, d.slip_total) ? d.slip_total : live;

  async function match() {
    setErr(null);
    try {
      const res = await rpc('cc_link_deposit', { p_deposit: d.id, p_line_ids: [...picked], p_cheque_lines: pickedLines.length > 1 ? map : null });
      toast(res.unmapped_cheques ? 'Matched. Say which cheque is on which line before exporting.' : 'Matched, collections closed');
      reload();
    } catch (e) { setErr(e); }
  }

  return (
    <div className="stack" style={{ maxWidth: 980 }}>
      <Link to="/deposits" className="btn quiet small" style={{ alignSelf: 'flex-start' }}>← All deposit slips</Link>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>Slip {d.dep_no}</h1>
          <p>{lkr(d.slip_total)} to {d.bank_accounts?.name} on {day(d.deposit_date)}{d.reference ? `, reference ${d.reference}` : ''}. Recorded by {nameOf(d.created_by)}.</p>
        </div>
        <span className={`stamp ${d.status === 'matched' ? 'green' : d.status === 'open' ? 'teal' : 'grey'}`}>{STATUS_TXT[d.status]}</span>
      </div>
      {d.status === 'cancelled' ? <Note kind="plain">Sent back: {d.cancel_reason}</Note> : null}

      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="panel flush">
          <div className="panel-head"><h3>Cheques on this slip</h3></div>
          <table className="t compact">
            <tbody>{cols.map((c) => (c.cheques || []).map((x) => (
              <tr key={x.id} className={x.returned_at ? 'dim' : ''}>
                <td><Link to={`/c/${c.id}`}>{c.cc_no}</Link> <Dept code={c.department} /><div className="small muted">{c.customer_name}</div></td>
                <td className="small">{x.cheque_no}<div className="muted">{x.bank}</div>{x.returned_at ? <div style={{ color: 'var(--red)' }}>Returned</div> : null}</td>
                <td className="num">{money(x.amount)}</td>
              </tr>
            )))}</tbody>
          </table>
        </div>
        <div className="panel">
          <h3>Slip photo</h3>
          <div style={{ marginTop: 8 }}>{d.slip_path ? <Photo path={d.slip_path} alt="Deposit slip" className="thumb" onOpen={setViewer} /> : <span className="muted">No photo</span>}</div>
        </div>
      </div>

      {d.status === 'matched' ? (
        <div className="panel">
          <h3>Seen in the bank</h3>
          <table className="t compact" style={{ marginTop: 8 }}>
            <thead><tr><th>Date</th><th>Bank description</th><th className="num">Credit</th><th>Cheques on it</th><th>BC</th></tr></thead>
            <tbody>{lines.map((l) => (
              <tr key={l.id}>
                <td className="nowrap">{day(l.txn_date)}</td><td className="small">{l.narration}</td><td className="num">{money(l.credit)}</td>
                <td className="small">{cheques.filter((x) => x.statement_line_id === l.id).map((x) => x.cheque_no).join(', ') || <span style={{ color: 'var(--amber)' }}>Not chosen yet</span>}</td>
                <td className="small">{docs.find((b) => b.line_id === l.id)?.doc_no || 'Not exported'}</td>
              </tr>
            ))}</tbody>
          </table>
          {role === 'finance' && !docs.length ? <button className="btn quiet small" style={{ marginTop: 10 }} onClick={() => setModal('unmatch')}>Unmatch from the bank</button> : null}
        </div>
      ) : null}

      {d.status === 'open' && role === 'finance' ? (
        <div className="action">
          <h2>Match this slip to the bank statement</h2>
          <p className="muted">Tick the line(s) on the {d.bank_accounts?.name} statement that show this deposit. One line for the whole slip, or one line per cheque. They must add up to {lkr(target)}.</p>
          {!sugg?.lines?.length ? (
            <Note kind="warn">No unmatched money-in lines near {day(d.deposit_date)} on this account{sugg?.latest_line_date ? ` (the statement loaded so far ends ${day(sugg.latest_line_date)})` : ''}. <Link to="/bank">Upload the latest statement</Link>, then come back.</Note>
          ) : (
            <div className="table-wrap" style={{ marginTop: 10 }}>
              <table className="t compact">
                <thead><tr><th style={{ width: 36 }} /><th>Date</th><th>Bank description</th><th className="num">Credit</th><th>Why</th></tr></thead>
                <tbody>{sugg.lines.map((l) => (
                  <tr key={l.id} className={picked?.has(l.id) ? 'sel' : ''}>
                    <td><input type="checkbox" style={{ width: 20, height: 20, accentColor: 'var(--purple)' }} checked={!!picked?.has(l.id)}
                      onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; })} aria-label={`Line ${day(l.txn_date)} ${money(l.credit)}`} /></td>
                    <td className="nowrap">{day(l.txn_date)}</td>
                    <td className="small">{l.narration}{l.reference ? <div className="muted">{l.reference}</div> : null}</td>
                    <td className="num">{money(l.credit)}</td>
                    <td className="small">{l.why ? <span style={{ color: 'var(--teal)' }}>{l.why}</span> : ''}{l.suggested ? <div><b>Suggested</b></div> : null}</td>
                  </tr>
                ))}</tbody>
                <tfoot><tr><td /><td colSpan={2}>Ticked lines</td><td className="num">{money(sum)}</td><td>{picked?.size ? (same(sum, target) || same(sum, d.slip_total) ? 'Matches the slip' : `Slip is ${money(target)}`) : ''}</td></tr></tfoot>
              </table>
            </div>
          )}
          {pickedLines.length > 1 ? (
            <div className="stack-s" style={{ marginTop: 14 }}>
              <h3>Which cheque is on which line?</h3>
              {cheques.filter((x) => !x.returned_at).map((x) => (
                <div key={x.id} className="row">
                  <span style={{ minWidth: 220 }}>{x.cheque_no} ({x.cc_no}) {lkr(x.amount)}</span>
                  <select className="input inline" value={map[x.id] || ''} onChange={(e) => setMap((m) => ({ ...m, [x.id]: e.target.value }))}>
                    <option value="">Decide later</option>
                    {pickedLines.map((l) => <option key={l.id} value={l.id}>{day(l.txn_date)}, {money(l.credit)}</option>)}
                  </select>
                </div>
              ))}
            </div>
          ) : null}
          <ErrorNote error={err} />
          <div className="row" style={{ marginTop: 14 }}>
            <Btn className="primary" disabled={!picked?.size} onClick={match}>Match and close the collections</Btn>
            <button className="btn quiet" onClick={() => setModal('cancel')}>Send the slip back</button>
          </div>
        </div>
      ) : null}

      {modal === 'cancel' ? (
        <ReasonModal title={`Send slip ${d.dep_no} back`} label="Why?" confirm="Send it back" danger
          extra={<p className="muted small">Its collections go back to "To deposit" so they can go on another slip.</p>}
          onClose={() => setModal(null)} onConfirm={(t) => rpc('cc_cancel_deposit', { p_deposit: d.id, p_reason: t }).then(() => { toast('Slip sent back'); reload(); })} />
      ) : null}
      {modal === 'unmatch' ? (
        <ReasonModal title={`Unmatch slip ${d.dep_no}`} label="Why?" confirm="Unmatch"
          extra={<p className="muted small">Its collections go back to "In bank?" and the bank lines become free to match again.</p>}
          onClose={() => setModal(null)} onConfirm={(t) => rpc('cc_unmatch_deposit', { p_deposit: d.id, p_reason: t }).then(() => { toast('Unmatched'); reload(); })} />
      ) : null}
      <PhotoViewer url={viewer} onClose={() => setViewer(null)} />
    </div>
  );
}

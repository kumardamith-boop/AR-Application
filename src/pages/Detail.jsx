import { lazy, Suspense, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../lib/ctx.jsx';
import { supabase, q, rpc } from '../lib/supabase.js';
import { STATUS, STEPS, day, lkr, mapsHref, money, telHref, todayLK, when } from '../lib/format.js';
import { Btn, Dept, Empty, ErrorNote, Field, Loading, Note, Photo, PhotoViewer, ReasonModal, Stamp, useAsync } from '../components/ui.jsx';
import { FixChequeModal, RecordCollection, ReturnChequeModal, SplitForm } from '../components/Collect.jsx';
import Icon from '../components/Icon.jsx';

const MapView = lazy(() => import('../components/MapPin.jsx').then((m) => ({ default: m.MapView })));

function Progress({ status }) {
  const s = STATUS[status];
  if (!s || s.step < 0) return null;
  const now = s.step;
  return (
    <ol className="steps" aria-label="Progress">
      {STEPS.map((label, i) => (
        <li key={label} className={i < now || status === 'closed' ? 'done' : i === now ? 'now' : ''} aria-current={i === now ? 'step' : undefined}>{label}</li>
      ))}
    </ol>
  );
}

function AssignForm({ c, onDone, compact }) {
  const { people } = useApp();
  const drivers = people.filter((p) => p.role === 'driver' && p.active);
  const [driver, setDriver] = useState(c.driver_id || drivers[0]?.id || '');
  const [date, setDate] = useState(c.collection_date || todayLK());
  const [instr, setInstr] = useState(c.instructions || '');
  const [err, setErr] = useState(null);
  async function save() {
    setErr(null);
    try { await rpc('cc_assign', { p_id: c.id, p_driver: driver || null, p_date: date || null, p_instructions: instr || null }); onDone(); } catch (e) { setErr(e); }
  }
  if (!drivers.length) return <Note kind="warn">No active drivers yet. Give someone the driver role on the People page.</Note>;
  return (
    <div className="stack">
      <div className="grid2">
        <Field label="Driver">
          <select className="input" value={driver} onChange={(e) => setDriver(e.target.value)}>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.full_name || d.email}</option>)}
          </select>
        </Field>
        <Field label="Collection date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      {!compact || instr ? (
        <Field label="Instructions for the driver (optional)">
          <input className="input" value={instr} onChange={(e) => setInstr(e.target.value)} placeholder="For example: collect the original, not a photocopy" />
        </Field>
      ) : null}
      <ErrorNote error={err} />
      <div><Btn className="primary" onClick={save}>{c.status === 'assigned' ? 'Save the new assignment' : 'Assign the driver'}</Btn></div>
    </div>
  );
}

function ActionPanel({ d, reload }) {
  const app = useApp();
  const { role, uid, isAdmin, nameOf, settings, toast } = app;
  const { c, cheques, alloc, replacement, deposit } = d;
  const [recording, setRecording] = useState(false);
  const [reassign, setReassign] = useState(false);
  const [problem, setProblem] = useState(false);
  const [err, setErr] = useState(null);
  const mineDriver = c.driver_id === uid || isAdmin;
  const mineSales = c.created_by === uid || isAdmin;
  const splitPending = c.split_needed && !c.split_at;
  const canSplit = (role === 'finance' || (role === 'sales' && mineSales)) && ['collected', 'received', 'deposited', 'closed'].includes(c.status);

  const done = (msg) => { if (msg) toast(msg); reload(); };

  const wait = (title, body) => (
    <div className="action waiting"><h2>{title}</h2>{body ? <p className="muted" style={{ margin: 0 }}>{body}</p> : null}</div>
  );

  if (recording) {
    return (
      <div className="action">
        <h2>Record the collection</h2>
        <p className="muted">Take a clear photo of each cheque, then type its details.</p>
        <RecordCollection c={c} onDone={() => { setRecording(false); done('Collection saved'); }} onCancel={() => setRecording(false)} />
      </div>
    );
  }

  if (splitPending && canSplit) {
    return (
      <div className="action">
        <h2>Say which invoices each cheque pays</h2>
        <SplitForm c={c} cheques={cheques} alloc={alloc} onDone={() => done('Split saved')} />
        {role === 'finance' && c.status === 'collected' ? (
          <div style={{ marginTop: 14 }}><Btn onClick={() => rpc('cc_receive', { p_id: c.id }).then(() => done('Cheques received')).catch(setErr)}>The cheques are with me now</Btn></div>
        ) : null}
        <ErrorNote error={err} />
      </div>
    );
  }

  switch (c.status) {
    case 'submitted':
      if (role === 'finance') {
        return (
          <div className="action">
            <h2>Assign a driver</h2>
            <AssignForm c={c} onDone={() => done('Driver assigned')} />
            <p className="small muted" style={{ marginTop: 12 }}>Already have the cheque? <a href="#" onClick={(e) => { e.preventDefault(); setRecording(true); }}>Record the collection yourself</a>.</p>
          </div>
        );
      }
      return wait('With finance', 'Finance will assign a driver and a date.');
    case 'assigned':
      if (role === 'driver' && mineDriver) {
        return (
          <div className="action">
            <h2>Collect the cheque{c.collection_date && c.collection_date < todayLK() ? ' (overdue)' : ''}</h2>
            {c.instructions ? <Note>{c.instructions}</Note> : null}
            {c.problem_note ? <Note kind="warn">Last time: {c.problem_note}</Note> : null}
            <div className="row" style={{ marginTop: 12 }}>
              <Btn className="primary big" onClick={() => setRecording(true)}><Icon name="camera" /> Record collection</Btn>
              <Btn onClick={() => setProblem(true)}>Couldn't collect</Btn>
            </div>
            {problem ? <ReasonModal title="Couldn't collect" label="What happened?" placeholder="For example: customer asked us to come next week"
              confirm="Tell finance" onClose={() => setProblem(false)} onConfirm={(t) => rpc('cc_report_problem', { p_id: c.id, p_note: t }).then(() => done('Finance has been told'))} /> : null}
          </div>
        );
      }
      if (role === 'finance') {
        return (
          <div className="action">
            <h2>{nameOf(c.driver_id)} collects on {day(c.collection_date)}</h2>
            {c.problem_note ? <Note kind="warn">Couldn't collect: {c.problem_note}</Note> : null}
            {reassign ? <div style={{ marginTop: 12 }}><AssignForm c={c} onDone={() => { setReassign(false); done('Assignment saved'); }} /></div> : (
              <div className="row" style={{ marginTop: 12 }}>
                <Btn onClick={() => setReassign(true)}>Change driver or date</Btn>
                <Btn onClick={() => setRecording(true)}>Record on the driver's behalf</Btn>
              </div>
            )}
          </div>
        );
      }
      return wait(`${nameOf(c.driver_id)} collects on ${day(c.collection_date)}`, c.problem_note ? `Couldn't collect last time: ${c.problem_note}` : null);
    case 'collected':
      if (role === 'finance') {
        return (
          <div className="action">
            <h2>Receive the cheques from {nameOf(c.driver_id) || 'the driver'}</h2>
            <p className="muted">Check each paper cheque against the photos below. Correct any typing mistakes before you receive.</p>
            <Btn className="primary" onClick={() => rpc('cc_receive', { p_id: c.id }).then(() => done('Cheques received')).catch(setErr)}>Checked, the cheques are with me</Btn>
            <ErrorNote error={err} />
          </div>
        );
      }
      if (role === 'driver' && mineDriver) {
        return settings?.drivers_can_deposit
          ? <div className="action"><h2>Hand the cheques to finance or deposit them</h2><Link className="btn primary" to={`/deposits/new?ids=${c.id}`}>Record a deposit slip</Link></div>
          : wait('Hand the cheques to finance', 'Finance marks them received when they have the paper cheques.');
      }
      return wait('With the driver', `${nameOf(c.driver_id) || 'The driver'} hands the cheques to finance.`);
    case 'received':
      if (role === 'finance') {
        const pd = cheques.find((x) => x.cheque_date > todayLK());
        return (
          <div className="action">
            <h2>Deposit the cheques</h2>
            {pd ? <Note kind="warn">Cheque {pd.cheque_no} is post-dated. It can be deposited from {day(pd.cheque_date)}.</Note> : null}
            <Link className="btn primary" to={`/deposits/new?ids=${c.id}`} style={{ marginTop: 10 }}>Put it on a deposit slip</Link>
          </div>
        );
      }
      return wait('With finance, to deposit', 'Finance deposits the cheques at the bank.');
    case 'deposited':
      if (role === 'finance' && deposit) {
        return (
          <div className="action">
            <h2>Match slip {deposit.dep_no} to the bank statement</h2>
            <p className="muted">Deposited on {day(deposit.deposit_date)} to {deposit.bank_accounts?.name}. Upload the statement, then match the slip.</p>
            <Link className="btn primary" to={`/deposits/${deposit.id}`}>Match to the bank</Link>
          </div>
        );
      }
      return wait('Deposited', deposit ? `On ${day(deposit.deposit_date)}. Waiting for the bank statement.` : 'Waiting for the bank statement.');
    case 'closed':
      return wait(`In the bank since ${day(c.closed_at)}`, d.bc?.length ? `Sent to Business Central as ${[...new Set(d.bc.map((b) => b.bc_docs?.doc_no))].join(', ')}.` : role === 'finance' ? 'Next: Export to BC.' : null);
    case 'returned':
      if (replacement) return wait(`Returned, replaced by ${replacement.cc_no}`, <Link to={`/c/${replacement.id}`}>Open {replacement.cc_no}</Link>);
      if ((role === 'sales' && mineSales) || role === 'finance') {
        return (
          <div className="action">
            <h2>The bank returned the cheque</h2>
            <p className="muted">{c.return_reason}. Raise a replacement to collect a new cheque for the same invoices.</p>
            <Link className="btn primary" to={`/new?replaces=${c.id}`}>Raise a replacement</Link>
          </div>
        );
      }
      return wait('Returned by the bank', c.return_reason);
    case 'cancelled':
      return wait(`Cancelled by ${nameOf(c.cancelled_by)}`, c.cancel_reason);
    default:
      return null;
  }
}

export default function Detail() {
  const { id } = useParams();
  const app = useApp();
  const { role, uid, isAdmin, nameOf, tick, toast } = app;
  const [viewer, setViewer] = useState(null);
  const [modal, setModal] = useState(null);

  const { data: d, loading, error, reload } = useAsync(async () => {
    const c = await q(supabase.from('collections').select('*').eq('id', id).maybeSingle());
    if (!c) return { c: null };
    const [cheques, events, alloc, repl, orig] = await Promise.all([
      q(supabase.from('cheques').select('*').eq('collection_id', id).order('seq')),
      q(supabase.from('events').select('*').eq('collection_id', id).order('created_at', { ascending: false })),
      rpc('cc_allocation', { p_id: Number(id) }),
      q(supabase.from('collections').select('id, cc_no, status').eq('replaces_id', id).neq('status', 'cancelled').limit(1)),
      c.replaces_id ? q(supabase.from('collections').select('id, cc_no').eq('id', c.replaces_id).maybeSingle()) : null,
    ]);
    let deposit = null, lines = [], bc = [];
    if (c.deposit_id) {
      deposit = await q(supabase.from('deposits').select('*, bank_accounts(name, bc_code)').eq('id', c.deposit_id).maybeSingle());
      lines = await q(supabase.from('statement_lines').select('id, txn_date, narration, credit').eq('deposit_id', c.deposit_id).order('txn_date'));
    }
    if (role === 'finance' || role === 'executive') {
      bc = await q(supabase.from('bc_doc_lines').select('id, amount, applies_doc_no, cheque_id, bc_docs(doc_no, post_status)').eq('collection_id', id));
    }
    return { c, cheques, events, alloc, replacement: repl?.[0] || null, orig, deposit, lines, bc };
  }, [id, tick]);

  if (loading && !d) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  if (!d?.c) return <Empty title="Collection not found">It may belong to another department, or the link is wrong. <Link to="/collections">Back to the list</Link></Empty>;

  const { c, cheques, events, alloc, deposit, lines, bc } = d;
  const mineSales = c.created_by === uid || isAdmin;
  const amount = c.collected_amount ?? c.expected_amount;
  const canEdit = (role === 'sales' && mineSales && c.status === 'submitted') || (role === 'finance' && ['submitted', 'assigned'].includes(c.status));
  const canCancel = (role === 'sales' && mineSales && ['submitted', 'assigned'].includes(c.status)) || (role === 'finance' && ['submitted', 'assigned', 'collected', 'received'].includes(c.status));
  const canReopen = role === 'finance' && c.status === 'closed' && !(bc || []).length;
  const allocByCheque = (qid) => (alloc || []).filter((a) => a.cheque_id === qid);
  const href = mapsHref(c);

  return (
    <div className="stack" style={{ maxWidth: 980 }}>
      <div className="row between">
        <Link to="/collections" className="btn quiet small">← All collections</Link>
        <div className="row">
          {canEdit ? <Link to={`/c/${c.id}/edit`} className="btn small">Edit</Link> : null}
        </div>
      </div>

      <section className="slip" aria-label="Collection">
        <div className="slip-top">
          <div className="row"><span className="ccno">{c.cc_no}</span><Dept code={c.department} /></div>
          <Stamp status={c.status} big />
        </div>
        <div className="slip-body">
          <div>
            <div className="from-lbl">Received from</div>
            <div className="from">{c.customer_name}</div>
            <div className="small muted" style={{ marginTop: 4 }}>{c.customer_no}</div>
          </div>
          <div className="amountbox">
            <small>{c.collected_amount != null ? 'Collected' : 'Expected'}</small>
            <strong>{lkr(amount)}</strong>
            {c.amount_changed ? <small style={{ color: 'var(--red)' }}>Expected {lkr(c.expected_amount)}</small> : null}
          </div>
          <div className="refs">
            <span>Raised {day(c.created_at)} by <b>{nameOf(c.created_by)}</b></span>
            <span>Invoices: <b>{c.invoice_refs || 'none'}</b></span>
            {c.driver_id ? <span>Driver: <b>{nameOf(c.driver_id)}</b>{c.collection_date ? `, ${day(c.collection_date)}` : ''}</span> : null}
            {deposit ? <span>Slip: <b>{deposit.dep_no}</b></span> : null}
            {d.orig ? <span>Replaces: <Link to={`/c/${d.orig.id}`}><b>{d.orig.cc_no}</b></Link></span> : null}
          </div>
        </div>
      </section>

      <Progress status={c.status} />
      <ActionPanel d={d} reload={reload} />

      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <div className="panel">
            <h3>Invoices on this request</h3>
            {c.settlement?.length ? (
              <table className="t compact" style={{ marginTop: 8 }}>
                <thead><tr><th>Invoice</th><th className="hide-phone">Due</th><th className="num">Amount</th></tr></thead>
                <tbody>{c.settlement.map((s) => (
                  <tr key={s.entry_no}><td>{s.document_no}</td><td className="nowrap hide-phone">{day(s.due_date)}</td><td className="num">{money(s.amount)}</td></tr>
                ))}</tbody>
                <tfoot><tr><td>Total</td><td className="hide-phone" /><td className="num">{money(c.settlement.reduce((x, s) => x + Number(s.amount), 0))}</td></tr></tfoot>
              </table>
            ) : <p className="muted">No invoices.</p>}
            {c.settlement_instructions ? <Note kind="plain"><b>Settlement instructions:</b> {c.settlement_instructions}</Note> : null}
            {role === 'finance' && !c.settlement?.length && ['collected', 'received', 'deposited', 'closed'].includes(c.status) ? (
              <label className="check" style={{ marginTop: 8 }}>
                <input type="checkbox" checked={c.allow_unapplied} onChange={(e) => rpc('cc_set_allow_unapplied', { p_id: c.id, p_allow: e.target.checked }).then(reload)} />
                Export as unapplied (advance) to BC
              </label>
            ) : null}
          </div>

          <div className="panel">
            <h3>Pickup</h3>
            <div className="stack-s" style={{ marginTop: 8 }}>
              {c.contact_person || c.contact_phone ? (
                <div className="row">
                  <span>{c.contact_person}</span>
                  {c.contact_phone ? <a className="btn small" href={telHref(c.contact_phone)}><Icon name="phone" size={16} /> {c.contact_phone}</a> : null}
                </div>
              ) : null}
              {c.location_text ? <div style={{ whiteSpace: 'pre-wrap' }}>{c.location_text}</div> : null}
              {href ? <a className="btn small" href={href} target="_blank" rel="noreferrer"><Icon name="nav" size={16} /> Directions in Google Maps</a> : null}
              {c.lat != null ? <Suspense fallback={null}><MapView lat={c.lat} lng={c.lng} /></Suspense> : null}
              {c.notes ? <Note kind="plain"><b>Notes:</b> {c.notes}</Note> : null}
              {c.instructions ? <Note kind="plain"><b>For the driver:</b> {c.instructions}</Note> : null}
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <h3>Cheques</h3>
            {!cheques.length ? <p className="muted">Not collected yet.</p> : (
              <div className="stack-s" style={{ marginTop: 8 }}>
                {cheques.map((x) => (
                  <div key={x.id} className={'cheque-card' + (x.returned_at ? ' returned' : '')}>
                    <button type="button" className="ph" aria-label={`Photo of cheque ${x.cheque_no}`}>
                      {c.photos_deleted_at ? <span>Photo backed up and removed</span> : <Photo path={x.photo_path} alt={`Cheque ${x.cheque_no}`} onOpen={setViewer} />}
                    </button>
                    <div>
                      <div className="row between"><b>{x.cheque_no}</b><b className="money">{lkr(x.amount)}</b></div>
                      <div className="small muted">{x.bank}{x.branch ? `, ${x.branch}` : ''}. Dated {day(x.cheque_date)}{x.cheque_date > todayLK() ? ' (post-dated)' : ''}</div>
                      {allocByCheque(x.id).length ? (
                        <div className="small" style={{ marginTop: 4 }}>
                          {allocByCheque(x.id).map((a, i) => <div key={i}>{a.applied ? a.document_no : 'Unapplied advance'}: {money(a.amount)}</div>)}
                        </div>
                      ) : null}
                      {x.returned_at ? <div className="small" style={{ color: 'var(--red)', fontWeight: 650 }}>Returned {day(x.returned_at)}: {x.return_reason}</div> : null}
                      <div className="row" style={{ marginTop: 6 }}>
                        {role === 'finance' && ['collected', 'received'].includes(c.status) ? <button className="btn quiet small" onClick={() => setModal({ kind: 'fix', q: x })}>Correct details</button> : null}
                        {role === 'finance' && !x.returned_at && ['deposited', 'closed', 'returned'].includes(c.status) ? <button className="btn quiet small" style={{ color: 'var(--red)' }} onClick={() => setModal({ kind: 'return', q: x })}>Bank returned it</button> : null}
                      </div>
                    </div>
                  </div>
                ))}
                {c.split_at ? <p className="small muted">Split set {when(c.split_at)} by {nameOf(c.split_by)}. {(role === 'finance' && !(bc || []).some((b) => b.bc_docs?.post_status !== 'exported')) || (role === 'sales' && mineSales && c.status !== 'closed') ? <a href="#" onClick={(e) => { e.preventDefault(); setModal({ kind: 'split' }); }}>Change the split</a> : null}</p> : null}
              </div>
            )}
          </div>

          {deposit ? (
            <div className="panel">
              <h3>Deposit and bank</h3>
              <div className="stack-s small" style={{ marginTop: 8 }}>
                <div>Slip <b>{deposit.dep_no}</b>{deposit.reference ? ` (${deposit.reference})` : ''}, {lkr(deposit.slip_total)} to {deposit.bank_accounts?.name} on {day(deposit.deposit_date)}.</div>
                {deposit.slip_path ? <div><Photo path={deposit.slip_path} alt="Deposit slip" className="thumb" onOpen={setViewer} /></div> : null}
                {lines.length ? lines.map((l) => <div key={l.id}>Bank line {day(l.txn_date)}: {lkr(l.credit)} <span className="muted">{l.narration}</span></div>) : <div className="muted">Not seen in the bank yet.</div>}
                {role === 'finance' || role === 'executive' ? <Link to={`/deposits/${deposit.id}`}>Open the slip</Link> : null}
              </div>
            </div>
          ) : null}

          {bc?.length ? (
            <div className="panel">
              <h3>Business Central</h3>
              <div className="scroll-x" style={{ marginTop: 8 }}><table className="t compact">
                <thead><tr><th>Document</th><th>Invoice</th><th className="num">Amount</th><th>Status</th></tr></thead>
                <tbody>{bc.map((b) => (
                  <tr key={b.id}><td className="nowrap">{b.bc_docs?.doc_no}</td><td>{b.applies_doc_no || 'Unapplied'}</td><td className="num">{money(b.amount)}</td>
                    <td>{b.bc_docs?.post_status === 'posted' ? 'Posted' : b.bc_docs?.post_status === 'posted_diff' ? 'Posted with differences' : 'Not posted yet'}</td></tr>
                ))}</tbody>
              </table></div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="panel">
        <h3>History</h3>
        <ul className="timeline" style={{ marginTop: 12 }}>
          {events.map((e) => (
            <li key={e.id}>
              <div>{e.note || e.action}</div>
              <div className="when">{nameOf(e.actor)}, {when(e.created_at)}</div>
            </li>
          ))}
        </ul>
      </div>

      <div className="row">
        {canCancel ? <button className="btn quiet small" style={{ color: 'var(--red)' }} onClick={() => setModal({ kind: 'cancel' })}>Cancel this request</button> : null}
        {canReopen ? <button className="btn quiet small" onClick={() => setModal({ kind: 'reopen' })}>Reopen (unmatch from the bank)</button> : null}
      </div>

      {modal?.kind === 'cancel' ? (
        <ReasonModal title={`Cancel ${c.cc_no}`} label="Why is it being cancelled?" confirm="Cancel the request" danger
          onClose={() => setModal(null)} onConfirm={(t) => rpc('cc_cancel', { p_id: c.id, p_reason: t }).then(() => { toast('Request cancelled'); reload(); })} />
      ) : null}
      {modal?.kind === 'reopen' ? (
        <ReasonModal title={`Reopen ${c.cc_no}`} label="Why reopen it?" confirm="Reopen"
          extra={<Note kind="warn">Slip {deposit?.dep_no} is unmatched from the bank. Every collection on it goes back to "In bank?".</Note>}
          onClose={() => setModal(null)} onConfirm={(t) => rpc('cc_reopen', { p_id: c.id, p_reason: t }).then(() => { toast('Reopened'); reload(); })} />
      ) : null}
      {modal?.kind === 'fix' ? <FixChequeModal q={modal.q} onClose={() => setModal(null)} onDone={reload} /> : null}
      {modal?.kind === 'return' ? <ReturnChequeModal q={modal.q} onClose={() => setModal(null)} onDone={reload} /> : null}
      {modal?.kind === 'split' ? (
        <SplitModal c={c} cheques={cheques} alloc={alloc} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />
      ) : null}
      <PhotoViewer url={viewer} onClose={() => setViewer(null)} />
    </div>
  );
}

function SplitModal({ c, cheques, alloc, onClose, onDone }) {
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-label="Change the split">
        <div className="modal-head"><h2>Change the split</h2><button className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <div className="modal-body"><SplitForm c={c} cheques={cheques} alloc={alloc} onDone={onDone} /></div>
      </div>
    </div>
  );
}

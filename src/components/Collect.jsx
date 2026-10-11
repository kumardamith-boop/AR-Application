import { useEffect, useMemo, useRef, useState } from 'react';
import { rpc } from '../lib/supabase.js';
import { compressImage, newPath, uploadFile } from '../lib/files.js';
import { lkr, money, round2, same, todayLK, day, addDays } from '../lib/format.js';
import { Btn, ErrorNote, Field, Modal, Note } from './ui.jsx';
import Icon from './Icon.jsx';

export const SL_BANKS = [
  'Bank of Ceylon', "People's Bank", 'Commercial Bank', 'Hatton National Bank', 'Sampath Bank', 'Seylan Bank',
  'Nations Trust Bank', 'NDB Bank', 'DFCC Bank', 'Pan Asia Bank', 'Union Bank', 'Amana Bank', 'Cargills Bank',
  'National Savings Bank', 'HSBC', 'Standard Chartered', 'Citibank', 'Regional Development Bank', 'Sanasa Development Bank',
  'HDFC Bank', 'State Bank of India', 'Indian Bank', 'Indian Overseas Bank', 'MCB Bank', 'Habib Bank', 'Public Bank', 'Deutsche Bank',
];

export function BankList() {
  return <datalist id="sl-banks">{SL_BANKS.map((b) => <option key={b} value={b} />)}</datalist>;
}

function PhotoInput({ value, onChange }) {
  const ref = useRef(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!value) { setPreview(null); return undefined; }
    const u = URL.createObjectURL(value);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [value]);
  async function pick(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    try { onChange(await compressImage(f)); } finally { setBusy(false); }
  }
  return (
    <div className="photo-pick">
      {preview ? <img className="thumb" src={preview} alt="Cheque photo" /> : null}
      <input ref={ref} type="file" accept="image/*" capture="environment" onChange={pick} style={{ display: 'none' }} />
      <Btn className={preview ? '' : 'primary'} busy={busy} onClick={() => ref.current?.click()}>
        <Icon name="camera" size={18} /> {preview ? 'Retake photo' : 'Take a photo of the cheque'}
      </Btn>
    </div>
  );
}

const blankCheque = () => ({ cheque_no: '', bank: '', branch: '', cheque_date: todayLK(), amount: '', photo: null });

/** Record one or more cheques with photos. Used by drivers and by finance on their behalf. */
export function RecordCollection({ c, onDone, onCancel }) {
  const [cheques, setCheques] = useState([blankCheque()]);
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);
  const [stage, setStage] = useState('');
  const total = round2(cheques.reduce((s, q) => s + (Number(String(q.amount).replace(/,/g, '')) || 0), 0));
  const set = (i, k, v) => setCheques((cs) => cs.map((q, j) => (j === i ? { ...q, [k]: v } : q)));

  async function submit() {
    setErr(null);
    try {
      cheques.forEach((q, i) => {
        if (!q.photo) throw new Error(`Cheque ${i + 1}: take a photo of the cheque.`);
        if (!q.cheque_no.trim()) throw new Error(`Cheque ${i + 1}: type the cheque number.`);
        if (!(Number(String(q.amount).replace(/,/g, '')) > 0)) throw new Error(`Cheque ${i + 1}: type the amount.`);
      });
      const rows = [];
      for (let i = 0; i < cheques.length; i++) {
        setStage(`Uploading photo ${i + 1} of ${cheques.length}…`);
        const path = await uploadFile(newPath(String(c.id)), cheques[i].photo);
        const q = cheques[i];
        rows.push({ cheque_no: q.cheque_no, bank: q.bank, branch: q.branch, cheque_date: q.cheque_date, amount: Number(String(q.amount).replace(/,/g, '')), photo_path: path });
      }
      setStage('Saving…');
      await rpc('cc_collect', { p_id: c.id, p_cheques: rows, p_note: note || null });
      setStage('');
      onDone?.();
    } catch (e) {
      setStage('');
      setErr(e);
    }
  }

  return (
    <div className="stack">
      <BankList />
      {cheques.map((q, i) => {
        const future = q.cheque_date && q.cheque_date > todayLK();
        const stale = q.cheque_date && q.cheque_date < addDays(todayLK(), -183);
        return (
          <div key={i} className="panel stack" style={{ background: '#fcfbfd' }}>
            <div className="row between">
              <h3>Cheque {cheques.length > 1 ? i + 1 : ''}</h3>
              {cheques.length > 1 ? <button type="button" className="btn quiet small" onClick={() => setCheques((cs) => cs.filter((_, j) => j !== i))}>Remove</button> : null}
            </div>
            <PhotoInput value={q.photo} onChange={(f) => set(i, 'photo', f)} />
            <div className="grid2">
              <Field label="Cheque number"><input className="input" inputMode="numeric" value={q.cheque_no} onChange={(e) => set(i, 'cheque_no', e.target.value)} placeholder="6 digits, top left" /></Field>
              <Field label="Amount (LKR)"><input className="input num" inputMode="decimal" value={q.amount} onChange={(e) => set(i, 'amount', e.target.value)} /></Field>
              <Field label="Bank"><input className="input" list="sl-banks" value={q.bank} onChange={(e) => set(i, 'bank', e.target.value)} placeholder="Start typing" /></Field>
              <Field label="Date on the cheque"><input className="input" type="date" value={q.cheque_date} onChange={(e) => set(i, 'cheque_date', e.target.value)} /></Field>
            </div>
            {future ? <Note kind="warn">Post-dated: it can be deposited from {day(q.cheque_date)}.</Note> : null}
            {stale ? <Note kind="error">This cheque is older than 6 months. Banks won't accept it.</Note> : null}
          </div>
        );
      })}
      <Btn onClick={() => setCheques((cs) => [...cs, blankCheque()])}><Icon name="plus" size={18} /> Add another cheque</Btn>
      <Field label="Note (optional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: customer will send the balance next week" /></Field>
      {total > 0 && !same(total, c.expected_amount) ? (
        <Note kind="warn">Total {lkr(total)} is {total < c.expected_amount ? 'less' : 'more'} than the {lkr(c.expected_amount)} expected. That's fine; finance and sales will see it.</Note>
      ) : null}
      <ErrorNote error={err} />
      {stage ? <Note>{stage}</Note> : null}
      <div className="row">
        <Btn className="primary big" onClick={submit}>Save collection{total ? `: ${lkr(total)}` : ''}</Btn>
        {onCancel ? <Btn className="big" onClick={onCancel}>Cancel</Btn> : null}
      </div>
    </div>
  );
}

/** Say which invoices each cheque pays. */
export function SplitForm({ c, cheques, alloc, onDone }) {
  const invoices = c.settlement || [];
  const live = cheques.filter((q) => !q.returned_at);
  const initial = useMemo(() => {
    const m = {};
    for (const a of alloc || []) {
      if (!a.applied || !a.cheque_id) continue;
      m[`${a.cheque_id}:${a.entry_no}`] = String(a.amount);
    }
    return m;
  }, [alloc]);
  const [vals, setVals] = useState(initial);
  const [err, setErr] = useState(null);
  useEffect(() => setVals(initial), [initial]);
  const num = (v) => Number(String(v || '').replace(/,/g, '')) || 0;

  async function save() {
    setErr(null);
    const rows = [];
    for (const [k, v] of Object.entries(vals)) {
      const n = num(v);
      if (n > 0) { const [cq, en] = k.split(':'); rows.push({ cheque_id: Number(cq), entry_no: Number(en), amount: n }); }
    }
    try {
      await rpc('cc_split_cheques', { p_id: c.id, p_alloc: rows });
      onDone?.();
    } catch (e) { setErr(e); }
  }

  return (
    <div className="stack">
      <p className="muted">There are {live.length} cheques for {invoices.length} invoices. For each cheque, type how much goes to each invoice. Anything left over goes in as an unapplied advance.</p>
      {live.map((q) => {
        const used = round2(invoices.reduce((s, inv) => s + num(vals[`${q.id}:${inv.entry_no}`]), 0));
        const left = round2(Number(q.amount) - used);
        return (
          <div key={q.id} className="inv-list">
            <div className="inv-foot" style={{ borderTop: 0, borderBottom: '1px solid var(--line)' }}><span>Cheque {q.cheque_no}, {q.bank}</span><span className="money">{lkr(q.amount)}</span></div>
            {invoices.map((inv) => {
              const k = `${q.id}:${inv.entry_no}`;
              return (
                <div key={k} className="inv-row split">
                  <div className="inv-main"><b>{inv.document_no}</b><div className="small muted">{money(inv.amount)} on this request, due {day(inv.due_date)}</div></div>
                  <div className="inv-amt"><input className="input num inline" inputMode="decimal" value={vals[k] || ''} placeholder="0.00"
                    onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))} aria-label={`Cheque ${q.cheque_no} to ${inv.document_no}`} /></div>
                </div>
              );
            })}
            <div className="inv-foot" style={{ fontWeight: 600, color: left < -0.005 ? 'var(--red)' : undefined }}>
              <span>{left < -0.005 ? 'Over the cheque by' : left > 0.005 ? 'Left as unapplied advance' : 'Cheque fully used'}</span>
              <span className="money">{Math.abs(left) > 0.005 ? money(Math.abs(left)) : ''}</span>
            </div>
          </div>
        );
      })}
      {invoices.map((inv) => {
        const got = round2(live.reduce((s, q) => s + num(vals[`${q.id}:${inv.entry_no}`]), 0));
        return got > Number(inv.amount) + 0.005 ? <Note key={inv.entry_no} kind="error">{inv.document_no} gets {lkr(got)}, more than its {lkr(inv.amount)}.</Note> : null;
      })}
      <ErrorNote error={err} />
      <Btn className="primary" onClick={save}>Save the split</Btn>
    </div>
  );
}

export function FixChequeModal({ q, onClose, onDone }) {
  const [v, setV] = useState({ cheque_no: q.cheque_no, bank: q.bank || '', branch: q.branch || '', cheque_date: q.cheque_date || '', amount: String(q.amount) });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  async function save() {
    setErr(null);
    try { await rpc('cc_fix_cheque', { p_cheque: q.id, p: { ...v, amount: Number(String(v.amount).replace(/,/g, '')) } }); onDone(); onClose(); } catch (e) { setErr(e); }
  }
  return (
    <Modal title={`Correct cheque ${q.cheque_no}`} onClose={onClose} footer={<><Btn onClick={onClose}>Close</Btn><Btn className="primary" onClick={save}>Save correction</Btn></>}>
      <div className="stack">
        <BankList />
        <p className="muted small">Use this when the paper cheque doesn't match what was typed. If the total changes, any split is cleared.</p>
        <div className="grid2">
          <Field label="Cheque number"><input className="input" value={v.cheque_no} onChange={set('cheque_no')} /></Field>
          <Field label="Amount (LKR)"><input className="input num" value={v.amount} onChange={set('amount')} /></Field>
          <Field label="Bank"><input className="input" list="sl-banks" value={v.bank} onChange={set('bank')} /></Field>
          <Field label="Date on the cheque"><input className="input" type="date" value={v.cheque_date} onChange={set('cheque_date')} /></Field>
        </div>
        <ErrorNote error={err} />
      </div>
    </Modal>
  );
}

export function ReturnChequeModal({ q, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [doc, setDoc] = useState('');
  const [err, setErr] = useState(null);
  async function save() {
    setErr(null);
    try { await rpc('cc_return_cheque', { p_cheque: q.id, p_reason: reason, p_bc_doc: doc || null }); onDone(); onClose(); } catch (e) { setErr(e); }
  }
  return (
    <Modal title={`Cheque ${q.cheque_no} returned by the bank`} onClose={onClose}
      footer={<><Btn onClick={onClose}>Keep it</Btn><Btn className="danger solid" onClick={save}>Mark returned</Btn></>}>
      <div className="stack">
        <p className="muted small">The collection moves to Returned and sales is asked to raise a replacement. Reverse the receipt in Business Central yourself; the BC check shows when it's posted.</p>
        <Field label="Reason from the bank"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: Refer to drawer" autoFocus /></Field>
        <Field label="BC reversal document no. (optional)" hint="If you post the reversal under a new number, type it so the BC check can find it.">
          <input className="input" value={doc} onChange={(e) => setDoc(e.target.value)} />
        </Field>
        <ErrorNote error={err} />
      </div>
    </Modal>
  );
}

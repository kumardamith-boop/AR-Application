import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/ctx.jsx';
import { supabase, q, rpc } from '../lib/supabase.js';
import { day, lkr, money, round2, same, when } from '../lib/format.js';
import { Btn, Dept, ErrorNote, Field, Loading, Note, Seg } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

const MapPicker = lazy(() => import('../components/MapPin.jsx'));

function CustomerSearch({ value, onPick, disabled }) {
  const [text, setText] = useState('');
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = text.trim();
    if (t.length < 2) { setList([]); return undefined; }
    const h = setTimeout(async () => {
      const safe = t.replace(/[%,()]/g, ' ');
      const rows = await q(supabase.from('customers').select('customer_no, name, phone, contact, in_latest_list')
        .or(`name.ilike.%${safe}%,customer_no.ilike.%${safe}%`).order('name').limit(25)).catch(() => []);
      setList(rows);
      setOpen(true);
    }, 220);
    return () => clearTimeout(h);
  }, [text]);

  if (value) {
    return (
      <div className="row between panel" style={{ padding: '10px 14px' }}>
        <div>
          <b>{value.name}</b>
          <div className="small muted">{value.customer_no}{value.phone ? `, ${value.phone}` : ''}</div>
        </div>
        {!disabled ? <button type="button" className="btn quiet small" onClick={() => onPick(null)}>Change</button> : null}
      </div>
    );
  }
  return (
    <div style={{ position: 'relative' }}>
      <input className="input" placeholder="Type part of the customer name or code" value={text}
        onChange={(e) => setText(e.target.value)} onFocus={() => setOpen(true)} aria-label="Customer" />
      {open && list.length ? (
        <div className="bell-pop" style={{ left: 0, right: 0, width: 'auto' }}>
          {list.map((c) => (
            <a key={c.customer_no} href="#" className="n" onClick={(e) => { e.preventDefault(); onPick(c); setOpen(false); setText(''); }}>
              <b>{c.name}</b>
              <small>{c.customer_no}{c.in_latest_list ? '' : ' (not in the latest BC list)'}</small>
            </a>
          ))}
        </div>
      ) : null}
      {open && text.trim().length >= 2 && !list.length ? <p className="small muted" style={{ marginTop: 6 }}>No customer matches. Finance uploads the customer list from BC.</p> : null}
    </div>
  );
}

export default function Request() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const replacesId = params.get('replaces');
  const nav = useNavigate();
  const { role, myDepts, depts, toast } = useApp();
  const editing = Boolean(id);

  const [loadErr, setLoadErr] = useState(null);
  const [ready, setReady] = useState(!editing && !replacesId);
  const [orig, setOrig] = useState(null);
  const [replaced, setReplaced] = useState(null);
  const [dept, setDept] = useState(myDepts.length === 1 ? myDepts[0] : '');
  const [customer, setCustomer] = useState(null);
  const [avail, setAvail] = useState(null);
  const [availErr, setAvailErr] = useState(null);
  const [picked, setPicked] = useState({}); // entry_no -> amount text
  const [order, setOrder] = useState([]); // entry_no in tick order
  const [instructions, setInstructions] = useState('');
  const [expected, setExpected] = useState('');
  const [expTouched, setExpTouched] = useState(false);
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');
  const [place, setPlace] = useState('');
  const [pin, setPin] = useState({ lat: null, lng: null });
  const [notes, setNotes] = useState('');
  const [mapOpen, setMapOpen] = useState(false);
  const [err, setErr] = useState(null);

  // load the request being edited, or the returned one being replaced
  useEffect(() => {
    const srcId = id || replacesId;
    if (!srcId) return;
    (async () => {
      try {
        const c = await q(supabase.from('collections').select('*').eq('id', srcId).single());
        const cust = await q(supabase.from('customers').select('customer_no, name, phone, contact, in_latest_list').eq('customer_no', c.customer_no).maybeSingle());
        setDept(c.department);
        setCustomer(cust || { customer_no: c.customer_no, name: c.customer_name });
        setContact(c.contact_person || ''); setPhone(c.contact_phone || ''); setPlace(c.location_text || '');
        setPin({ lat: c.lat, lng: c.lng });
        if (editing) {
          setOrig(c);
          setNotes(c.notes || ''); setInstructions(c.settlement_instructions || '');
          const p = {}; const o = [];
          for (const s of c.settlement || []) { p[s.entry_no] = String(s.amount); o.push(String(s.entry_no)); }
          setPicked(p); setOrder(o);
          setExpected(String(c.expected_amount)); setExpTouched(true);
        } else {
          setReplaced(c);
          setNotes(`Replacement for returned cheque ${c.cc_no}.`);
        }
        setReady(true);
      } catch (e) { setLoadErr(e); }
    })();
  }, [id, replacesId, editing]);

  // open invoices for this customer and department
  useEffect(() => {
    setAvail(null); setAvailErr(null);
    if (!customer || !dept) return;
    rpc('cc_available_invoices', {
      p_customer: customer.customer_no, p_department: dept,
      p_exclude: editing ? Number(id) : null, p_replaces: replaced ? replaced.id : (orig?.replaces_id || null),
    }).then((d) => {
      setAvail(d);
      if (replaced && !Object.keys(picked).length) {
        const p = {}; const o = [];
        for (const r of d.returned || []) { p[r.entry_no] = String(r.amount); o.push(String(r.entry_no)); }
        setPicked(p); setOrder(o);
      }
    }).catch(setAvailErr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.customer_no, dept, replaced, orig]);

  const invoices = avail?.invoices || [];
  const total = useMemo(() => round2(Object.values(picked).reduce((s, v) => s + (Number(String(v).replace(/,/g, '')) || 0), 0)), [picked]);
  useEffect(() => { if (!expTouched) setExpected(total ? String(total) : ''); }, [total, expTouched]);
  const expNum = Number(String(expected).replace(/,/g, '')) || 0;

  function toggle(inv) {
    const k = String(inv.entry_no);
    setPicked((p) => {
      const n = { ...p };
      if (k in n) delete n[k]; else n[k] = String(inv.available);
      return n;
    });
    setOrder((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));
  }

  async function save() {
    setErr(null);
    // Sales' order: as listed (oldest first), which is the order cheques are applied.
    const listed = invoices.map((i) => String(i.entry_no));
    const ordered = [...order].sort((a, b) => listed.indexOf(a) - listed.indexOf(b));
    const payload = {
      department: dept, customer_no: customer?.customer_no,
      invoices: ordered.map((k) => ({ entry_no: Number(k), amount: Number(String(picked[k]).replace(/,/g, '')) })),
      settlement_instructions: instructions, expected_amount: expected ? Number(String(expected).replace(/,/g, '')) : null,
      contact_person: contact, contact_phone: phone, location_text: place, lat: pin.lat, lng: pin.lng, notes,
      replaces_id: replaced?.id || null,
    };
    try {
      if (!dept) throw new Error('Pick the department first.');
      if (!customer) throw new Error('Pick the customer.');
      if (editing) {
        await rpc('cc_update_request', { p_id: Number(id), p: payload });
        toast('Request updated');
        nav(`/c/${id}`);
      } else {
        const r = await rpc('cc_create', { p: payload });
        toast(`${r.cc_no} sent to finance`);
        nav(`/c/${r.id}`);
      }
    } catch (e) { setErr(e); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }
  }

  if (loadErr) return <ErrorNote error={loadErr} />;
  if (!ready) return <Loading />;
  const deptChoices = depts.filter((d) => d.active && myDepts.includes(d.code));

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="page-head">
        <div>
          <h1>{editing ? `Change ${orig?.cc_no}` : replaced ? `Replacement for ${replaced.cc_no}` : 'New collection request'}</h1>
          <p>{editing ? 'The department stays the same.' : 'Finance gets it straight away and assigns a driver.'}</p>
        </div>
      </div>
      <div className="stack">
        <div className="panel stack">
          <h2>1. Department</h2>
          {editing || replaced || deptChoices.length === 1 ? (
            <div className="row"><Dept code={dept} /> <span className="muted small">{depts.find((d) => d.code === dept)?.name}</span></div>
          ) : (
            <Seg value={dept} onChange={(v) => { setDept(v); setPicked({}); setOrder([]); }}
              options={deptChoices.map((d) => ({ value: d.code, label: d.code === d.name ? d.code : `${d.code}: ${d.name}` }))} />
          )}
          {!dept ? <p className="small muted">A cheque pays invoices of one department only. Pick it first.</p> : null}
        </div>

        <div className="panel stack">
          <h2>2. Customer</h2>
          <CustomerSearch value={customer} onPick={(c) => { setCustomer(c); setPicked({}); setOrder([]); if (c && !contact) { setContact(c.contact || ''); setPhone(c.phone || ''); } }} disabled={editing || !!replaced} />
        </div>

        <div className="panel stack">
          <div className="row between">
            <h2>3. Invoices this cheque pays</h2>
            {avail?.ledger ? <span className="small muted">Invoice list uploaded {when(avail.ledger.done_at)} by {avail.ledger.done_by}</span> : null}
          </div>
          <ErrorNote error={availErr} />
          {!customer || !dept ? <p className="muted">Pick the department and customer to see their open invoices.</p>
            : !avail ? <Loading text="Loading invoices…" />
              : invoices.length === 0 ? <Note kind="plain">No open {dept} invoices for this customer. If the cheque is an advance or pays something else, write settlement instructions below.</Note>
                : (
                  <div className="inv-list">
                    {invoices.map((inv) => {
                      const k = String(inv.entry_no);
                      const on = k in picked;
                      return (
                        <div key={k} className={'inv-row' + (on ? ' on' : '') + (!inv.selectable ? ' dim' : '')}>
                          <input id={`inv-${k}`} type="checkbox" checked={on} disabled={!inv.selectable} onChange={() => toggle(inv)} aria-label={`Pick ${inv.document_no}`} />
                          <label htmlFor={`inv-${k}`} className="inv-main">
                            <b>{inv.document_no}</b>
                            <div className="small muted">{inv.document_type || 'Entry'} of {day(inv.posting_date)}, due {day(inv.due_date)}</div>
                            {inv.external_document_no ? <div className="small muted">PO {inv.external_document_no}</div> : null}
                            {inv.reason ? <div className="small" style={{ color: 'var(--red)' }}>{inv.reason}</div> : null}
                            {Number(inv.covered) > 0 ? <div className="small" style={{ color: 'var(--amber)' }}>{lkr(inv.covered)} already on {(inv.covered_by || []).join(', ')}</div> : null}
                            {inv.from_returned ? <div className="small" style={{ color: 'var(--red)' }}>From the returned cheque</div> : null}
                          </label>
                          <div className="inv-amt">
                            <div className="money">{money(inv.available)}</div>
                            {on ? (
                              <input className="input num inline" inputMode="decimal" value={picked[k]}
                                onChange={(e) => setPicked((p) => ({ ...p, [k]: e.target.value }))} aria-label={`Amount for ${inv.document_no}`} />
                            ) : <div className="small faint">open</div>}
                          </div>
                        </div>
                      );
                    })}
                    <div className="inv-foot"><span>{Object.keys(picked).length} ticked</span><span className="money">{money(total)}</span></div>
                  </div>
                )}
          {avail?.credits?.length ? (
            <Note kind="warn">
              This customer also has {avail.credits.length} open {dept} credit{avail.credits.length > 1 ? 's' : ''} (unapplied payments or credit notes), {lkr(Math.abs(avail.credits.reduce((s, c) => s + Number(c.remaining), 0)))} in all. Check with finance before collecting the full amount.
            </Note>
          ) : null}
          <Field label="Settlement instructions" hint="Needed when no invoice applies, for example an advance for a purchase order.">
            <textarea className="input" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="For example: advance for PO 4500123, 50% of quotation Q-221" />
          </Field>
          <Field label="Amount you expect to collect (LKR)">
            <input className="input num" inputMode="decimal" value={expected} onChange={(e) => { setExpected(e.target.value); setExpTouched(true); }} style={{ maxWidth: 240 }} />
          </Field>
          {total > 0 && expNum > 0 && !same(expNum, total) ? (
            <Note kind="warn">
              {expNum < total
                ? <>Short payment: {lkr(total - expNum)} less than the ticked invoices. The cheque is applied to the oldest invoices first.</>
                : <>Over payment: {lkr(expNum - total)} more than the ticked invoices. The extra goes to the customer as an unapplied advance.</>}
            </Note>
          ) : null}
        </div>

        <div className="panel stack">
          <h2>4. Where to collect</h2>
          <div className="grid2">
            <Field label="Contact person"><input className="input" value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="off" /></Field>
            <Field label="Contact phone"><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="off" /></Field>
          </div>
          <Field label="Pickup address" hint="Building, floor, landmark: whatever helps the driver find it.">
            <textarea className="input" value={place} onChange={(e) => setPlace(e.target.value)} />
          </Field>
          <div className="row">
            <Btn onClick={() => setMapOpen(true)}><Icon name="pin" size={18} /> {pin.lat != null ? 'Move the map pin' : 'Drop a pin on the map'}</Btn>
            {pin.lat != null ? <span className="small muted">Pin saved ({Number(pin.lat).toFixed(5)}, {Number(pin.lng).toFixed(5)})</span> : <span className="small muted">Optional</span>}
          </div>
          <Field label="Notes for finance and the driver">
            <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="For example: cheque ready after 2 pm, ask for Mr. Perera at accounts" />
          </Field>
        </div>

        <ErrorNote error={err} />
        <div className="row">
          <Btn className="primary big" onClick={save}>{editing ? 'Save changes' : 'Send to finance'}</Btn>
          <Link to={editing ? `/c/${id}` : '/collections'} className="btn big">Cancel</Link>
          {total > 0 ? <span className="muted">Collecting {lkr(expNum || total)} for {Object.keys(picked).length} invoice{Object.keys(picked).length === 1 ? '' : 's'}</span> : null}
        </div>
      </div>
      {mapOpen ? (
        <Suspense fallback={null}>
          <MapPicker lat={pin.lat} lng={pin.lng} onClose={() => setMapOpen(false)} onSave={(lat, lng) => setPin({ lat, lng })} />
        </Suspense>
      ) : null}
    </div>
  );
}


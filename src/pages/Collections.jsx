import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/ctx.jsx';
import { supabase, q } from '../lib/supabase.js';
import { OPEN_STATUSES, day, lkr } from '../lib/format.js';
import { nextStep, waitingOnMe } from '../lib/flow.js';
import { Dept, Empty, ErrorNote, Loading, Seg, Stamp, useAsync } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

const COLS = 'id, cc_no, department, status, customer_no, customer_name, invoice_refs, expected_amount, collected_amount, amount_changed, driver_id, collection_date, created_by, created_at, updated_at, closed_at, split_needed, split_at, problem_note, cancel_reason, replaces_id, deposit_id';

export default function Collections() {
  const app = useApp();
  const { role, uid, tick, myDepts, depts } = app;
  const [params, setParams] = useSearchParams();
  const defaultTab = role === 'executive' ? 'open' : 'mine';
  const tab = params.get('tab') || defaultTab;
  const dept = params.get('dept') || 'all';
  const [search, setSearch] = useState(params.get('q') || '');
  const [term, setTerm] = useState(search);

  useEffect(() => { const t = setTimeout(() => setTerm(search.trim()), 300); return () => clearTimeout(t); }, [search]);

  const { data, loading, error } = useAsync(async () => {
    const open = await q(supabase.from('collections').select(COLS).in('status', [...OPEN_STATUSES, 'returned']).order('created_at', { ascending: false }).limit(2000));
    let closedQ = supabase.from('collections').select(COLS).in('status', ['closed', 'cancelled']).order('updated_at', { ascending: false }).limit(300);
    if (term) {
      const t = term.replace(/[%,()]/g, ' ');
      closedQ = supabase.from('collections').select(COLS).in('status', ['closed', 'cancelled'])
        .or(`customer_name.ilike.%${t}%,customer_no.ilike.%${t}%,cc_no.ilike.%${t}%,invoice_refs.ilike.%${t}%`)
        .order('updated_at', { ascending: false }).limit(300);
    }
    const closed = await q(closedQ);
    const repl = await q(supabase.from('collections').select('id, cc_no, replaces_id').not('replaces_id', 'is', null).neq('status', 'cancelled'));
    return { rows: [...open, ...closed], repl };
  }, [tick, term]);

  const replacedBy = useMemo(() => {
    const m = new Map();
    for (const r of data?.repl || []) m.set(r.replaces_id, r.cc_no);
    return m;
  }, [data]);
  const replacedIds = useMemo(() => new Set(replacedBy.keys()), [replacedBy]);

  const rows = useMemo(() => {
    let rs = data?.rows || [];
    if (dept !== 'all') rs = rs.filter((r) => r.department === dept);
    if (term) {
      const t = term.toLowerCase();
      rs = rs.filter((r) => [r.customer_name, r.customer_no, r.cc_no, r.invoice_refs].some((x) => (x || '').toLowerCase().includes(t)));
    }
    return rs;
  }, [data, dept, term]);

  const isOpen = (r) => OPEN_STATUSES.includes(r.status) || (r.status === 'returned' && !replacedIds.has(r.id));
  const mine = rows.filter((r) => waitingOnMe(r, app, replacedIds));
  const openRows = rows.filter(isOpen);
  const closedRows = rows.filter((r) => !isOpen(r));
  const shown = tab === 'mine' ? mine : tab === 'open' ? openRows : closedRows;
  const sorted = tab === 'closed' ? shown
    : [...shown].sort((a, b) => (a.collection_date || a.created_at).localeCompare(b.collection_date || b.created_at));

  const showDept = role === 'finance' || role === 'executive' || myDepts.length > 1;
  const setP = (k, v) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }); };

  const tabs = [
    ...(role !== 'executive' ? [{ value: 'mine', label: `For you (${mine.length})` }] : []),
    { value: 'open', label: `Open (${openRows.length})` },
    { value: 'closed', label: 'Closed' },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{role === 'driver' ? 'My jobs' : 'Collections'}</h1>
          <p>{role === 'sales' ? `Cheque collections for ${myDepts.join(' and ')}.` : role === 'driver' ? 'Jobs assigned to you.' : 'Every cheque collection for DT and EU.'}</p>
        </div>
        {role === 'sales' || role === 'finance' ? <Link to="/new" className="btn primary only-phone-flex"><Icon name="plus" size={18} /> New request</Link> : null}
      </div>

      <div className="row" style={{ marginBottom: 14 }}>
        <Seg value={tab} onChange={(v) => setP('tab', v === defaultTab ? '' : v)} options={tabs} />
        {showDept ? (
          <Seg value={dept} onChange={(v) => setP('dept', v === 'all' ? '' : v)}
            options={[{ value: 'all', label: 'All' }, ...depts.filter((d) => myDepts.includes(d.code)).map((d) => ({ value: d.code, label: d.code }))]} />
        ) : null}
        <input className="input grow" style={{ minWidth: 200, maxWidth: 360 }} type="search" placeholder="Search customer, CC number or invoice"
          value={search} onChange={(e) => { setSearch(e.target.value); setP('q', e.target.value); }} aria-label="Search" />
      </div>

      <ErrorNote error={error} />
      {loading && !data ? <Loading /> : (
        <div className="list">
          {sorted.length === 0 ? (
            tab === 'mine' ? (
              <Empty title="Nothing waiting for you">
                {role === 'sales' ? 'Raise a new request when a customer has a cheque ready.' : role === 'driver' ? 'New jobs appear here when finance assigns them to you.' : 'New requests and cheques to receive, deposit or match show up here.'}
              </Empty>
            ) : term ? <Empty title="No matches">Try part of the customer name, the CC number or an invoice number.</Empty>
              : <Empty title={tab === 'open' ? 'No open collections' : 'Nothing closed yet'}>
                {tab === 'open' && (role === 'sales' || role === 'finance') ? <Link to="/new" className="btn primary">Raise a request</Link> : null}
              </Empty>
          ) : sorted.map((c) => (
            <Link to={`/c/${c.id}`} className="item" key={c.id}>
              <div style={{ minWidth: 0 }}>
                <div className="who">{c.customer_name}</div>
                <div className="meta">
                  <span>{c.cc_no}</span>
                  {showDept || role === 'driver' ? <Dept code={c.department} /> : null}
                  <span>{day(c.created_at)}</span>
                </div>
              </div>
              <div className="inv hide-phone" title={c.invoice_refs}>{c.invoice_refs || 'No invoice: see instructions'}</div>
              <div className="next">
                {nextStep(c, app.nameOf, replacedBy.get(c.id))}
                {c.problem_note && c.status === 'assigned' ? <div className="flag small">Couldn't collect: {c.problem_note}</div> : null}
              </div>
              <div className="amt">
                {lkr(c.collected_amount ?? c.expected_amount)}
                {c.amount_changed ? <div className="small flag">Expected {lkr(c.expected_amount)}</div> : null}
              </div>
              <div className="st"><Stamp status={c.status} /></div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

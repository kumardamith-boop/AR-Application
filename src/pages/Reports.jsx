import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/ctx.jsx';
import { supabase, q, qAll } from '../lib/supabase.js';
import { OPEN_STATUSES, STATUS, day, daysBetween, isoDay, money, round2, todayLK } from '../lib/format.js';
import { downloadSheet } from '../lib/journal.js';
import { Btn, Dept, Empty, ErrorNote, Field, Loading, Seg, useAsync } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

const AGE = [[0, 2, '0–2 days'], [3, 7, '3–7 days'], [8, 14, '8–14 days'], [15, 99999, '15+ days']];

function stageSince(c) {
  return { submitted: c.created_at, assigned: c.assigned_at, collected: c.collected_at, received: c.received_at, deposited: c.deposited_at }[c.status] || c.created_at;
}

function Download({ name, header, rows }) {
  return <Btn className="small" onClick={() => downloadSheet(`${name} ${todayLK()}.xlsx`, header, rows)}><Icon name="download" size={16} /> Excel</Btn>;
}

function OpenByStage({ cols, depts, nameOf }) {
  const today = todayLK();
  const open = cols.filter((c) => OPEN_STATUSES.includes(c.status));
  const rows = open.map((c) => ({ ...c, age: daysBetween(isoDay(stageSince(c)), today) }));
  const cell = (st, d) => {
    const xs = rows.filter((r) => r.status === st && r.department === d);
    return xs.length ? <>{xs.length}<div className="small muted">{money(xs.reduce((s, r) => s + Number(r.collected_amount ?? r.expected_amount), 0))}</div></> : <span className="faint">0</span>;
  };
  return (
    <div className="stack">
      <div className="row between"><h2>Open collections by stage</h2>
        <Download name="Open collections" header={['CC number', 'Department', 'Customer', 'Stage', 'Days in stage', 'Amount', 'Driver', 'Raised by', 'Invoices']}
          rows={rows.map((r) => [r.cc_no, r.department, r.customer_name, STATUS[r.status].label, r.age, Number(r.collected_amount ?? r.expected_amount), nameOf(r.driver_id), nameOf(r.created_by), r.invoice_refs])} />
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Stage</th>{depts.map((d) => <th key={d.code} className="num"><Dept code={d.code} /></th>)}{AGE.map((a) => <th key={a[2]} className="num">{a[2]}</th>)}</tr></thead>
          <tbody>{OPEN_STATUSES.map((st) => (
            <tr key={st}>
              <td><span className={`stamp ${STATUS[st].tone}`}>{STATUS[st].label}</span></td>
              {depts.map((d) => <td key={d.code} className="num">{cell(st, d.code)}</td>)}
              {AGE.map((a) => { const n = rows.filter((r) => r.status === st && r.age >= a[0] && r.age <= a[1]).length; return <td key={a[2]} className="num" style={{ color: n && a[0] >= 8 ? 'var(--red)' : undefined }}>{n || <span className="faint">0</span>}</td>; })}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="small muted">Age counts days since the collection reached its current stage.</p>
    </div>
  );
}

function PendingDeposits({ deps }) {
  const today = todayLK();
  const open = deps.filter((d) => d.status === 'open');
  return (
    <div className="stack">
      <div className="row between"><h2>Deposits not yet seen in the bank</h2>
        <Download name="Deposits not in bank" header={['Slip', 'Deposited', 'Days', 'Account', 'Total', 'Collections']}
          rows={open.map((d) => [d.dep_no, d.deposit_date, daysBetween(d.deposit_date, today), d.bank_accounts?.name, Number(d.slip_total), (d.collections || []).map((c) => c.cc_no).join(', ')])} />
      </div>
      <div className="table-wrap">
        {!open.length ? <Empty title="Every slip is in the bank" /> : (
          <table className="t"><thead><tr><th>Slip</th><th>Deposited</th><th className="num">Days</th><th>Account</th><th>Collections</th><th className="num">Total</th></tr></thead>
            <tbody>{open.map((d) => (
              <tr key={d.id} className={daysBetween(d.deposit_date, today) > 3 ? 'hl' : ''}><td><Link to={`/deposits/${d.id}`}>{d.dep_no}</Link></td><td>{day(d.deposit_date)}</td><td className="num">{daysBetween(d.deposit_date, today)}</td>
                <td>{d.bank_accounts?.name}</td><td className="small">{(d.collections || []).map((c) => c.cc_no).join(', ')}</td><td className="num">{money(d.slip_total)}</td></tr>
            ))}</tbody></table>
        )}
      </div>
    </div>
  );
}

function Unidentified({ lines }) {
  return (
    <div className="stack">
      <div className="row between"><h2>Unidentified credits</h2>
        <Download name="Unidentified credits" header={['Account', 'Date', 'Description', 'Reference', 'Credit']}
          rows={lines.map((l) => [l.bank_accounts?.name, l.txn_date, l.narration, l.reference, Number(l.credit)])} />
      </div>
      <p className="muted small">Money in the bank that is not matched to a deposit slip and not tagged. Tag customer transfers and internal transfers on the account's statement page.</p>
      <div className="table-wrap">
        {!lines.length ? <Empty title="Every credit is identified" /> : (
          <table className="t compact"><thead><tr><th>Account</th><th>Date</th><th>Description</th><th className="num">Credit</th></tr></thead>
            <tbody>{lines.map((l) => (
              <tr key={l.id}><td><Link to={`/bank/${l.account_id}?show=unidentified`}>{l.bank_accounts?.name}</Link></td><td className="nowrap">{day(l.txn_date)}</td><td className="small">{l.narration}</td><td className="num">{money(l.credit)}</td></tr>
            ))}</tbody></table>
        )}
      </div>
    </div>
  );
}

function Returned({ cols, nameOf }) {
  const replaced = new Set(cols.filter((c) => c.replaces_id && c.status !== 'cancelled').map((c) => c.replaces_id));
  const rows = cols.filter((c) => c.status === 'returned' && !replaced.has(c.id));
  return (
    <div className="stack">
      <div className="row between"><h2>Returned cheques without a replacement</h2>
        <Download name="Returned without replacement" header={['CC number', 'Department', 'Customer', 'Returned', 'Reason', 'Amount', 'Raised by']}
          rows={rows.map((c) => [c.cc_no, c.department, c.customer_name, isoDay(c.returned_at), c.return_reason, Number(c.collected_amount), nameOf(c.created_by)])} />
      </div>
      <div className="table-wrap">
        {!rows.length ? <Empty title="Nothing waiting for a replacement" /> : (
          <table className="t"><thead><tr><th>Collection</th><th>Returned</th><th>Reason</th><th>Sales</th><th className="num">Amount</th><th /></tr></thead>
            <tbody>{rows.map((c) => (
              <tr key={c.id}><td><Link to={`/c/${c.id}`}>{c.cc_no}</Link> <Dept code={c.department} /><div className="small muted">{c.customer_name}</div></td>
                <td>{day(c.returned_at)}</td><td className="small">{c.return_reason}</td><td>{nameOf(c.created_by)}</td><td className="num">{money(c.collected_amount)}</td>
                <td><Link className="btn small" to={`/new?replaces=${c.id}`}>Raise a replacement</Link></td></tr>
            ))}</tbody></table>
        )}
      </div>
    </div>
  );
}

function PerPerson({ cols, nameOf, depts }) {
  const [from, setFrom] = useState(todayLK().slice(0, 8) + '01');
  const [to, setTo] = useState(todayLK());
  const inRange = (ts) => ts && isoDay(ts) >= from && isoDay(ts) <= to;
  const drivers = useMemo(() => {
    const m = {};
    for (const c of cols) if (inRange(c.collected_at) && c.status !== 'cancelled') {
      const k = c.driver_id || 'none';
      m[k] = m[k] || { n: 0, amt: 0, by: {} };
      m[k].n++; m[k].amt = round2(m[k].amt + Number(c.collected_amount || 0));
      m[k].by[c.department] = (m[k].by[c.department] || 0) + 1;
    }
    return Object.entries(m).sort((a, b) => b[1].amt - a[1].amt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, from, to]);
  const sales = useMemo(() => {
    const m = {};
    for (const c of cols) if (inRange(c.created_at) && c.status !== 'cancelled') {
      const k = c.created_by;
      m[k] = m[k] || { n: 0, amt: 0, closed: 0, by: {} };
      m[k].n++; m[k].amt = round2(m[k].amt + Number(c.expected_amount || 0));
      if (c.status === 'closed') m[k].closed++;
      m[k].by[c.department] = (m[k].by[c.department] || 0) + 1;
    }
    return Object.entries(m).sort((a, b) => b[1].amt - a[1].amt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, from, to]);
  return (
    <div className="stack">
      <div className="row">
        <Field label="From"><input className="input inline" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input className="input inline" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <div className="row between"><h2>Collected per driver</h2>
        <Download name="Per driver" header={['Driver', 'Collections', 'Amount', ...depts.map((d) => d.code)]} rows={drivers.map(([k, v]) => [nameOf(k) || 'Finance', v.n, v.amt, ...depts.map((d) => v.by[d.code] || 0)])} />
      </div>
      <div className="table-wrap">
        {!drivers.length ? <Empty title="No collections in this period" /> : (
          <table className="t"><thead><tr><th>Driver</th><th className="num">Collections</th>{depts.map((d) => <th key={d.code} className="num">{d.code}</th>)}<th className="num">Collected</th></tr></thead>
            <tbody>{drivers.map(([k, v]) => <tr key={k}><td>{k === 'none' ? 'Recorded by finance' : nameOf(k)}</td><td className="num">{v.n}</td>{depts.map((d) => <td key={d.code} className="num">{v.by[d.code] || 0}</td>)}<td className="num">{money(v.amt)}</td></tr>)}</tbody></table>
        )}
      </div>
      <div className="row between"><h2>Requested per sales person</h2>
        <Download name="Per sales person" header={['Raised by', 'Requests', 'Closed', 'Expected amount', ...depts.map((d) => d.code)]} rows={sales.map(([k, v]) => [nameOf(k), v.n, v.closed, v.amt, ...depts.map((d) => v.by[d.code] || 0)])} />
      </div>
      <div className="table-wrap">
        {!sales.length ? <Empty title="No requests in this period" /> : (
          <table className="t"><thead><tr><th>Raised by</th><th className="num">Requests</th><th className="num">Closed</th>{depts.map((d) => <th key={d.code} className="num">{d.code}</th>)}<th className="num">Expected</th></tr></thead>
            <tbody>{sales.map(([k, v]) => <tr key={k}><td>{nameOf(k)}</td><td className="num">{v.n}</td><td className="num">{v.closed}</td>{depts.map((d) => <td key={d.code} className="num">{v.by[d.code] || 0}</td>)}<td className="num">{money(v.amt)}</td></tr>)}</tbody></table>
        )}
      </div>
    </div>
  );
}

export default function Reports() {
  const { role, tick, depts, myDepts, nameOf } = useApp();
  const [tab, setTab] = useState('stage');
  const [dept, setDept] = useState('all');
  const finance = role === 'finance' || role === 'executive';
  const { data, loading, error } = useAsync(async () => {
    const cols = await qAll(() => supabase.from('collections').select('id, cc_no, department, status, customer_name, expected_amount, collected_amount, driver_id, created_by, created_at, assigned_at, collected_at, received_at, deposited_at, closed_at, returned_at, return_reason, replaces_id, invoice_refs').order('id'));
    const deps = await q(supabase.from('deposits').select('*, bank_accounts(name), collections(cc_no, department)').eq('status', 'open').order('deposit_date'));
    const lines = finance ? await q(supabase.from('statement_lines').select('*, bank_accounts(name)').is('link_kind', null).gt('credit', 0).order('txn_date', { ascending: false }).limit(2000)) : [];
    return { cols, deps, lines };
  }, [tick, finance]);
  const shownDepts = depts.filter((d) => myDepts.includes(d.code) && (dept === 'all' || d.code === dept));
  const cols = (data?.cols || []).filter((c) => dept === 'all' || c.department === dept);
  const deps = (data?.deps || []).filter((d) => dept === 'all' || (d.collections || []).some((c) => c.department === dept));
  const tabs = [
    { value: 'stage', label: 'Open by stage' },
    { value: 'deposits', label: 'Not in bank yet' },
    ...(finance ? [{ value: 'unid', label: 'Unidentified credits' }] : []),
    { value: 'returned', label: 'Returned' },
    { value: 'people', label: 'Per driver and sales person' },
  ];
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}><div><h1>Reports</h1><p>Each report downloads to Excel.</p></div>
        {myDepts.length > 1 ? <Seg value={dept} onChange={setDept} options={[{ value: 'all', label: 'All' }, ...depts.filter((d) => myDepts.includes(d.code)).map((d) => ({ value: d.code, label: d.code }))]} /> : null}
      </div>
      <div className="tabs" role="tablist">{tabs.map((t) => <button key={t.value} role="tab" aria-selected={tab === t.value} className={tab === t.value ? 'on' : ''} onClick={() => setTab(t.value)}>{t.label}</button>)}</div>
      <ErrorNote error={error} />
      {loading && !data ? <Loading /> : (
        tab === 'stage' ? <OpenByStage cols={cols} depts={shownDepts} nameOf={nameOf} />
          : tab === 'deposits' ? <PendingDeposits deps={deps} />
            : tab === 'unid' ? <Unidentified lines={data.lines} />
              : tab === 'returned' ? <Returned cols={cols} nameOf={nameOf} />
                : <PerPerson cols={cols} nameOf={nameOf} depts={shownDepts} />
      )}
    </div>
  );
}

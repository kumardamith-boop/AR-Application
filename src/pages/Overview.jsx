import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/ctx.jsx';
import { rpc } from '../lib/supabase.js';
import { OPEN_STATUSES, STATUS, day, lkr, money } from '../lib/format.js';
import { Dept, Empty, ErrorNote, Loading, useAsync } from '../components/ui.jsx';

const DEPT_COLOR = { DT: '#8e2a8c', EU: '#2457a6' };
const FALLBACK = ['#0d716d', '#9a5a00'];

function compact(n) {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
  if (a >= 1e3) return Math.round(n / 1e3) + 'K';
  return String(Math.round(n));
}

function WeeklyChart({ weekly, depts }) {
  const [table, setTable] = useState(false);
  const weeks = [...new Set(weekly.map((w) => w.week))].sort();
  const codes = depts.map((d) => d.code);
  const color = (c, i) => DEPT_COLOR[c] || FALLBACK[i % FALLBACK.length];
  const val = (wk, c) => Number(weekly.find((w) => w.week === wk && w.department === c)?.collected || 0);
  const max = Math.max(1, ...weeks.flatMap((wk) => codes.map((c) => val(wk, c))));
  const nice = (() => { const p = 10 ** Math.floor(Math.log10(max)); const m = max / p; return (m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; })();
  const W = 560, H = 230, L = 46, B = 28, T = 10;
  const slot = (W - L) / weeks.length;
  const bw = Math.min(22, (slot - 18) / codes.length - 2);
  const y = (v) => T + (H - T - B) * (1 - v / nice);
  const bar = (x, v) => {
    const top = y(v), base = H - B, r = Math.min(4, Math.max(0, base - top));
    if (v <= 0) return '';
    return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${base} Z`;
  };
  const label = (wk) => { const [, m, d] = wk.split('-'); return `${Number(d)} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]}`; };
  return (
    <div className="panel">
      <div className="row between">
        <h3>Collected per week</h3>
        <div className="row">
          <div className="legend">{codes.map((c, i) => <span key={c}><i style={{ background: color(c, i) }} />{c}</span>)}</div>
          <button className="btn quiet small" onClick={() => setTable((t) => !t)}>{table ? 'Show chart' : 'Show as table'}</button>
        </div>
      </div>
      {table ? (
        <table className="t compact" style={{ marginTop: 10 }}>
          <thead><tr><th>Week of</th>{codes.map((c) => <th key={c} className="num">{c}</th>)}</tr></thead>
          <tbody>{weeks.map((wk) => <tr key={wk}><td>{day(wk)}</td>{codes.map((c) => <td key={c} className="num">{money(val(wk, c))}</td>)}</tr>)}</tbody>
        </table>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Amount collected per week by department" style={{ marginTop: 10, display: 'block' }}>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={L} x2={W} y1={y(nice * f)} y2={y(nice * f)} stroke="#ecebef" strokeWidth="1" />
              <text x={L - 6} y={y(nice * f) + 4} textAnchor="end" fontSize="13" fill="#8a8790">{compact(nice * f)}</text>
            </g>
          ))}
          {weeks.map((wk, i) => {
            const x0 = L + i * slot + (slot - codes.length * (bw + 2)) / 2;
            return (
              <g key={wk}>
                {codes.map((c, j) => {
                  const v = val(wk, c);
                  const x = x0 + j * (bw + 2);
                  return (
                    <g key={c}>
                      <rect x={x - 3} y={T} width={bw + 6} height={H - T - B} fill="transparent"><title>{`Week of ${day(wk)}, ${c}: ${lkr(v)}`}</title></rect>
                      <path d={bar(x, v)} fill={color(c, j)}><title>{`Week of ${day(wk)}, ${c}: ${lkr(v)}`}</title></path>
                    </g>
                  );
                })}
                <text x={L + i * slot + slot / 2} y={H - 8} textAnchor="middle" fontSize="13" fill="#5d5a63">{label(wk)}</text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

export default function Overview() {
  const { tick, depts } = useApp();
  const { data, loading, error } = useAsync(() => rpc('cc_overview'), [tick]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  const active = depts.filter((d) => d.active);
  const prog = (st, d) => data.in_progress.find((x) => x.status === st && x.department === d) || { count: 0, amount: 0 };
  const monthName = new Date(data.month + 'T00:00:00').toLocaleString('en-GB', { month: 'long' });
  const openReturned = data.returned.filter((r) => !r.replacement);
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}><div><h1>Overview</h1><p>Cheque collections for DT and EU, as of {day(data.today)}.</p></div></div>

      <div className="stats">
        {data.this_month.map((m) => (
          <div className="stat" key={m.department}>
            <div className="k"><Dept code={m.department} /> collected in {monthName}</div>
            <div className="v">{lkr(m.collected)}</div>
            <div className="s">{m.collected_count} collection{m.collected_count === 1 ? '' : 's'}. Deposited {lkr(m.deposited)}. In the bank {lkr(m.closed)}.</div>
          </div>
        ))}
        <div className="stat"><div className="k">Overdue pickups</div><div className="v" style={{ color: data.overdue.length ? 'var(--red)' : undefined }}>{data.overdue.length}</div><div className="s">Past their collection date</div></div>
        <div className="stat"><div className="k">Returned, no replacement</div><div className="v" style={{ color: openReturned.length ? 'var(--red)' : undefined }}>{openReturned.length}</div><div className="s">{lkr(openReturned.reduce((s, r) => s + Number(r.amount || 0), 0))}</div></div>
      </div>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>In progress</th>{active.map((d) => <th key={d.code} className="num"><Dept code={d.code} /></th>)}</tr></thead>
            <tbody>{OPEN_STATUSES.map((st) => (
              <tr key={st}><td><span className={`stamp ${STATUS[st].tone}`}>{STATUS[st].label}</span></td>
                {active.map((d) => { const p = prog(st, d.code); return <td key={d.code} className="num">{p.count || <span className="faint">0</span>}{p.count ? <div className="small muted">{money(p.amount)}</div> : null}</td>; })}</tr>
            ))}</tbody>
          </table>
        </div>
        <WeeklyChart weekly={data.weekly} depts={active} />
      </div>

      <div className="section-title"><h2>Stuck for more than {data.stuck_days} days</h2></div>
      <div className="table-wrap">
        {!data.stuck.length ? <Empty title="Nothing is stuck" /> : (
          <table className="t compact"><thead><tr><th>Collection</th><th>Stage</th><th className="num">Days</th><th className="num">Amount</th></tr></thead>
            <tbody>{data.stuck.map((s) => (
              <tr key={s.id}><td><Link to={`/c/${s.id}`}>{s.cc_no}</Link> <Dept code={s.department} /><div className="small muted">{s.customer_name}</div></td>
                <td><span className={`stamp ${STATUS[s.status].tone}`}>{STATUS[s.status].label}</span></td><td className="num">{s.days}</td><td className="num">{money(s.amount)}</td></tr>
            ))}</tbody></table>
        )}
      </div>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <div>
          <div className="section-title"><h2>Overdue pickups</h2></div>
          <div className="table-wrap">
            {!data.overdue.length ? <Empty title="No overdue pickups" /> : (
              <table className="t compact"><tbody>{data.overdue.map((o) => (
                <tr key={o.id}><td><Link to={`/c/${o.id}`}>{o.cc_no}</Link> <Dept code={o.department} /><div className="small muted">{o.customer_name}</div>{o.problem_note ? <div className="small" style={{ color: 'var(--amber)' }}>{o.problem_note}</div> : null}</td>
                  <td>{o.driver}<div className="small muted">due {day(o.collection_date)}</div></td><td className="num">{money(o.expected_amount)}</td></tr>
              ))}</tbody></table>
            )}
          </div>
        </div>
        <div>
          <div className="section-title"><h2>Returned cheques</h2></div>
          <div className="table-wrap">
            {!data.returned.length ? <Empty title="No returned cheques" /> : (
              <table className="t compact"><tbody>{data.returned.map((r) => (
                <tr key={r.id}><td><Link to={`/c/${r.id}`}>{r.cc_no}</Link> <Dept code={r.department} /><div className="small muted">{r.customer_name}</div></td>
                  <td className="small">{day(r.returned_at)}<div className="muted">{r.reason}</div></td>
                  <td>{r.replacement ? <span className="small">Replaced by {r.replacement}</span> : <span className="small" style={{ color: 'var(--red)', fontWeight: 650 }}>No replacement</span>}</td>
                  <td className="num">{money(r.amount)}</td></tr>
              ))}</tbody></table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

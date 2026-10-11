import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/ctx.jsx';
import { supabase, q, rpc } from '../lib/supabase.js';
import { day, lkr, mapsHref, telHref, todayLK } from '../lib/format.js';
import { Btn, Dept, Empty, ErrorNote, Loading, Note, ReasonModal, useAsync } from '../components/ui.jsx';
import { RecordCollection } from '../components/Collect.jsx';
import Icon from '../components/Icon.jsx';

function Job({ c, onDone, showDriver }) {
  const { nameOf, toast, role } = useApp();
  const [recording, setRecording] = useState(false);
  const [problem, setProblem] = useState(false);
  const overdue = c.collection_date < todayLK();
  const href = mapsHref(c);
  return (
    <div className={'job' + (overdue ? ' overdue' : '')}>
      <div className="row between top">
        <div style={{ minWidth: 0 }}>
          <div className="cust">{c.customer_name}</div>
          <div className="row small muted" style={{ gap: 8 }}>
            <Link to={`/c/${c.id}`}>{c.cc_no}</Link><Dept code={c.department} />
            <span>{overdue ? <b style={{ color: 'var(--red)' }}>Overdue since {day(c.collection_date)}</b> : day(c.collection_date)}</span>
            {showDriver ? <span>{nameOf(c.driver_id)}</span> : null}
          </div>
        </div>
        <b className="money nowrap">{lkr(c.expected_amount)}</b>
      </div>
      {c.location_text ? <div className="addr" style={{ whiteSpace: 'pre-wrap' }}>{c.location_text}</div> : null}
      {c.instructions ? <Note>{c.instructions}</Note> : null}
      {c.notes ? <p className="small muted" style={{ margin: '6px 0 0' }}>{c.notes}</p> : null}
      {c.problem_note ? <Note kind="warn">Last time: {c.problem_note}</Note> : null}
      <div className="row" style={{ marginTop: 10 }}>
        {c.contact_phone ? <a className="btn" href={telHref(c.contact_phone)}><Icon name="phone" size={18} /> Call {c.contact_person || ''}</a> : null}
        {href ? <a className="btn" href={href} target="_blank" rel="noreferrer"><Icon name="nav" size={18} /> Directions</a> : null}
      </div>
      {role === 'driver' ? (
        recording ? (
          <div style={{ marginTop: 14 }}>
            <RecordCollection c={c} onDone={() => { setRecording(false); toast('Collection saved'); onDone(); }} onCancel={() => setRecording(false)} />
          </div>
        ) : (
          <div className="stack-s" style={{ marginTop: 12 }}>
            <Btn className="primary big block" onClick={() => setRecording(true)}><Icon name="camera" /> Record collection</Btn>
            <Btn className="block" onClick={() => setProblem(true)}>Couldn't collect</Btn>
          </div>
        )
      ) : null}
      {problem ? (
        <ReasonModal title="Couldn't collect" label="What happened?" placeholder="For example: office closed, will go tomorrow"
          confirm="Tell finance" onClose={() => setProblem(false)}
          onConfirm={(t) => rpc('cc_report_problem', { p_id: c.id, p_note: t }).then(() => { toast('Finance has been told'); onDone(); })} />
      ) : null}
    </div>
  );
}

export default function DriverDay() {
  const { role, tick, nameOf } = useApp();
  const today = todayLK();
  const { data, loading, error, reload } = useAsync(
    () => q(supabase.from('collections').select('*').eq('status', 'assigned').order('collection_date').order('created_at')),
    [tick],
  );
  if (loading && !data) return <Loading />;
  const rows = data || [];
  const due = rows.filter((c) => c.collection_date <= today);
  const later = rows.filter((c) => c.collection_date > today);
  const finance = role === 'finance';

  const groups = finance ? Object.entries(due.reduce((m, c) => { (m[c.driver_id] ||= []).push(c); return m; }, {})) : null;

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="page-head">
        <div>
          <h1>{finance ? 'Pickups today' : 'My day'}</h1>
          <p>{day(today)}. {due.length ? `${due.length} pickup${due.length > 1 ? 's' : ''} today or overdue.` : 'Nothing due today.'}</p>
        </div>
      </div>
      <ErrorNote error={error} />
      {!due.length ? (
        <div className="panel"><Empty title={finance ? 'No pickups due today' : 'No pickups for today'}>{finance ? 'Assigned jobs show here on their collection date.' : 'Finance will assign jobs to you. They appear here on their collection date.'}</Empty></div>
      ) : finance ? groups.map(([drv, jobs]) => (
        <div key={drv} style={{ marginBottom: 22 }}>
          <h2 style={{ marginBottom: 10 }}>{nameOf(drv)} <span className="muted small">({jobs.length})</span></h2>
          {jobs.map((c) => <Job key={c.id} c={c} onDone={reload} />)}
        </div>
      )) : due.map((c) => <Job key={c.id} c={c} onDone={reload} />)}

      {later.length ? (
        <>
          <div className="section-title"><h2>Coming up</h2></div>
          <div className="list">
            {later.map((c) => (
              <Link key={c.id} to={`/c/${c.id}`} className="item">
                <div><div className="who">{c.customer_name}</div><div className="meta"><span>{c.cc_no}</span><Dept code={c.department} /></div></div>
                <div className="next">{day(c.collection_date)}{finance ? `, ${nameOf(c.driver_id)}` : ''}</div>
                <div className="amt">{lkr(c.expected_amount)}</div>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

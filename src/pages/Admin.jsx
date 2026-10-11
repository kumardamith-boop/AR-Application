import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import JSZip from 'jszip';
import { useApp } from '../lib/ctx.jsx';
import { supabase, q, rpc } from '../lib/supabase.js';
import { ROLE_LABEL, day, money, when } from '../lib/format.js';
import { readJournalHeader } from '../lib/excel.js';
import { downloadBlob, removeFiles } from '../lib/files.js';
import { Btn, Dept, Empty, ErrorNote, Field, Loading, Modal, Note, useAsync } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { ViewAs } from '../components/ViewAs.jsx';

function DeptChecks({ value, onChange }) {
  const { depts } = useApp();
  return (
    <div className="row">
      {depts.filter((d) => d.active).map((d) => (
        <label key={d.code} className="check">
          <input type="checkbox" checked={value.includes(d.code)}
            onChange={(e) => onChange(e.target.checked ? [...value, d.code] : value.filter((x) => x !== d.code))} />
          {d.code}
        </label>
      ))}
    </div>
  );
}

function PersonModal({ person, onClose, onDone }) {
  const { isAdmin } = useApp();
  const isNew = !person;
  const [v, setV] = useState({
    email: person?.email || '', full_name: person?.full_name || '', phone: person?.phone || '', role: person?.role || '',
    departments: person?.departments || [], active: person ? person.active : true, is_admin: person?.is_admin || false,
    salesperson_code: person?.salesperson_code || '',
  });
  const [err, setErr] = useState(null);
  const set = (k, val) => setV((x) => ({ ...x, [k]: val }));
  async function save() {
    setErr(null);
    try {
      if (isNew) await rpc('cc_set_pending_access', { p: v });
      else await rpc('cc_set_person', { p_user: person.id, p: { ...v, role: v.role || null } });
      onDone(); onClose();
    } catch (e) { setErr(e); }
  }
  return (
    <Modal title={isNew ? 'Add a person' : `Access for ${person.full_name || person.email}`} onClose={onClose}
      footer={<><Btn onClick={onClose}>Close</Btn><Btn className="primary" onClick={save}>{isNew ? 'Add person' : 'Save access'}</Btn></>}>
      <div className="stack">
        {isNew ? <Field label="Work email"><input className="input" type="email" value={v.email} onChange={(e) => set('email', e.target.value)} /></Field> : <p className="muted">{person.email}</p>}
        <div className="grid2">
          <Field label="Name"><input className="input" value={v.full_name} onChange={(e) => set('full_name', e.target.value)} /></Field>
          {!isNew ? <Field label="Phone"><input className="input" value={v.phone} onChange={(e) => set('phone', e.target.value)} /></Field> : null}
        </div>
        <Field label="Role">
          <select className="input" value={v.role} onChange={(e) => set('role', e.target.value)}>
            <option value="">No access</option>
            <option value="sales">Sales</option>
            <option value="driver">Driver</option>
            <option value="finance">Finance</option>
            <option value="executive">Management (view only)</option>
          </select>
        </Field>
        {v.role === 'sales' ? (
          <Field group label="Departments" hint="Sales see and raise collections only for these.">
            <DeptChecks value={v.departments} onChange={(d) => set('departments', d)} />
          </Field>
        ) : null}
        {v.role === 'finance' && isAdmin ? <label className="check"><input type="checkbox" checked={v.is_admin} onChange={(e) => set('is_admin', e.target.checked)} /> Finance Admin (manages finance people, departments, and can view as any role)</label> : null}
        {!isNew ? <label className="check"><input type="checkbox" checked={v.active} onChange={(e) => set('active', e.target.checked)} /> Login is active</label> : null}
        {isNew ? <Note kind="plain">They sign in with this email. If they have no login yet, they choose "Create your login" on the sign-in page, or you add them in Supabase under Authentication, Users. The access you set here applies as soon as the login exists.</Note> : null}
        <ErrorNote error={err} />
      </div>
    </Modal>
  );
}

export default function People() {
  const { tick, isAdmin, uid, reloadMe } = useApp();
  const [modal, setModal] = useState(null);
  const { data, loading, error, reload } = useAsync(async () => ({
    people: await q(supabase.from('profiles').select('*').order('role', { nullsFirst: true }).order('full_name')),
    pending: await q(supabase.from('pending_access').select('*').order('created_at')),
  }), [tick]);
  const done = () => { reload(); reloadMe(); };
  if (loading && !data) return <Loading />;
  const noRole = (data?.people || []).filter((p) => !p.role);
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div><h1>People</h1><p>Who can use the app, their role, and the departments sales work for.</p></div>
        <Btn className="primary" onClick={() => setModal({ kind: 'new' })}><Icon name="plus" size={18} /> Add a person</Btn>
      </div>
      <ErrorNote error={error} />
      {noRole.length ? <Note kind="warn">{noRole.length} new login{noRole.length > 1 ? 's are' : ' is'} waiting for access: {noRole.map((p) => p.email).join(', ')}.</Note> : null}
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Name</th><th>Role</th><th>Departments</th><th>Status</th><th /></tr></thead>
          <tbody>{(data?.people || []).map((p) => (
            <tr key={p.id} className={p.active ? '' : 'dim'}>
              <td><b>{p.full_name || '(no name)'}</b>{p.id === uid ? ' (you)' : ''}<div className="small muted">{p.email}</div></td>
              <td>{p.role ? ROLE_LABEL[p.role] : <span style={{ color: 'var(--amber)', fontWeight: 650 }}>No access yet</span>}{p.is_admin ? <div className="small">Finance Admin</div> : null}</td>
              <td><div className="row" style={{ gap: 4 }}>{p.role === 'sales' ? p.departments.map((d) => <Dept key={d} code={d} />) : <span className="muted small">{p.role === 'finance' || p.role === 'executive' ? 'All' : ''}</span>}</div></td>
              <td>{p.active ? 'Active' : 'Switched off'}</td>
              <td className="right"><button className="btn small" onClick={() => setModal({ kind: 'edit', person: p })}>Change access</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {data?.pending?.length ? (
        <>
          <div className="section-title"><h2>Waiting for their first sign-in</h2></div>
          <div className="table-wrap">
            <table className="t compact">
              <tbody>{data.pending.map((p) => (
                <tr key={p.email}><td><b>{p.full_name || p.email}</b><div className="small muted">{p.email}</div></td><td>{ROLE_LABEL[p.role]} {p.departments.join(' and ')}</td>
                  <td className="right"><button className="btn quiet small" onClick={() => rpc('cc_delete_pending_access', { p_email: p.email }).then(reload)}>Remove</button></td></tr>
              ))}</tbody>
            </table>
          </div>
        </>
      ) : null}
      {isAdmin ? <ViewAs /> : null}
      {modal?.kind === 'new' ? <PersonModal onClose={() => setModal(null)} onDone={done} /> : null}
      {modal?.kind === 'edit' ? <PersonModal person={modal.person} onClose={() => setModal(null)} onDone={done} /> : null}
    </div>
  );
}

export function Settings() {
  const { settings, depts, isAdmin, reloadMe, toast } = useApp();
  const [v, setV] = useState(settings || {});
  const [series, setSeries] = useState(null);
  const [dv, setDv] = useState(depts);
  const [err, setErr] = useState(null);
  useEffect(() => { setV(settings || {}); }, [settings]);
  useEffect(() => { setDv(depts); }, [depts]);
  useEffect(() => { q(supabase.from('doc_series').select('*').eq('code', 'BC_RECEIPT').maybeSingle()).then(setSeries).catch(() => {}); }, []);
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function save() {
    setErr(null);
    try {
      await rpc('cc_save_settings', { p: {
        company_name: v.company_name, app_name: v.app_name, journal_batch_name: v.journal_batch_name,
        journal_document_type: v.journal_document_type, journal_description: v.journal_description,
        journal_unapplied_description: v.journal_unapplied_description, journal_columns: v.journal_columns,
        fill_applied_amount_columns: v.fill_applied_amount_columns, lcy_only: v.lcy_only, drivers_can_deposit: v.drivers_can_deposit,
        stuck_days: Number(v.stuck_days), photo_keep_days: Number(v.photo_keep_days),
      } });
      if (series) await rpc('cc_save_series', { p: { prefix: series.prefix, width: Number(series.width), next_no: series.next_no === '' || series.next_no === null ? null : Number(series.next_no) } });
      if (isAdmin) for (const d of dv) await rpc('cc_save_department', { p: d });
      await reloadMe();
      toast('Settings saved');
    } catch (e) { setErr(e); }
  }
  async function template(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = await readJournalHeader(f).catch((x) => ({ error: x.message }));
    if (r.error) { setErr(r.error); return; }
    setV((x) => ({ ...x, journal_columns: r.columns }));
    toast(`${r.columns.length} columns read. Save to keep them.`);
  }

  return (
    <div className="stack" style={{ maxWidth: 900 }}>
      <div className="page-head" style={{ marginBottom: 0 }}><div><h1>Settings</h1><p>Journal conventions for Business Central, document numbers, departments and app rules.</p></div></div>
      <div className="panel stack">
        <h2>Business Central journal</h2>
        <div className="grid2">
          <Field label="Batch Name" hint="The Cash Receipt Journal batch the lines go into."><input className="input" value={v.journal_batch_name || ''} onChange={set('journal_batch_name')} /></Field>
          <Field label="Document Type"><input className="input" value={v.journal_document_type || ''} onChange={set('journal_document_type')} /></Field>
          <Field label="Description for applied lines" hint="{customer_name}, {invoice_no}, {cheque_no} and {cc_no} are filled in."><input className="input" value={v.journal_description || ''} onChange={set('journal_description')} /></Field>
          <Field label="Description for unapplied (advance) lines"><input className="input" value={v.journal_unapplied_description || ''} onChange={set('journal_unapplied_description')} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={!!v.fill_applied_amount_columns} onChange={set('fill_applied_amount_columns')} /> Fill the "Applied Amount (DT/EU/…)" columns with the applied amount of that department</label>
        <Field group label={`Journal columns (${(v.journal_columns || []).length}), in export order`} hint="To change them, open your Cash Receipt Journal in Excel from BC and upload that file here.">
          <div className="small" style={{ background: 'var(--bg)', borderRadius: 8, padding: 10 }}>{(v.journal_columns || []).join(', ')}</div>
        </Field>
        <input className="input" type="file" accept=".xlsx,.xls" onChange={template} aria-label="Upload journal template" />
      </div>
      {series ? (
        <div className="panel stack">
          <h2>Receipt document numbers</h2>
          <p className="muted small">One running series for DT and EU. Each bank statement line gets one number; exporting again keeps it.</p>
          <div className="grid3">
            <Field label="Prefix"><input className="input" value={series.prefix} onChange={(e) => setSeries((s) => ({ ...s, prefix: e.target.value }))} /></Field>
            <Field label="Digits"><input className="input" type="number" min="1" max="12" value={series.width} onChange={(e) => setSeries((s) => ({ ...s, width: e.target.value }))} /></Field>
            <Field label="Next number" hint="Leave blank to type the first number at export."><input className="input" type="number" min="1" value={series.next_no ?? ''} onChange={(e) => setSeries((s) => ({ ...s, next_no: e.target.value }))} /></Field>
          </div>
          <p className="small muted">Next document: <b>{series.next_no ? `${series.prefix}${String(series.next_no).padStart(Number(series.width), '0')}` : 'typed at export'}</b></p>
        </div>
      ) : null}
      <div className="panel stack">
        <h2>Departments</h2>
        {!isAdmin ? <p className="small muted">Only a Finance Admin can change these.</p> : null}
        {dv.map((d, i) => (
          <div key={d.code} className="grid3">
            <Field label={`Code ${d.code}: name`}><input className="input" disabled={!isAdmin} value={d.name} onChange={(e) => setDv((xs) => xs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></Field>
            <Field label="Bu Code value in BC"><input className="input" disabled={!isAdmin} value={d.bc_value} onChange={(e) => setDv((xs) => xs.map((x, j) => (j === i ? { ...x, bc_value: e.target.value } : x)))} /></Field>
            <label className="check" style={{ marginTop: 26 }}><input type="checkbox" disabled={!isAdmin} checked={d.active} onChange={(e) => setDv((xs) => xs.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)))} /> Active</label>
          </div>
        ))}
      </div>
      <div className="panel stack">
        <h2>Rules</h2>
        <label className="check"><input type="checkbox" checked={!!v.lcy_only} onChange={set('lcy_only')} /> Only LKR invoices can be collected by cheque</label>
        <label className="check"><input type="checkbox" checked={!!v.drivers_can_deposit} onChange={set('drivers_can_deposit')} /> Drivers can deposit the cheques they hold and record the slip</label>
        <div className="grid2">
          <Field label="An item is stuck after (days)"><input className="input" type="number" min="1" value={v.stuck_days || 3} onChange={set('stuck_days')} /></Field>
          <Field label="Keep cheque photos for (days after closing)"><input className="input" type="number" min="7" value={v.photo_keep_days || 30} onChange={set('photo_keep_days')} /></Field>
          <Field label="Company name"><input className="input" value={v.company_name || ''} onChange={set('company_name')} /></Field>
          <Field label="App name"><input className="input" value={v.app_name || ''} onChange={set('app_name')} /></Field>
        </div>
      </div>
      <ErrorNote error={err} />
      <div><Btn className="primary big" onClick={save}>Save settings</Btn></div>
    </div>
  );
}

export function Photos() {
  const { tick, toast } = useApp();
  const { data, loading, error, reload } = useAsync(() => rpc('cc_photo_candidates'), [tick]);
  const [sel, setSel] = useState(new Set());
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState(null);
  const items = data?.items || [];
  const chosen = items.filter((i) => sel.has(i.id));

  async function backup() {
    setErr(null);
    try {
      const zip = new JSZip();
      const index = [['CC number', 'Department', 'Customer', 'Cheque', 'Amount', 'Closed', 'File']];
      let n = 0;
      for (const c of chosen) {
        for (const x of c.cheques || []) {
          n++;
          setBusy(`Downloading photo ${n}…`);
          const blob = await downloadBlob(x.photo_path);
          const ext = (x.photo_path.split('.').pop() || 'jpg').toLowerCase();
          const name = `${c.cc_no}_chq-${x.cheque_no}_LKR-${Number(x.amount).toFixed(2)}.${ext}`;
          zip.file(name, blob);
          index.push([c.cc_no, c.department, c.customer_name, x.cheque_no, Number(x.amount).toFixed(2), day(c.closed_at), name]);
        }
      }
      zip.file('index.csv', index.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n'));
      setBusy('Building the zip…');
      const out = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(out);
      a.download = `cheque-photos-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      await rpc('cc_mark_photos', { p_ids: chosen.map((c) => c.id), p_stage: 'backed_up' });
      toast('Backup downloaded. Keep the zip safe, then free the space.');
      reload();
    } catch (e) { setErr(e); } finally { setBusy(''); }
  }
  async function free() {
    setErr(null);
    try {
      const ready = chosen.filter((c) => c.backed_up_at);
      if (!ready.length) throw new Error('Download the backup of the ticked collections first.');
      setBusy('Removing photos…');
      await removeFiles(ready.flatMap((c) => (c.cheques || []).map((x) => x.photo_path)));
      await rpc('cc_mark_photos', { p_ids: ready.map((c) => c.id), p_stage: 'deleted' });
      toast(`Photos removed for ${ready.length} collection${ready.length > 1 ? 's' : ''}`);
      setSel(new Set());
      reload();
    } catch (e) { setErr(e); } finally { setBusy(''); }
  }

  if (loading && !data) return <Loading />;
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}><div><h1>Photo storage</h1><p>Back up cheque photos of collections closed more than {data?.keep_days} days ago, then free the space.</p></div></div>
      <ErrorNote error={error || err} />
      {!items.length ? <div className="panel"><Empty title="Nothing to back up">Collections show here {data?.keep_days} days after they close.</Empty></div> : (
        <>
          <div className="row">
            <Btn onClick={() => setSel(new Set(items.map((i) => i.id)))}>Tick all {items.length}</Btn>
            <Btn className="primary" disabled={!chosen.length || !!busy} onClick={backup}><Icon name="download" size={18} /> Download backup zip</Btn>
            <Btn className="danger" disabled={!chosen.some((c) => c.backed_up_at) || !!busy} onClick={free}>Free the space</Btn>
            {busy ? <span className="muted">{busy}</span> : null}
          </div>
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th style={{ width: 36 }} /><th>Collection</th><th>Closed</th><th>Photos</th><th>Backup</th></tr></thead>
              <tbody>{items.map((c) => (
                <tr key={c.id} className={sel.has(c.id) ? 'sel' : ''}>
                  <td><input type="checkbox" checked={sel.has(c.id)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} aria-label={`Tick ${c.cc_no}`} /></td>
                  <td><Link to={`/c/${c.id}`}>{c.cc_no}</Link> <Dept code={c.department} /><div className="small muted">{c.customer_name}</div></td>
                  <td className="nowrap">{day(c.closed_at)}</td>
                  <td className="small">{(c.cheques || []).map((x) => `${x.cheque_no} (${money(x.amount)})`).join(', ')}</td>
                  <td className="small">{c.backed_up_at ? `Downloaded ${when(c.backed_up_at)}` : 'Not yet'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

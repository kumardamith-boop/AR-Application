import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useApp } from '../lib/ctx.jsx';
import { supabase, q, rpc, errText } from '../lib/supabase.js';
import { ROLE_LABEL, ago } from '../lib/format.js';
import { navFor } from '../components/Layout.jsx';
import { Btn, Empty, ErrorNote, Field, Loading, Note, useAsync } from '../components/ui.jsx';
import { ViewAs } from '../components/ViewAs.jsx';
import Icon from '../components/Icon.jsx';

export function Account() {
  const { me, role, isAdmin, reloadMe, signOut, toast } = useApp();
  const [name, setName] = useState(me?.full_name || '');
  const [phone, setPhone] = useState(me?.phone || '');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(null);
  const [pwErr, setPwErr] = useState(null);
  const [installed, setInstalled] = useState(false);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches;

  async function saveMe() {
    setErr(null);
    try { await rpc('cc_update_me', { p: { full_name: name, phone } }); await reloadMe(); toast('Saved'); } catch (e) { setErr(e); }
  }
  async function savePw() {
    setPwErr(null);
    if (pw.length < 8) { setPwErr('Use at least 8 characters.'); return; }
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) { setPwErr(errText(error)); return; }
    setPw(''); toast('Password changed');
  }
  async function install() {
    const p = window.__installPrompt;
    if (!p) return;
    p.prompt();
    const r = await p.userChoice;
    if (r.outcome === 'accepted') setInstalled(true);
    window.__installPrompt = null;
  }

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <div className="page-head" style={{ marginBottom: 0 }}><div><h1>Your account</h1><p>{me?.email}. {ROLE_LABEL[role]}{role === 'sales' ? ` for ${(me?.departments || []).join(' and ')}` : ''}{isAdmin ? ', Finance Admin' : ''}.</p></div></div>
      <div className="panel stack">
        <div className="grid2">
          <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Phone"><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></Field>
        </div>
        <ErrorNote error={err} />
        <div><Btn className="primary" onClick={saveMe}>Save</Btn></div>
      </div>
      <div className="panel stack">
        <h3>Change password</h3>
        <Field label="New password"><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
        <ErrorNote error={pwErr} />
        <div><Btn onClick={savePw}>Change password</Btn></div>
      </div>
      <div className="panel stack">
        <h3>Install the app</h3>
        {standalone || installed ? <Note kind="ok">The app is installed on this device.</Note>
          : window.__installPrompt ? <div><Btn className="primary" onClick={install}><Icon name="download" size={18} /> Install on this device</Btn></div>
            : <p className="muted small">On Android, open the browser menu and choose "Install app" or "Add to Home screen". On iPhone, tap Share, then "Add to Home Screen".</p>}
      </div>
      {isAdmin ? <ViewAs /> : null}
      <div><Btn onClick={signOut}><Icon name="logout" size={18} /> Sign out</Btn></div>
    </div>
  );
}

export function More() {
  const { role, settings, unread, signOut } = useApp();
  const items = navFor(role, settings);
  const rest = items.slice(items.length > 4 ? 3 : 4);
  return (
    <div className="stack" style={{ maxWidth: 520 }}>
      <h1>More</h1>
      <div className="list">
        {rest.map((i) => (
          <NavLink key={i.to} to={i.to} className="item" style={{ gridTemplateColumns: 'auto 1fr' }}>
            <Icon name={i.icon} /> <span className="who">{i.label}</span>
          </NavLink>
        ))}
        {role === 'sales' || role === 'finance' ? <Link to="/new" className="item" style={{ gridTemplateColumns: 'auto 1fr' }}><Icon name="plus" /> <span className="who">New request</span></Link> : null}
        <Link to="/notifications" className="item" style={{ gridTemplateColumns: 'auto 1fr auto' }}><Icon name="bell" /> <span className="who">Notifications</span>{unread ? <span className="badge">{unread}</span> : <span />}</Link>
        <Link to="/account" className="item" style={{ gridTemplateColumns: 'auto 1fr' }}><Icon name="user" /> <span className="who">Your account</span></Link>
      </div>
      <Btn onClick={signOut}><Icon name="logout" size={18} /> Sign out</Btn>
    </div>
  );
}

export function Notifications() {
  const { uid, tick, refreshUnread } = useApp();
  const nav = useNavigate();
  const { data, loading, error, reload } = useAsync(() => q(supabase.from('notifications').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(200)), [uid, tick]);
  async function open(n) {
    if (!n.read_at) { await rpc('cc_mark_read', { p_ids: [n.id] }); refreshUnread(); }
    if (n.link) nav(n.link);
  }
  if (loading && !data) return <Loading />;
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <div className="row between"><h1>Notifications</h1>{(data || []).some((n) => !n.read_at) ? <Btn className="small" onClick={async () => { await rpc('cc_mark_read', { p_ids: null }); refreshUnread(); reload(); }}>Mark all read</Btn> : null}</div>
      <ErrorNote error={error} />
      <div className="list">
        {!(data || []).length ? <Empty title="No notifications yet">Updates on your collections appear here.</Empty> : data.map((n) => (
          <a key={n.id} href={n.link || '#'} className="item" style={{ gridTemplateColumns: '1fr auto', background: n.read_at ? undefined : 'var(--purple-tint)' }}
            onClick={(e) => { e.preventDefault(); open(n); }}>
            <span>{n.message}</span><span className="small muted nowrap">{ago(n.created_at)}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

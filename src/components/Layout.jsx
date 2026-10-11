import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../lib/ctx.jsx';
import { supabase, rpc, q } from '../lib/supabase.js';
import { ROLE_LABEL, ago } from '../lib/format.js';
import Icon from './Icon.jsx';

export function navFor(role, settings) {
  switch (role) {
    case 'finance':
      return [
        { to: '/collections', label: 'Collections', icon: 'list' },
        { to: '/deposits', label: 'Deposits', icon: 'slip' },
        { to: '/bank', label: 'Bank', icon: 'bank' },
        { to: '/export', label: 'Export to BC', icon: 'send' },
        { to: '/bc-check', label: 'BC check', icon: 'check' },
        { to: '/reports', label: 'Reports', icon: 'chart' },
        { to: '/day', label: 'Pickups today', icon: 'truck' },
        { to: '/overview', label: 'Overview', icon: 'gauge' },
        { to: '/customers', label: 'Customer data', icon: 'database' },
        { to: '/people', label: 'People', icon: 'users' },
        { to: '/photos', label: 'Photo storage', icon: 'image' },
        { to: '/settings', label: 'Settings', icon: 'settings' },
      ];
    case 'sales':
      return [
        { to: '/collections', label: 'Collections', icon: 'list' },
        { to: '/new', label: 'New request', icon: 'plus' },
        { to: '/reports', label: 'Reports', icon: 'chart' },
      ];
    case 'driver': {
      const items = [
        { to: '/day', label: 'My day', icon: 'truck' },
        { to: '/collections', label: 'My jobs', icon: 'list' },
      ];
      if (settings?.drivers_can_deposit) items.push({ to: '/deposits', label: 'Deposits', icon: 'slip' });
      return items;
    }
    case 'executive':
      return [
        { to: '/overview', label: 'Overview', icon: 'gauge' },
        { to: '/collections', label: 'Collections', icon: 'list' },
        { to: '/reports', label: 'Reports', icon: 'chart' },
        { to: '/bc-check', label: 'BC check', icon: 'check' },
        { to: '/bank', label: 'Bank', icon: 'bank' },
      ];
    default:
      return [];
  }
}

function Bell() {
  const { uid, unread, refreshUnread, tick } = useApp();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const ref = useRef(null);
  const nav = useNavigate();

  useEffect(() => {
    if (!open) return;
    q(supabase.from('notifications').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(15))
      .then(setItems).catch(() => {});
  }, [open, uid, tick]);
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  async function openItem(n) {
    setOpen(false);
    if (!n.read_at) { await rpc('cc_mark_read', { p_ids: [n.id] }).catch(() => {}); refreshUnread(); }
    if (n.link) nav(n.link);
  }
  async function readAll() {
    await rpc('cc_mark_read', { p_ids: null }).catch(() => {});
    refreshUnread();
    setItems((xs) => xs.map((x) => ({ ...x, read_at: x.read_at || new Date().toISOString() })));
  }

  return (
    <div className="bell" ref={ref}>
      <button className="iconbtn" onClick={() => setOpen((o) => !o)} aria-label={`Notifications, ${unread} unread`}>
        <Icon name="bell" size={22} />
        {unread ? <span className="badge">{unread > 99 ? '99+' : unread}</span> : null}
      </button>
      {open ? (
        <div className="bell-pop">
          <div className="row between" style={{ padding: '12px 16px' }}>
            <b>Notifications</b>
            {unread ? <button className="btn quiet small" onClick={readAll}>Mark all read</button> : null}
          </div>
          {items.length === 0 ? <p className="muted small" style={{ padding: '0 16px 14px' }}>Nothing yet. You'll see updates on your collections here.</p> : null}
          {items.map((n) => (
            <a key={n.id} href={n.link || '#'} className={'n' + (n.read_at ? '' : ' unread')}
              onClick={(e) => { e.preventDefault(); openItem(n); }}>
              {n.message}
              <small>{ago(n.created_at)}</small>
            </a>
          ))}
          <Link to="/notifications" className="n" onClick={() => setOpen(false)}><b>See all</b></Link>
        </div>
      ) : null}
    </div>
  );
}

function ViewAsBanner() {
  const { viewingAs, reloadMe } = useApp();
  if (!viewingAs) return null;
  return (
    <div className="viewas" role="status">
      <span>Finance Admin viewing the app as <b>{ROLE_LABEL[viewingAs]}</b>. The database applies that role's permissions.</span>
      <button className="btn small" onClick={async () => { await rpc('cc_set_view_as', { p_role: null }); await reloadMe(); }}>
        Back to finance
      </button>
    </div>
  );
}

export default function Layout({ children }) {
  const { role, settings, me, unread } = useApp();
  const items = navFor(role, settings);
  const loc = useLocation();
  const phoneItems = items.slice(0, items.length > 4 ? 3 : 4);
  const title = items.find((i) => loc.pathname.startsWith(i.to))?.label || '';
  const wide = /^\/(export|bank|bc-check|reports|deposits)/.test(loc.pathname);

  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);

  return (
    <div className="app">
      <aside className="side">
        <Link to="/" className="brand" aria-label="Home">
          <img src="/logo.png" alt="Gennext" />
          <span>{settings?.app_name || 'Cheque Collection'}</span>
        </Link>
        <nav aria-label="Main">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
              <Icon name={i.icon} /> {i.label}
            </NavLink>
          ))}
        </nav>
        <div className="me">
          <b>{me?.full_name || me?.email}</b>
          <span className="muted">{ROLE_LABEL[role]}{role === 'sales' ? ' for ' + (me?.departments || []).join(' and ') : ''}</span>
          <div style={{ marginTop: 8 }}><Link to="/account">Your account</Link></div>
        </div>
      </aside>
      <div className="main">
        <ViewAsBanner />
        <header className="topbar">
          <Link to="/" aria-label="Home"><img className="logo-phone" src="/logo.png" alt="Gennext" /></Link>
          <span className="title">{title}</span>
          <span className="grow" />
          {role === 'sales' || role === 'finance' ? (
            <Link to="/new" className="btn primary small hide-phone"><Icon name="plus" size={18} /> New request</Link>
          ) : null}
          <Bell />
        </header>
        <main className={'content' + (wide ? ' wide' : '')}>{children}</main>
      </div>
      <nav className="bottombar" aria-label="Main">
        {phoneItems.map((i) => (
          <NavLink key={i.to} to={i.to} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon name={i.icon} size={22} />
            {i.label}
          </NavLink>
        ))}
        <NavLink to="/more" className={({ isActive }) => (isActive ? 'active' : '')}>
          <Icon name="more" size={22} />
          More
          {unread ? <span className="badge">{unread}</span> : null}
        </NavLink>
      </nav>
    </div>
  );
}

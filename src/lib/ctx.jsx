import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, q } from './supabase.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const [me, setMe] = useState(null);
  const [settings, setSettings] = useState(null);
  const [depts, setDepts] = useState([]);
  const [people, setPeople] = useState([]);
  const [loadErr, setLoadErr] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);
  const [unread, setUnread] = useState(0);
  const [recovery, setRecovery] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s || null);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const uid = session?.user?.id;

  const loadAll = useCallback(async () => {
    if (!uid) { setMe(null); setLoaded(true); return; }
    try {
      const [p] = await Promise.all([
        q(supabase.from('profiles').select('*').eq('id', uid).maybeSingle()),
      ]);
      setMe(p);
      if (p && p.role && p.active) {
        const [s, d, ppl, n] = await Promise.all([
          q(supabase.from('settings').select('*').eq('id', 1).maybeSingle()),
          q(supabase.from('departments').select('*').order('sort_order')),
          q(supabase.from('profiles').select('id, email, full_name, role, departments, active, is_admin, phone').order('full_name')),
          supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null).eq('user_id', uid),
        ]);
        setSettings(s);
        setDepts(d || []);
        setPeople(ppl || []);
        setUnread(n.count || 0);
      }
      setLoadErr(null);
    } catch (e) {
      setLoadErr(e);
    } finally {
      setLoaded(true);
    }
  }, [uid]);

  useEffect(() => { setLoaded(false); loadAll(); }, [loadAll]);

  // live updates: collections and my notifications
  useEffect(() => {
    if (!uid || !me?.role) return undefined;
    let timer = null;
    const bump = () => { clearTimeout(timer); timer = setTimeout(() => setTick((t) => t + 1), 400); };
    const ch = supabase
      .channel('cc-live-' + uid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'collections' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, () => {
        refreshUnread();
        bump();
      })
      .subscribe();
    return () => { clearTimeout(timer); supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, me?.role]);

  const refreshUnread = useCallback(async () => {
    if (!uid) return;
    const n = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null).eq('user_id', uid);
    setUnread(n.count || 0);
  }, [uid]);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3200);
  }, []);

  const value = useMemo(() => {
    const realRole = me?.active ? me?.role : null;
    const isAdmin = !!(me?.is_admin && me?.role === 'finance' && me?.active);
    const role = isAdmin && me?.acting_role ? me.acting_role : realRole;
    const allDepts = depts.map((d) => d.code);
    const myDepts = role === 'finance' || role === 'executive' || (isAdmin && role === 'sales') ? allDepts : (me?.departments || []);
    const peopleById = Object.fromEntries(people.map((p) => [p.id, p]));
    const nameOf = (id) => (id ? peopleById[id]?.full_name || peopleById[id]?.email || 'someone' : '');
    return {
      session, uid, me, settings, depts, people, peopleById, nameOf, role, realRole, isAdmin,
      viewingAs: isAdmin && me?.acting_role ? me.acting_role : null,
      myDepts, allDepts, loaded, loadErr, reloadMe: loadAll, tick, bump: () => setTick((t) => t + 1),
      unread, refreshUnread, recovery, setRecovery, toast,
      signOut: async () => { await supabase.auth.signOut(); },
    };
  }, [session, uid, me, settings, depts, people, loaded, loadErr, loadAll, tick, unread, refreshUnread, recovery, toast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {toastMsg ? <div className="toast" role="status">{toastMsg}</div> : null}
    </Ctx.Provider>
  );
}

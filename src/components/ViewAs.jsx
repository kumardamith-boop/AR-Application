import { useState } from 'react';
import { useApp } from '../lib/ctx.jsx';
import { rpc } from '../lib/supabase.js';
import { ROLE_LABEL } from '../lib/format.js';
import { Btn, ErrorNote } from './ui.jsx';

export function ViewAs() {
  const { reloadMe, viewingAs } = useApp();
  const [err, setErr] = useState(null);
  async function go(role) {
    setErr(null);
    try { await rpc('cc_set_view_as', { p_role: role }); await reloadMe(); } catch (e) { setErr(e); }
  }
  return (
    <div className="panel stack">
      <h3>View the app as another role</h3>
      <p className="small muted">For checking what sales, drivers or management see. The database applies that role's permissions until you switch back.</p>
      <div className="row">
        {['sales', 'driver', 'executive'].map((r) => <Btn key={r} className={viewingAs === r ? 'primary' : ''} onClick={() => go(r)}>View as {ROLE_LABEL[r]}</Btn>)}
        {viewingAs ? <Btn onClick={() => go(null)}>Back to finance</Btn> : null}
      </div>
      <ErrorNote error={err} />
    </div>
  );
}


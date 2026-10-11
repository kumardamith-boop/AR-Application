import { useState } from 'react';
import { supabase, errText } from '../lib/supabase.js';
import { useApp } from '../lib/ctx.jsx';
import { Btn, ErrorNote, Field, Note } from '../components/ui.jsx';

function Art() {
  return (
    <div className="auth-art">
      <h1>Every cheque, from pickup to Business Central.</h1>
      <p>Request a collection, record the cheque with a photo, deposit it and post the receipt for DT and EU in one place.</p>
    </div>
  );
}

export function AlmostReady() {
  return (
    <div className="auth">
      <Art />
      <div className="auth-form">
        <div className="box">
          <img className="logo" src="/logo.png" alt="Gennext" />
          <h1>Almost ready</h1>
          <p className="muted" style={{ marginTop: 10 }}>
            The app is online but not yet connected to its database. In Vercel, open the project, go to
            Settings, then Environment Variables, and add <b>VITE_SUPABASE_URL</b> and <b>VITE_SUPABASE_ANON_KEY</b>.
            Then redeploy.
          </p>
        </div>
      </div>
    </div>
  );
}

export function SignIn() {
  const [mode, setMode] = useState('password'); // password | link | forgot | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState(null);
  const [sent, setSent] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setErr(null); setSent(null);
    const em = email.trim().toLowerCase();
    if (!em) { setErr('Type your work email.'); return; }
    try {
      if (mode === 'password') {
        const { error } = await supabase.auth.signInWithPassword({ email: em, password });
        if (error) throw new Error(/invalid/i.test(error.message) ? 'That email and password don\'t match. Try again or use "Email me a sign-in link".' : errText(error));
      } else if (mode === 'link') {
        const { error } = await supabase.auth.signInWithOtp({ email: em, options: { shouldCreateUser: false, emailRedirectTo: window.location.origin } });
        if (error) throw new Error(/not found|signups not allowed/i.test(error.message) ? 'There is no login for that email yet. Ask finance to add you.' : errText(error));
        setSent(`We sent a sign-in link to ${em}. Open it on this device.`);
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(em, { redirectTo: window.location.origin });
        if (error) throw new Error(errText(error));
        setSent(`If ${em} has a login, a link to set a new password is on its way.`);
      } else if (mode === 'signup') {
        if (password.length < 8) throw new Error('Use a password of at least 8 characters.');
        const { error, data } = await supabase.auth.signUp({ email: em, password, options: { data: { full_name: name.trim() }, emailRedirectTo: window.location.origin } });
        if (error) throw new Error(errText(error));
        if (!data.session) setSent(`Check ${em} for a confirmation link. After that, finance gives you access.`);
      }
    } catch (ex) {
      setErr(ex.message);
    }
  }

  const titles = { password: 'Sign in', link: 'Sign in with an email link', forgot: 'Set a new password', signup: 'Create your login' };
  const buttons = { password: 'Sign in', link: 'Email me a sign-in link', forgot: 'Email me a reset link', signup: 'Create login' };

  return (
    <div className="auth">
      <Art />
      <div className="auth-form">
        <form onSubmit={submit} className="stack">
          <img className="logo" src="/logo.png" alt="Gennext" />
          <h1>{titles[mode]}</h1>
          {mode === 'signup' ? (
            <Field label="Your name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
          ) : null}
          <Field label="Work email">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required />
          </Field>
          {mode === 'password' || mode === 'signup' ? (
            <Field label="Password">
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required />
            </Field>
          ) : null}
          <ErrorNote error={err} />
          {sent ? <Note kind="ok">{sent}</Note> : null}
          <Btn type="submit" className="primary block big" onClick={undefined}>{buttons[mode]}</Btn>
          <div className="stack-s small">
            {mode !== 'password' ? <div><a href="#" onClick={(e) => { e.preventDefault(); setMode('password'); }}>Sign in with a password</a></div> : null}
            {mode !== 'link' ? <div><a href="#" onClick={(e) => { e.preventDefault(); setMode('link'); }}>Email me a sign-in link instead</a></div> : null}
            {mode !== 'forgot' ? <div><a href="#" onClick={(e) => { e.preventDefault(); setMode('forgot'); }}>Forgot your password?</a></div> : null}
            {mode !== 'signup' ? <div className="muted">New here? <a href="#" onClick={(e) => { e.preventDefault(); setMode('signup'); }}>Create your login</a>, then ask finance for access.</div> : null}
          </div>
        </form>
      </div>
    </div>
  );
}

export function SetPassword() {
  const { setRecovery } = useApp();
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(null);
  async function save(e) {
    e.preventDefault();
    setErr(null);
    if (pw.length < 8) { setErr('Use at least 8 characters.'); return; }
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) { setErr(errText(error)); return; }
    setRecovery(false);
  }
  return (
    <div className="auth">
      <Art />
      <div className="auth-form">
        <form className="stack" onSubmit={save}>
          <img className="logo" src="/logo.png" alt="Gennext" />
          <h1>Choose a new password</h1>
          <Field label="New password"><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
          <ErrorNote error={err} />
          <button type="submit" className="btn primary block big">Save password</button>
        </form>
      </div>
    </div>
  );
}

export function NoAccess({ error }) {
  const { me, session, signOut, reloadMe } = useApp();
  return (
    <div className="auth">
      <Art />
      <div className="auth-form">
        <div className="box stack">
          <img className="logo" src="/logo.png" alt="Gennext" />
          <h1>{error ? 'Can\'t load your access' : 'No access yet'}</h1>
          {error ? <ErrorNote error={error} /> : (
            <p className="muted">
              You're signed in as <b>{me?.email || session?.user?.email}</b>{me && !me.active ? ', but this login is switched off' : ''}.
              Ask finance to give you a role (sales, driver, finance or management) on the People page.
            </p>
          )}
          <div className="row">
            <Btn className="primary" onClick={reloadMe}>Check again</Btn>
            <Btn onClick={signOut}>Sign out</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

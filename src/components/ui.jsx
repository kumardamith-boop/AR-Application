import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { STATUS, lkr, money } from '../lib/format.js';
import { errText } from '../lib/supabase.js';
import { signedUrl } from '../lib/files.js';
import Icon from './Icon.jsx';

export function Btn({ busy, children, className = '', onClick, type = 'button', ...rest }) {
  const [running, setRunning] = useState(false);
  const isBusy = busy || running;
  async function handle(e) {
    if (!onClick) return;
    const r = onClick(e);
    if (r && typeof r.then === 'function') {
      setRunning(true);
      try { await r; } finally { setRunning(false); }
    }
  }
  return (
    <button type={type} className={'btn ' + className} disabled={isBusy || rest.disabled} onClick={handle} {...rest}>
      {isBusy ? <span className="spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function Field({ label, hint, children, className = '', group }) {
  if (group) {
    return (
      <fieldset className={'field ' + className}>
        <legend className="lbl">{label}</legend>
        {children}
        {hint ? <span className="hint">{hint}</span> : null}
      </fieldset>
    );
  }
  return (
    <label className={'field ' + className}>
      <span className="lbl">{label}</span>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export function Stamp({ status, big, children }) {
  const s = STATUS[status] || { label: status, tone: 'grey' };
  return <span className={`stamp ${s.tone}${big ? ' big' : ''}`}>{children || s.label}</span>;
}

export function Dept({ code }) {
  if (!code) return null;
  return <span className={'dept ' + code} title={`Department ${code}`}>{code}</span>;
}

export function Money({ value, lkr: withLkr }) {
  return <span className="money">{withLkr ? lkr(value) : money(value)}</span>;
}

export function Note({ kind = '', children }) {
  if (!children) return null;
  return <div className={'note ' + kind} role={kind === 'error' ? 'alert' : undefined}>{children}</div>;
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return <Note kind="error">{typeof error === 'string' ? error : errText(error)}</Note>;
}

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action || null}
    </div>
  );
}

export function Loading({ text = 'Loading…' }) {
  return <div className="empty"><p>{text}</p></div>;
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return createPortal(
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/** Ask for a short reason, then run the action. */
export function ReasonModal({ title, label, placeholder, confirm, danger, onClose, onConfirm, extra }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState(null);
  async function go() {
    setErr(null);
    try { await onConfirm(text); onClose(); } catch (e) { setErr(e); }
  }
  return (
    <Modal title={title} onClose={onClose}
      footer={<>
        <Btn onClick={onClose}>Keep it</Btn>
        <Btn className={danger ? 'danger solid' : 'primary'} onClick={go}>{confirm}</Btn>
      </>}>
      <div className="stack">
        {extra}
        <Field label={label}>
          <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} autoFocus />
        </Field>
        <ErrorNote error={err} />
      </div>
    </Modal>
  );
}

export function useAsync(fn, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const seq = useRef(0);
  const run = useCallback(async () => {
    const my = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      if (my === seq.current) setState({ loading: false, data, error: null });
    } catch (error) {
      if (my === seq.current) setState({ loading: false, data: null, error });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run, setData: (d) => setState((s) => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) };
}

export function Photo({ path, alt, className, onOpen }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true;
    if (path) signedUrl(path).then((u) => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [path]);
  if (!path) return <span className="faint small">No photo</span>;
  if (!url) return <span className="faint small">Loading…</span>;
  if (/\.pdf($|\?)/i.test(path)) {
    return <a href={url} target="_blank" rel="noreferrer">Open PDF</a>;
  }
  return <img src={url} alt={alt || ''} className={className} onClick={onOpen ? () => onOpen(url) : undefined} />;
}

export function PhotoViewer({ url, onClose }) {
  if (!url) return null;
  return (
    <Modal title="Photo" onClose={onClose} wide>
      <div className="photo-view"><img src={url} alt="" /></div>
      <p className="small muted" style={{ marginTop: 10 }}><a href={url} target="_blank" rel="noreferrer">Open full size</a></p>
    </Modal>
  );
}

export function Seg({ value, onChange, options }) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? 'on' : ''} aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

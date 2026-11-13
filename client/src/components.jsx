import React, { useState } from 'react';

const PRIORITY_CLASS = { Critical: 'b-crit', High: 'b-high', Medium: 'b-med', Low: 'b-low' };
const STATUS_CLASS = { Pending: 'b-pending', Assigned: 'b-assigned', 'In Progress': 'b-progress', Resolved: 'b-resolved' };

export const PriorityBadge = ({ value }) => value ? <span className={`badge ${PRIORITY_CLASS[value] || ''}`}>{value}</span> : null;
export const StatusBadge = ({ value }) => value ? <span className={`badge ${STATUS_CLASS[value] || ''}`}>{value}</span> : null;

const QUEUE_LABEL = { correction: 'Correction queue', fallback: 'Fallback queue', rejection: 'Rejection queue', waiting: 'Waiting queue' };
export const QueueBadge = ({ value }) => value && value !== 'none' ? <span className="badge b-queue">{QUEUE_LABEL[value]}</span> : null;

export const Card = ({ title, right, children, className = '' }) => (
  <section className={`card ${className}`}>
    {(title || right) && (
      <header className="card-head">
        <h2>{title}</h2>
        {right}
      </header>
    )}
    {children}
  </section>
);

export const Stat = ({ label, value, tone }) => (
  <div className={`stat ${tone || ''}`}>
    <div className="stat-value">{value ?? '–'}</div>
    <div className="stat-label">{label}</div>
  </div>
);

export const ErrorNote = ({ message }) => (message ? <p className="note err" role="alert">{message}</p> : null);

export const Empty = ({ children }) => <p className="muted empty">{children}</p>;

export const Loading = ({ children = 'Loading…' }) => <p className="muted loading" role="status">{children}</p>;

export function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  async function copy() {
    setCopied(false);
    setError('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable in this browser');
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <span className="copy-control">
      <button type="button" className="btn small" onClick={copy} aria-label={`Copy report ID ${value}`}>
        {copied ? 'Copied' : 'Copy ID'}
      </button>
      {error && <span className="copy-error" role="alert">{error}</span>}
    </span>
  );
}

export const LoadBar = ({ load, capacity, available }) => {
  const pct = capacity > 0 ? Math.min(100, Math.round((load / capacity) * 100)) : 100;
  const tone = !available ? 'off' : pct >= 100 ? 'full' : pct >= 70 ? 'warn' : 'ok';
  return (
    <div className="loadbar" title={`${load} of ${capacity}`}>
      <div className={`loadbar-fill ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
};

/** Shows the DFA's path through states for a code. */
export const DfaTrace = ({ trace, accepted }) => {
  if (!trace || trace.length <= 1) return null;
  return (
    <div className="dfa" aria-label="DFA trace">
      {trace.map((t, i) => (
        <span key={i} className={`dfa-step ${t.state === 'qd' ? 'dead' : ''} ${i === trace.length - 1 ? (accepted ? 'acc' : 'rej') : ''}`}>
          {t.read !== null && <em>{t.read}</em>}
          {t.state}
        </span>
      ))}
    </div>
  );
};

export const DecisionList = ({ items }) => (
  <ul className="timeline">
    {items.map((d, i) => (
      <li key={i}>
        <span className="ev">{d.event.replaceAll('_', ' ').toLowerCase()}</span>
        <span>{d.detail}</span>
      </li>
    ))}
  </ul>
);

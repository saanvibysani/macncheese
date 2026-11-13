import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtMoney, usePoll } from '../api.js';
import { Card, CopyButton, DecisionList, DfaTrace, ErrorNote, Loading, PriorityBadge, QueueBadge, StatusBadge } from '../components.jsx';

const EMPTY = { applicantName: '', contact: '', loanCode: '', income: '', amount: '', zone: '', urgency: 'Medium', description: '' };

function FieldHint({ ok, show, children }) {
  if (!show) return null;
  return <small className={ok ? 'hint ok' : 'hint bad'}>{ok ? '✓ ' : '✗ '}{children}</small>;
}

export default function Submit() {
  const { data: meta, error: metaError } = usePoll('/meta', 600000);
  const [form, setForm] = useState(EMPTY);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Live validation through the server's DFA + regex, debounced
  useEffect(() => {
    if (!form.loanCode && !form.income && !form.amount) {
      setPreview(null);
      setPreviewError('');
      return;
    }
    setPreview(null);
    setPreviewError('');
    const id = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const p = await api('/validate', { method: 'POST', body: form });
        if (id === seq.current) { setPreview(p); setPreviewError(''); }
      } catch (e) {
        if (id === seq.current) setPreviewError(e.message);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [form.loanCode, form.income, form.amount, form.description, form.urgency]);

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const r = await api('/reports', { method: 'POST', body: form });
      setResult(r);
      setForm(EMPTY); setPreview(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const c = preview?.checks;
  const codeTouched = form.loanCode.length > 0;
  const incomeTouched = form.income.length > 0;
  const amountTouched = form.amount.length > 0;
  const willCorrect = preview && !preview.valid;

  return (
    <div className="grid two">
      <Card title="New loan application">
        <ErrorNote message={metaError} />
        <form onSubmit={submit} noValidate>
          <div className="row">
            <label>Applicant name
              <input value={form.applicantName} onChange={set('applicantName')} required autoComplete="name" />
            </label>
            <label>Contact (phone or email)
              <input value={form.contact} onChange={set('contact')} autoComplete="off" />
            </label>
          </div>

          <label>Application code
            <input
              value={form.loanCode}
              onChange={set('loanCode')}
              placeholder="LOANH123456"
              className={codeTouched && c ? (c.code.dfa ? 'valid' : 'invalid') : ''}
              spellCheck="false"
              autoCapitalize="characters"
            />
            <small className="muted">LOAN + type (H Home, V Vehicle, P Personal, E Education) + 6 digits</small>
            <FieldHint show={codeTouched && !!c} ok={c?.code.dfa}>
              {c?.code.dfa ? 'Accepted by DFA and regex' : preview?.reasonMessage || 'Code is incomplete or malformed'}
            </FieldHint>
            {codeTouched && c && <DfaTrace trace={c.code.trace} accepted={c.code.dfa} />}
          </label>

          <div className="row">
            <label>Annual income (₹)
              <input inputMode="numeric" value={form.income} onChange={set('income')} className={incomeTouched && c ? (c.income.dfa ? 'valid' : 'invalid') : ''} />
              <FieldHint show={incomeTouched && !!c} ok={c?.income.dfa}>
                {c?.income.dfa ? 'Valid' : 'Whole number, 1 to 99999999, no leading zero'}
              </FieldHint>
            </label>
            <label>Loan amount (₹)
              <input inputMode="numeric" value={form.amount} onChange={set('amount')} className={amountTouched && c ? (c.amount.dfa ? 'valid' : 'invalid') : ''} />
              <FieldHint show={amountTouched && !!c} ok={c?.amount.dfa}>
                {c?.amount.dfa ? fmtMoney(form.amount) : 'Whole number, 1 to 99999999, no leading zero'}
              </FieldHint>
            </label>
          </div>

          <div className="row">
            <label>Zone
              <select value={form.zone} onChange={set('zone')}>
                <option value="">Select zone…</option>
                {(meta?.zones || []).map((z) => <option key={z}>{z}</option>)}
              </select>
            </label>
            <label>Urgency
              <select value={form.urgency} onChange={set('urgency')}>
                {(meta?.priorities || ['Critical', 'High', 'Medium', 'Low']).map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
          </div>

          <label>Description
            <textarea rows="3" value={form.description} onChange={set('description')} placeholder="What is the loan for?" />
          </label>

          <ErrorNote message={error} />
          <button className="btn primary" disabled={busy}>
            {busy ? 'Submitting…' : willCorrect ? 'Submit anyway (goes to correction queue)' : 'Submit application'}
          </button>
        </form>
      </Card>

      <div className="stack">
        <Card title="Live check">
          {previewError ? <ErrorNote message={previewError} /> : !preview && (form.loanCode || form.income || form.amount) ? (
            <Loading>Checking with the DFA and regex…</Loading>
          ) : !preview ? (
            <p className="muted">Start typing a code, income or amount to see validation, category, priority and the branch it would route to.</p>
          ) : (
            <dl className="facts">
              <dt>Validation</dt>
              <dd>{preview.valid ? <span className="badge b-resolved">Valid</span> : <span className="badge b-crit">Invalid</span>}</dd>
              <dt>DFA vs regex</dt>
              <dd>{c.code.agree && c.income.agree && c.amount.agree ? 'Agree on all fields' : 'DISAGREE (bug)'}</dd>
              <dt>Category</dt>
              <dd>{preview.category}{preview.conflict && <small className="muted"> (description hints {preview.hints.join('/')}; code wins)</small>}</dd>
              <dt>Priority</dt>
              <dd><PriorityBadge value={preview.priority} /></dd>
              <dt>Routing key</dt>
              <dd>{preview.routingKey ? <>{preview.routingKey} → <strong>{preview.branch || 'no route (fallback)'}</strong></> : '–'}</dd>
              {!preview.valid && (<><dt>Reason</dt><dd>{preview.reasonMessage}</dd></>)}
            </dl>
          )}
        </Card>

        {result && (
          <Card title="Application submitted" className="result">
            <p className="idline">Report ID <code>{result.reportId}</code> <CopyButton value={result.reportId} /></p>
            <dl className="facts">
              <dt>Category</dt><dd>{result.category}</dd>
              <dt>Priority</dt><dd><PriorityBadge value={result.priority} /></dd>
              <dt>Status</dt><dd><StatusBadge value={result.status} /> <QueueBadge value={result.queue} /></dd>
              {result.handlerCode && (<><dt>Handler</dt><dd>{result.handlerCode} ({result.assignedVia})</dd></>)}
              {result.queueReason && (<><dt>Reason</dt><dd>{result.validation?.reasonMessage || result.queueReason}</dd></>)}
            </dl>
            <h3>Routing decisions</h3>
            <DecisionList items={result.decisions} />
            <Link to="/dashboard" state={{ id: result.reportId }}>Track this report →</Link>
          </Card>
        )}
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api, fmtDate, fmtMoney, usePoll } from '../api.js';
import { Card, CopyButton, DecisionList, Empty, ErrorNote, Loading, PriorityBadge, QueueBadge, Stat, StatusBadge } from '../components.jsx';

function CorrectionForm({ report, zones, onResubmitted }) {
  const [form, setForm] = useState({
    loanCode: report.loanCode || '',
    income: report.income || '',
    amount: report.amount || '',
    zone: report.zone || '',
    urgency: report.urgency || 'Medium',
    description: report.description || '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm((current) => ({ ...current, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const updated = await api(`/reports/${encodeURIComponent(report.reportId)}/resubmit`, { method: 'PATCH', body: form });
      onResubmitted(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="correction-form" aria-labelledby="correction-heading">
      <h3 id="correction-heading">Correct and resubmit</h3>
      <p className="muted small">Update the application details and submit them for validation and routing again.</p>
      <form onSubmit={submit}>
        <div className="row">
          <label>Application code
            <input value={form.loanCode} onChange={set('loanCode')} />
          </label>
          <label>Zone
            <select value={form.zone} onChange={set('zone')}>
              <option value="">Select zone…</option>
              {zones.map((zone) => <option key={zone}>{zone}</option>)}
            </select>
          </label>
        </div>
        <div className="row">
          <label>Annual income (₹)
            <input inputMode="numeric" value={form.income} onChange={set('income')} />
          </label>
          <label>Loan amount (₹)
            <input inputMode="numeric" value={form.amount} onChange={set('amount')} />
          </label>
        </div>
        <div className="row">
          <label>Urgency
            <select value={form.urgency} onChange={set('urgency')}>
              <option>Critical</option><option>High</option><option>Medium</option><option>Low</option>
            </select>
          </label>
          <label>Description
            <input value={form.description} onChange={set('description')} />
          </label>
        </div>
        <ErrorNote message={error} />
        <button className="btn primary" disabled={busy}>{busy ? 'Resubmitting…' : 'Resubmit application'}</button>
      </form>
    </section>
  );
}

export default function UserDashboard() {
  const location = useLocation();
  const { data: stats, error: statsError } = usePoll('/stats');
  const { data: recent, error: recentError } = usePoll('/reports');
  const { data: meta } = usePoll('/meta', 600000);
  const [id, setId] = useState(location.state?.id || '');
  const [found, setFound] = useState(null);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);

  async function search(value) {
    const q = (value ?? id).trim();
    if (!q) return;
    setError(''); setFound(null);
    setSearching(true);
    try {
      setFound(await api(`/reports/${encodeURIComponent(q)}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => { if (location.state?.id) search(location.state.id); /* eslint-disable-next-line */ }, []);

  return (
    <div className="stack">
      <ErrorNote message={statsError} />
      <div className="stats">
        {stats ? <>
          <Stat label="Total reports" value={stats.total} />
          <Stat label="Pending" value={stats.pending} tone="amber" />
          <Stat label="Assigned" value={stats.assigned} tone="blue" />
          <Stat label="In progress" value={stats.inProgress} tone="violet" />
          <Stat label="Resolved" value={stats.resolved} tone="green" />
        </> : statsError ? <Empty>Report counts could not be loaded.</Empty> : <Loading>Loading report counts…</Loading>}
      </div>

      <Card title="Track a report">
        <form className="inline" onSubmit={(e) => { e.preventDefault(); search(); }}>
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="e.g. LAP-261113-A1B2C3" aria-label="Report ID" />
          <button className="btn primary" disabled={searching}>{searching ? 'Searching…' : 'Search'}</button>
        </form>
        <ErrorNote message={error} />
        {found && (
          <div className="found">
            <div className="idline">
              <code>{found.reportId}</code> <CopyButton value={found.reportId} /> <StatusBadge value={found.status} /> <QueueBadge value={found.queue} />
            </div>
            <dl className="facts">
              <dt>Applicant</dt><dd>{found.applicantName}</dd>
              <dt>Category</dt><dd>{found.category}</dd>
              <dt>Priority</dt><dd><PriorityBadge value={found.priority} /></dd>
              <dt>Handler</dt><dd>{found.handlerCode ? `${found.handlerCode} (${found.assignedVia})` : 'Not assigned yet'}</dd>
              <dt>Amount</dt><dd>{fmtMoney(found.amount)}</dd>
              <dt>Submitted</dt><dd>{fmtDate(found.createdAt)}</dd>
              {found.queueReason && (<><dt>Why queued</dt><dd>{found.validation?.reasonMessage || found.queueReason}</dd></>)}
            </dl>
            <h3>History</h3>
            <DecisionList items={found.decisions} />
            {found.queue === 'correction' && (
              <CorrectionForm
                key={`${found.reportId}-${found.updatedAt}`}
                report={found}
                zones={meta?.zones || []}
                onResubmitted={setFound}
              />
            )}
          </div>
        )}
      </Card>

      <Card title="Recent reports">
        <ErrorNote message={recentError} />
        {!recent ? recentError ? <Empty>Recent reports could not be loaded.</Empty> : <Loading>Loading recent reports…</Loading> : !recent.length ? <Empty>No reports yet. Submit one from the Submit page.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Report ID</th><th>Applicant</th><th>Category</th><th>Priority</th><th>Status</th><th>Handler</th></tr></thead>
              <tbody>
                {recent.slice(0, 15).map((r) => (
                  <tr key={r.reportId} onClick={() => { setId(r.reportId); search(r.reportId); }} className="click">
                    <td><code>{r.reportId}</code></td>
                    <td>{r.applicantName}</td>
                    <td>{r.category}</td>
                    <td><PriorityBadge value={r.priority} /></td>
                    <td><StatusBadge value={r.status} /> <QueueBadge value={r.queue} /></td>
                    <td>{r.handlerCode || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

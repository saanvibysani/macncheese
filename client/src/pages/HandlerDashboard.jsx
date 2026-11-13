import React, { useEffect, useState } from 'react';
import { api, fmtDate, fmtMoney, usePoll } from '../api.js';
import { Card, Empty, ErrorNote, LoadBar, Loading, PriorityBadge, StatusBadge } from '../components.jsx';

const NEXT = { Assigned: 'In Progress', 'In Progress': 'Resolved' };

export default function HandlerDashboard() {
  const { data: handlers, reload: reloadHandlers, error: hErr } = usePoll('/handlers');
  const [code, setCode] = useState('');
  const current = handlers?.find((h) => h.code === code);
  const { data: reports, reload: reloadReports, error: reportsError } = usePoll(code ? `/handlers/${code}/reports` : '/stats', 6000);
  const [capacity, setCapacity] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { if (!code && handlers?.length) setCode(handlers[0].code); }, [handlers, code]);
  useEffect(() => { if (current) setCapacity(String(current.capacity)); }, [current?.code, current?.capacity]); // eslint-disable-line

  async function patchHandler(patch) {
    setError('');
    try {
      await api(`/handlers/${code}`, { method: 'PATCH', body: patch });
      await Promise.all([reloadHandlers(), reloadReports()]);
    } catch (e) { setError(e.message); }
  }

  async function advance(r) {
    setError('');
    try {
      await api(`/reports/${r.reportId}/status`, { method: 'PATCH', body: { status: NEXT[r.status] } });
      await Promise.all([reloadHandlers(), reloadReports()]);
    } catch (e) { setError(e.message); }
  }

  const list = Array.isArray(reports) ? reports : [];

  return (
    <div className="stack">
      <ErrorNote message={hErr} />
      <ErrorNote message={reportsError} />
      <Card title="Handler" right={
        <select value={code} onChange={(e) => setCode(e.target.value)} aria-label="Select handler">
          {(handlers || []).map((h) => <option key={h.code} value={h.code}>{h.code} · {h.name}</option>)}
        </select>
      }>
        {!handlers && (hErr ? <Empty>Handler data could not be loaded.</Empty> : <Loading>Loading handlers…</Loading>)}
        {current && (
          <div className="grid two tight">
            <div>
              <p className="muted">Load {current.load} / {current.capacity}</p>
              <LoadBar load={current.load} capacity={current.capacity} available={current.available} />
            </div>
            <div className="controls">
              <label className="switch">
                <input type="checkbox" checked={current.available} onChange={(e) => patchHandler({ available: e.target.checked })} />
                <span>{current.available ? 'Available' : 'Unavailable'}</span>
              </label>
              <form className="inline" onSubmit={(e) => { e.preventDefault(); patchHandler({ capacity: Number(capacity) }); }}>
                <label className="compact">Capacity
                  <input type="number" min="0" max="100" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
                </label>
                <button className="btn">Save</button>
              </form>
            </div>
          </div>
        )}
        <ErrorNote message={error} />
      </Card>

      <Card title="Assigned reports">
        {!code ? hErr ? <Empty>Assigned reports could not be loaded.</Empty> : <Loading>Loading handlers…</Loading> : !Array.isArray(reports) ? reportsError ? <Empty>Assigned reports could not be loaded.</Empty> : <Loading>Loading assigned reports…</Loading> : !list.length ? <Empty>No active reports for this handler.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Report ID</th><th>Category</th><th>Zone</th><th>Amount</th><th>Priority</th><th>Submitted</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.reportId}>
                    <td><code>{r.reportId}</code></td>
                    <td>{r.category}</td>
                    <td>{r.zone}</td>
                    <td>{fmtMoney(r.amount)}</td>
                    <td><PriorityBadge value={r.priority} /></td>
                    <td>{fmtDate(r.createdAt)}</td>
                    <td><StatusBadge value={r.status} /></td>
                    <td>{NEXT[r.status] && <button className="btn small" onClick={() => advance(r)}>Mark {NEXT[r.status]}</button>}</td>
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

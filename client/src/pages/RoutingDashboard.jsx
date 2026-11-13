import React from 'react';
import { fmtDate, usePoll } from '../api.js';
import { Card, Empty, ErrorNote, LoadBar, PriorityBadge } from '../components.jsx';

const QUEUES = [
  ['waiting', 'Waiting queue', 'Handlers full or unavailable. Ordered by priority, then first in first out.'],
  ['correction', 'Correction queue', 'Invalid identifier or fields. Needs correction by the officer.'],
  ['fallback', 'Fallback queue', 'Unknown zone or routing key.'],
  ['rejection', 'Rejection queue', 'Valid but ineligible: amount above 10 times income.'],
];

const EVENT_LABEL = {
  BACKUP_ASSIGNED: 'Backup assigned',
  ESCALATED: 'Escalated',
  PRIORITY_OVERRIDE: 'Priority override',
  QUEUED_WAITING: 'Queued to wait',
};

function QueueTable({ rows }) {
  if (!rows.length) return <Empty>Empty.</Empty>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Report ID</th><th>Category</th><th>Priority</th><th>Key</th><th>Reason</th><th>Submitted</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.reportId}>
              <td>{i + 1}</td>
              <td><code>{r.reportId}</code></td>
              <td>{r.category}</td>
              <td><PriorityBadge value={r.priority} /></td>
              <td>{r.routingKey || '–'}</td>
              <td>{r.queueReason}</td>
              <td>{fmtDate(r.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RoutingDashboard() {
  const { data, error } = usePoll('/routing', 6000);
  if (!data) return error ? <ErrorNote message={error} /> : <p className="muted">Loading…</p>;

  return (
    <div className="stack">
      <ErrorNote message={error} />
      <div className="grid two">
        <Card title="Routing table">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Key</th><th>Applies to</th><th>Zone</th><th>Priority</th><th>Handler</th><th>Backup</th></tr></thead>
              <tbody>
                {data.table.map((r) => (
                  <tr key={r.key}>
                    <td><code>{r.key}</code></td>
                    <td>{r.description}</td>
                    <td>{r.zones}</td>
                    <td>{r.priorities}</td>
                    <td><strong>{r.handler}</strong></td>
                    <td>{r.backups.join(', ') || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">Zones and priorities apply to every route; {data.table[0]?.priorityRule || 'Critical reports escalate when no handler has room'}.</p>
        </Card>

        <Card title="Handler load">
          <ul className="loads">
            {data.handlers.map((h) => (
              <li key={h.code}>
                <div className="load-head">
                  <strong>{h.code}</strong>
                  <span className="muted">{h.name}</span>
                  <span className={`badge ${h.available ? 'b-resolved' : 'b-queue'}`}>{h.available ? 'Available' : 'Unavailable'}</span>
                  <span className="load-num">{h.load}/{h.capacity}</span>
                </div>
                <LoadBar load={h.load} capacity={h.capacity} available={h.available} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Escalation and priority decisions">
        {!data.decisions.length ? <Empty>No backup, escalation or priority-override decisions yet.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>When</th><th>Report</th><th>Priority</th><th>Decision</th><th>Detail</th></tr></thead>
              <tbody>
                {data.decisions.map((d, i) => (
                  <tr key={i}>
                    <td>{fmtDate(d.at)}</td>
                    <td><code>{d.reportId}</code></td>
                    <td><PriorityBadge value={d.priority} /></td>
                    <td>{EVENT_LABEL[d.event] || d.event}</td>
                    <td>{d.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {QUEUES.map(([key, title, help]) => (
        <Card key={key} title={`${title} (${data.queues[key].length})`}>
          <p className="muted small">{help}</p>
          <QueueTable rows={data.queues[key]} />
        </Card>
      ))}
    </div>
  );
}

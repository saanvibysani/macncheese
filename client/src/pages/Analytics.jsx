import React from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { usePoll } from '../api.js';
import { Card, Empty, ErrorNote, Stat } from '../components.jsx';

const COLORS = ['#2f6fed', '#14a38b', '#e8a317', '#8b5cf6', '#e5484d', '#6b7280'];

function BarCard({ title, rows }) {
  return (
    <Card title={title}>
      {!rows?.length ? <Empty>No data yet.</Empty> : (
        <div className="chart">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip cursor={{ fill: 'rgba(47,111,237,0.08)' }} />
              <Bar dataKey="count" name="Reports" radius={[4, 4, 0, 0]}>
                {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

export default function Analytics() {
  const { data, error } = usePoll('/analytics', 10000);
  if (!data) return error ? <ErrorNote message={error} /> : <p className="muted">Loading…</p>;

  const split = [
    { name: 'Resolved', value: data.resolved },
    { name: 'Unresolved', value: data.unresolved },
  ];
  const rate = data.total ? Math.round((data.resolved / data.total) * 100) : 0;

  return (
    <div className="stack">
      <ErrorNote message={error} />
      <div className="stats">
        <Stat label="Total reports" value={data.total} />
        <Stat label="Resolved" value={data.resolved} tone="green" />
        <Stat label="Unresolved" value={data.unresolved} tone="amber" />
        <Stat label="Resolution rate" value={`${rate}%`} tone="blue" />
      </div>

      <div className="grid two">
        <BarCard title="Reports by zone" rows={data.byZone} />
        <BarCard title="Reports by category" rows={data.byCategory} />
        <Card title="Resolved vs unresolved">
          {!data.total ? <Empty>No data yet.</Empty> : (
            <div className="chart">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={split} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    <Cell fill="#14a38b" />
                    <Cell fill="#e8a317" />
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <BarCard title="Reports by handler" rows={data.byHandler} />
        <BarCard title="Reports by status" rows={data.byStatus} />
        <BarCard title="Reports by queue" rows={data.byQueue} />
      </div>
    </div>
  );
}

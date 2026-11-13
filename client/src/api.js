import { useCallback, useEffect, useRef, useState } from 'react';

const BASE = import.meta.env.VITE_API_URL || '';

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the server. Is the backend running on port 5000?');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/** Load data and refresh every `ms` milliseconds. */
export function usePoll(path, ms = 8000) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const d = await api(path);
      if (alive.current) { setData(d); setError(''); }
    } catch (e) {
      if (alive.current) setError(e.message);
    }
  }, [path]);

  useEffect(() => {
    alive.current = true;
    load();
    const t = setInterval(load, ms);
    return () => { alive.current = false; clearInterval(t); };
  }, [load, ms]);

  return { data, error, reload: load };
}

export const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');
export const fmtMoney = (n) => (n === undefined || n === null || n === '' ? '' : `₹${Number(n).toLocaleString('en-IN')}`);

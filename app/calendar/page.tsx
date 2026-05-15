'use client'

import React, { useEffect, useMemo, useState } from 'react';
import { getAllTransactions } from '../lib/db';
import { parseDateStringToMs } from '../lib/format';

function formatEuro(cents: number) {
  const sign = cents < 0 ? '-' : '';
  const a = Math.abs(cents);
  const euros = Math.floor(a / 100);
  const rem = String(Math.abs(a % 100)).padStart(2, '0');
  return `${sign}${euros},${rem} €`;
}

export default function CalendarHeatmapPage() {
  const [txs, setTxs] = useState<any[]>([]);
  useEffect(() => {
    async function load() {
      const arr = await getAllTransactions();
      setTxs(arr);
    }
    load();
  }, []);

  const { dayKeys, totals, maxAbs } = useMemo(() => {
    // Build last 365 days array
    const days: Date[] = [];
    const today = new Date();
    // use local today but align to UTC midnight for consistency
    const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    for (let i = 364; i >= 0; i--) {
      const d = new Date(end.getTime() - i * 24 * 60 * 60 * 1000);
      days.push(d);
    }

    const map = new Map<string, number>();
    for (const d of days) {
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
      map.set(key, 0);
    }

    let max = 0;
    for (const t of txs) {
      const ms = parseDateStringToMs(t.date);
      if (isNaN(ms)) continue;
      const d = new Date(ms);
      // parseDateStringToMs returns UTC midnight ms; use UTC fields
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
      const prev = map.get(key) ?? 0;
      const next = prev + (t.amount ?? 0);
      map.set(key, next);
      if (Math.abs(next) > max) max = Math.abs(next);
    }

    return { dayKeys: days.map(d => `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`), totals: map, maxAbs: max };
  }, [txs]);

  // Build weeks (columns) x 7 rows layout
  const weeksCount = Math.ceil(dayKeys.length / 7);
  const weeks: string[][] = Array.from({ length: weeksCount }, (_, i) => []);
  for (let i = 0; i < dayKeys.length; i++) {
    const week = Math.floor(i / 7);
    weeks[week].push(dayKeys[i]);
  }

  return (
    <div className="p-4">
      <h1 className="app-h1 mb-4">Calendar Heatmap</h1>
      <p className="mb-4 small-muted">Last 365 days — green = received, red = spent. Hover for amounts.</p>

      <div className="flex gap-3 items-start">
        <div style={{ display: 'flex', gap: 4 }}>
          {/* weeks as vertical columns */}
          {weeks.map((col, ci) => (
            <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {col.map((k) => {
                const cents = totals.get(k) ?? 0;
                let bg = '#e6edf0';
                let opacity = 0.0;
                if (cents > 0 && maxAbs > 0) {
                  opacity = Math.min(0.95, Math.abs(cents) / maxAbs);
                  bg = `rgba(16,185,129,${Math.max(0.08, opacity)})`; // green
                } else if (cents < 0 && maxAbs > 0) {
                  opacity = Math.min(0.95, Math.abs(cents) / maxAbs);
                  bg = `rgba(239,68,68,${Math.max(0.08, opacity)})`; // red
                } else {
                  bg = '#0f172a20';
                }
                const d = new Date(k);
                const title = `${String(d.getUTCDate()).padStart(2,'0')}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${d.getUTCFullYear()}: ${formatEuro(cents)}`;
                return (
                  <div key={k} title={title} style={{ width: 14, height: 14, background: bg, borderRadius: 3, border: '1px solid rgba(255,255,255,0.03)' }} />
                );
              })}
            </div>
          ))}
        </div>

        <div className="ml-4">
          <div className="mb-2 font-medium">Legend</div>
          <div className="flex items-center gap-2 mb-1"><div style={{ width: 16, height: 16, background: 'rgba(16,185,129,0.9)', borderRadius: 3 }} /> <div>Money received (green)</div></div>
          <div className="flex items-center gap-2 mb-1"><div style={{ width: 16, height: 16, background: 'rgba(239,68,68,0.9)', borderRadius: 3 }} /> <div>Money spent (red)</div></div>
          <div className="mt-3 text-sm small-muted">Max absolute daily amount: {formatEuro(maxAbs)}</div>
        </div>
      </div>
    </div>
  );
}

'use client'

import React, { useEffect, useState } from 'react';
import { getAllEntities, getAllTransactions, getAllGroupExpenses } from '../../app/lib/db';
import type { Entity } from '../../app/lib/types';

function formatCents(cents: number) {
  const sign = cents < 0 ? '-' : '';
  const a = Math.abs(cents);
  const euros = Math.floor(a / 100);
  const rem = Math.abs(a % 100).toString().padStart(2, '0');
  return `${sign}${euros},${rem} €`;
}

export default function EntitiesPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [totals, setTotals] = useState<Record<string,{sent:number;received:number;groups:number}>>({});

  useEffect(() => {
    async function load() {
      const es = await getAllEntities();
      const txs = await getAllTransactions();
      const groups = await getAllGroupExpenses();

      const tmap: Record<string,{sent:number;received:number;groups:Set<string>}> = {};
      for (const e of es) tmap[e.id] = { sent:0, received:0, groups: new Set() };

      for (const t of txs) {
        if (!t.entityId) continue;
        const rec = tmap[t.entityId];
        if (!rec) continue;
        if (t.amount < 0) rec.sent += t.amount; else rec.received += t.amount;
      }

      for (const g of groups) {
        for (const pid of g.participantTransactionIds) {
          const pt = txs.find(x => x.id === pid);
          if (!pt || !pt.entityId) continue;
          const rec = tmap[pt.entityId];
          if (!rec) continue;
          rec.groups.add(g.id);
        }
      }

      const totals: Record<string,{sent:number;received:number;groups:number}> = {};
      for (const [id, rec] of Object.entries(tmap)) {
        totals[id] = { sent: rec.sent, received: rec.received, groups: rec.groups.size };
      }

      setEntities(es);
      setTotals(totals);
    }
    load();
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-4">Entities</h1>
      <div className="grid gap-3">
        {entities.map(e => {
          const t = totals[e.id] ?? { sent:0, received:0, groups:0 };
          return (
            <div key={e.id} className="p-3 border rounded">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{e.name || e.bankName}</div>
                  <div className="text-sm text-zinc-600">{e.bankName}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm">Sent: <strong>{formatCents(t.sent)}</strong></div>
                  <div className="text-sm">Received: <strong>{formatCents(t.received)}</strong></div>
                  <div className="text-sm">Linked groups: <strong>{t.groups}</strong></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

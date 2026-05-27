'use client'

import React, { useEffect, useState } from 'react';
import { getAllEntities, getAllTransactions, getAllGroupExpenses } from '../lib/db';
import type { Entity } from '../lib/types';
import { Box, Card, CardContent, Stack, Typography } from '@mui/material';

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
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>Entities</Typography>

      <Stack spacing={2}>
        {entities.map(e => {
          const t = totals[e.id] ?? { sent:0, received:0, groups:0 };
          return (
            <Card key={e.id} variant="outlined">
              <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography sx={{ fontWeight: 600 }}>{e.name || e.bankName}</Typography>
                  {e.bankName ? <Typography variant="body2" color="text.secondary">{e.bankName}</Typography> : null}
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="body2">Sent: <strong>{formatCents(t.sent)}</strong></Typography>
                  <Typography variant="body2">Received: <strong>{formatCents(t.received)}</strong></Typography>
                  <Typography variant="body2">Linked groups: <strong>{t.groups}</strong></Typography>
                </Box>
              </CardContent>
            </Card>
          );
        })}
      </Stack>
    </Box>
  );
}

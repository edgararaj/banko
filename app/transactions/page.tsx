'use client'

import React, { useEffect, useMemo, useState } from 'react';
import { getAllTransactions, getAllEntities } from '../lib/db';
import { parseDateStringToMs } from '../lib/format';
import TransactionsList from '../components/TransactionsList';
import type { Transaction } from '../lib/types';

function formatCents(cents: number) {
  const sign = cents < 0 ? '-' : '';
  const a = Math.abs(cents);
  const euros = Math.floor(a / 100);
  const rem = Math.abs(a % 100).toString().padStart(2, '0');
  return `${sign}${euros},${rem} €`;
}

export default function TransactionsPage() {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [entitiesMap, setEntitiesMap] = useState<Record<string,string>>({});
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const [filterEntity, setFilterEntity] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [filterAmountMin, setFilterAmountMin] = useState<string>('');
  const [filterAmountMax, setFilterAmountMax] = useState<string>('');

  useEffect(() => {
    async function load() {
      const arr = await getAllTransactions();
      // sort descending by date (handle dd-mm-yyyy stored dates)
      arr.sort((a,b) => parseDateStringToMs(b.date) - parseDateStringToMs(a.date));
      setTxs(arr);
      const es = await getAllEntities();
      const m: Record<string,string> = {};
      for (const e of es) m[e.id] = e.name || e.bankName || '__unknown__';
      setEntitiesMap(m);
    }
    load();
  }, []);

  const handleCreateGroup = async (anchorId: string) => {
    setCreatingId(anchorId);
    try {
      const mod = await import('../../app/lib/inference');
      const ok = await mod.inferCustomGroup(anchorId, 0);
      if (ok) {
        alert('Group created');
      } else {
        alert('No valid group created for this anchor');
      }
    } catch (err) {
      console.error('create group failed', err);
      alert('Failed to create group');
    } finally {
      setCreatingId(null);
    }
  };

  const filtered = useMemo(() => {
    return txs.filter(t => {
      if (filterEntity && t.entityId !== filterEntity) return false;
      if (filterDateFrom && parseDateStringToMs(t.date) < parseDateStringToMs(filterDateFrom)) return false;
      if (filterDateTo && parseDateStringToMs(t.date) > parseDateStringToMs(filterDateTo)) return false;
      const amt = t.amount;
      if (filterAmountMin) {
        const minCents = Math.round(parseFloat(filterAmountMin || '0') * 100);
        if (amt < minCents) return false;
      }
      if (filterAmountMax) {
        const maxCents = Math.round(parseFloat(filterAmountMax || '0') * 100);
        if (amt > maxCents) return false;
      }
      return true;
    });
  }, [txs, filterEntity, filterDateFrom, filterDateTo, filterAmountMin, filterAmountMax]);

  return (
    <div className="p-4">
      <h1 className="app-h1 mb-4">Transactions</h1>
      <div className="mb-4 grid gap-2 grid-cols-1 md:grid-cols-4">
        <select value={filterEntity} onChange={e => setFilterEntity(e.target.value)} className="border p-2 rounded">
          <option value="">All entities</option>
          {Object.entries(entitiesMap).map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="border p-2 rounded" placeholder="From" />
        <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="border p-2 rounded" placeholder="To" />
        <div className="flex gap-2">
          <input type="number" step="0.01" value={filterAmountMin} onChange={e => setFilterAmountMin(e.target.value)} className="border p-2 rounded" placeholder="Min (€)" />
          <input type="number" step="0.01" value={filterAmountMax} onChange={e => setFilterAmountMax(e.target.value)} className="border p-2 rounded" placeholder="Max (€)" />
        </div>
      </div>

      <div className="overflow-x-auto">
        {/* Reuse TransactionsList component */}
        <TransactionsList transactions={filtered} entitiesMap={entitiesMap} createGroupHandler={handleCreateGroup} />
      </div>
    </div>
  );
}

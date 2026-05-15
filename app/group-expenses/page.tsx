'use client'

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getAllGroupExpenses, getAllTransactions, getAllEntities, updateGroupExpense, deleteGroupExpense, getTransactionsByDateRange } from '../lib/db';
import type { GroupExpense } from '../lib/types';
import TransactionsList from '../components/TransactionsList';
import { parseDateStringToMs } from '../lib/format';
import { sumReimbursements, participantCountForGroup, remainingExcludingPayer, remainingIncludingPayer, candidateTransfersNearAnchor } from '../lib/group';

function formatCents(cents: number) {
  const sign = cents < 0 ? '-' : '';
  const a = Math.abs(cents);
  const euros = Math.floor(a / 100);
  const rem = Math.abs(a % 100).toString().padStart(2, '0');
  return `${sign}${euros},${rem} €`;
}

export default function GroupExpensesPage() {
  const [groups, setGroups] = useState<GroupExpense[]>([]);
  const [txs, setTxs] = useState<any[]>([]);
  const [entities, setEntities] = useState<Record<string,string>>({});
  const [editing, setEditing] = useState<any>(null);
  const [showSelector, setShowSelector] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');

  useEffect(() => {
    async function load() {
      const gs = await getAllGroupExpenses();
      setGroups(gs);
      const allTx = await getAllTransactions();
      setTxs(allTx);
      const es = await getAllEntities();
      const map: Record<string,string> = {};
      for (const e of es) map[e.id] = e.name || e.bankName || '__unknown__';
      setEntities(map);

      if (editId) {
        const g = gs.find(x => x.id === editId);
        setEditing(g || null);
      } else setEditing(null);
    }
    load();
  }, [editId]);

  if (editing) {
    // render full-screen editor when ?edit=ID is present
    const ed = editing;
    const anchorTx = txs.find(x => x.id === ed.anchorTransactionId);
    const DAY_MS = 10 * 24 * 60 * 60 * 1000;
    let selectorCandidates: any[] = [];
    if (anchorTx) {
      selectorCandidates = candidateTransfersNearAnchor(txs, anchorTx, 10, 0.5);
      const existingSet = new Set(ed.participantTransactionIds || []);
      selectorCandidates = selectorCandidates.filter(t => !existingSet.has(t.id));
    }

    // compute participants and remaining (exclude payer's own share)
    const sumReimb = sumReimbursements(txs, ed.participantTransactionIds);
    const participantCount = participantCountForGroup(ed, ed.participantTransactionIds);
    const remainingExcludingMyShare = remainingExcludingPayer(ed.totalAmount, txs, ed.participantTransactionIds, ed.friendCount, ed.extraExpenses ?? 0);

    return (
      <div className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.push('/group-expenses')} className="px-2 py-1 border rounded">Back</button>
          <h1 className="app-h1">Edit Group</h1>
        </div>

        <div className="mb-2">Total: <strong>{formatCents(ed.totalAmount)}</strong></div>
        <div className="mb-2 flex items-center gap-2">Extra expenses:
          <input type="number" step="0.01" value={((ed.extraExpenses ?? 0)/100).toFixed(2)} onChange={e => {
            const v = Math.round((parseFloat(e.target.value || '0') || 0) * 100);
            setEditing((prev: any) => ({ ...prev, extraExpenses: v }));
          }} className="ml-2 border p-1 rounded w-28 bg-[#071022] text-white" />
          <strong>{formatCents(ed.extraExpenses ?? 0)}</strong>
        </div>
        <div className="mb-2">Participants: <strong>{participantCount}</strong></div>
        <div className="mb-2">Remaining (excluding my share): <strong>{formatCents(remainingExcludingMyShare)}</strong></div>
        <div className="mb-2">Date window: {ed.dateWindow?.start} → {ed.dateWindow?.end}</div>
        <div className="mb-2">Anchor Tx ID: {ed.anchorTransactionId}</div>
        <div className="mb-2 text-sm small-muted">Anchor description: {( () => {
          const a = txs.find(x => x.id === ed.anchorTransactionId);
          return a ? (a.description ?? '') : '';
        })()}</div>
        <div className="mb-2 text-sm small-muted">Anchor name: {( () => {
          const a = txs.find(x => x.id === ed.anchorTransactionId);
          return a ? (a.entityId ? (entities[a.entityId] ?? a.entityId) : '') : '';
        })()}</div>

        <div className="mt-4">
          <h4 className="font-medium">Participants</h4>
          <div className="mt-2 grid gap-2">
            {(ed.participantTransactionIds || []).map((pid: string) => {
              const t = txs.find(x => x.id === pid);
              return (
                <div key={pid} className="p-2 border rounded flex justify-between items-start">
                  <div>
                    <div className="text-sm">{t ? t.date : pid}</div>
                    <div className="text-sm">{t ? formatCents(t.amount) : ''}</div>
                    <div className="text-xs text-zinc-600">{t && t.entityId ? (entities[t.entityId] ?? t.entityId) : 'unknown'}</div>
                  </div>
                  <button onClick={() => { const updated = { ...ed, participantTransactionIds: ed.participantTransactionIds.filter((x:string)=>x!==pid) }; setEditing(updated); }} className="text-red-600">Remove</button>
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            <button onClick={() => setShowSelector(true)} className="px-2 py-1 bg-blue-600 text-white rounded text-sm">Add participant transfer</button>
          </div>

          {showSelector && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
              <div className="bg-[#0b1221] w-11/12 max-w-3xl p-4 rounded shadow-lg max-h-[80vh] overflow-hidden flex flex-col text-white">
                <h4 className="font-medium">Select transfers to add</h4>
                <div className="mt-3 flex-1 overflow-auto">
                  <TransactionsList transactions={selectorCandidates} selectable={true} onConfirm={(ids) => {
                    const unique = new Set([...(ed.participantTransactionIds || []), ...ids]);
                    const updated = { ...ed, participantTransactionIds: Array.from(unique) };
                    setEditing(updated);
                    // also update groups state so list reflects changes after save
                    setGroups(gs => gs.map(g => g.id === updated.id ? updated : g));
                    setShowSelector(false);
                  }} />
                </div>
                <div className="mt-3 flex justify-end">
                  <button onClick={() => setShowSelector(false)} className="px-3 py-2 border rounded">Close</button>
                </div>
              </div>
            </div>
          )}

        </div>

        <div className="mt-6 flex gap-2">
          <button onClick={async () => {
            try {
              const distinctEntities = new Set<string>();
              for (const pid of ed.participantTransactionIds || []) {
                const t = txs.find(x => x.id === pid);
                if (t && t.entityId) distinctEntities.add(t.entityId);
              }
              const toSave = { ...ed, friendCount: distinctEntities.size > 0 ? distinctEntities.size : (ed.participantTransactionIds?.length ?? 0), status: 'modified' };
              await updateGroupExpense(toSave);
              router.push('/group-expenses');
            } catch (err) { console.error(err); alert('Save failed'); }
          }} className="px-3 py-2 bg-green-600 text-white rounded">Save</button>
          <button onClick={() => router.push('/group-expenses')} className="px-3 py-2 border rounded">Cancel</button>
          <button onClick={async () => { try { await deleteGroupExpense(ed.id); router.push('/group-expenses'); } catch (err) { console.error(err); alert('Delete failed'); } }} className="px-3 py-2 bg-red-600 text-white rounded">Mark Deleted</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-4">Group Expenses</h2>
      <div className="grid gap-2">
        {groups.map(g => {
          const anchor = txs.find(t => t.id === g.anchorTransactionId);
          const anchorName = anchor ? (anchor.entityId ? (entities[anchor.entityId] || anchor.entityId) : '') : '';
          const anchorDesc = anchor ? (anchor.description ?? '') : '';
          const remaining = remainingExcludingPayer(g.totalAmount, txs, g.participantTransactionIds, g.friendCount, g.extraExpenses ?? 0);
          const participantCount = participantCountForGroup(g, g.participantTransactionIds);
          return (
            <button key={g.id} onClick={() => router.push(`/group-expenses?edit=${g.id}`)} className="text-left p-2 border rounded">
              <div className="font-medium">{formatCents(g.totalAmount)} — {g.status}</div>
              <div className="text-sm small-muted">Anchor: {anchorDesc} {anchorName ? ` — ${anchorName}` : ''}</div>
              <div className="text-sm small-muted">Participants: {participantCount} • Remaining: {formatCents(remaining)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

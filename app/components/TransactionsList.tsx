'use client'

import React, { useEffect, useState } from 'react';
import { getAllTransactions, getAllEntities } from '../lib/db';
import { formatDateDisplay, parseDateStringToMs } from '../lib/format';
import type { Transaction } from '../lib/types';

type Props = {
  transactions?: Transaction[];
  entitiesMap?: Record<string,string>;
  selectable?: boolean;
  onConfirm?: (ids: string[]) => void;
  createGroupHandler?: (id: string) => void;
};

function formatCents(cents: number) {
  const sign = cents < 0 ? '-' : '';
  const a = Math.abs(cents);
  const euros = Math.floor(a / 100);
  const rem = Math.abs(a % 100).toString().padStart(2, '0');
  return `${sign}${euros},${rem} €`;
}

export default function TransactionsList(props: Props) {
  // ensure dark-mode container class
  const { transactions: txsProp, entitiesMap: emapProp, selectable, onConfirm, createGroupHandler } = props;
  const [fetchedTxs, setFetchedTxs] = useState<Transaction[] | null>(null);
  const [fetchedEntities, setFetchedEntities] = useState<Record<string,string> | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function load() {
      if (!txsProp) {
        const arr = await getAllTransactions();
        arr.sort((a,b) => parseDateStringToMs(b.date) - parseDateStringToMs(a.date));
        setFetchedTxs(arr);
      }
      if (!emapProp) {
        const es = await getAllEntities();
        const m: Record<string,string> = {};
        for (const e of es) m[e.id] = e.name || e.bankName || '__unknown__';
        setFetchedEntities(m);
      }
    }
    load();
  }, [txsProp, emapProp]);

  const toggle = (id: string) => {
    setSelected(s => ({ ...s, [id]: !s[id] }));
  };

  const handleConfirm = () => {
    if (!onConfirm) return;
    const ids = Object.entries(selected).filter(([,v])=>v).map(([k])=>k);
    onConfirm(ids);
  };

  const displayTxs = txsProp ?? fetchedTxs ?? [];
  const displayEntities = emapProp ?? fetchedEntities ?? {};

  return (
    <div className="app-body">
      <div className={selectable ? 'max-h-[50vh] overflow-auto' : 'overflow-x-auto'}>
        <table className="w-full table-auto border-collapse">
          <thead>
            <tr className="text-left">
              <th className="p-2">Date</th>
              <th className="p-2">Amount</th>
              <th className="p-2">Entity</th>
              <th className="p-2">Description</th>
              {selectable ? <th className="p-2">Select</th> : <th className="p-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {displayTxs.map(t => (
              <tr key={t.id} className="border-t">
                <td className="p-2 align-top">{formatDateDisplay(t.date)}</td>
                <td className="p-2 align-top">{formatCents(t.amount)}</td>
                <td className="p-2 align-top">{t.entityId ? displayEntities[t.entityId] : '__unknown__'}</td>
                <td className="p-2 align-top"><div className="text-sm text-zinc-700">{t.description ?? ''}</div></td>
                <td className="p-2 align-top">
                  {selectable ? (
                    <input type="checkbox" checked={!!selected[t.id]} onChange={() => toggle(t.id)} />
                  ) : (
                    t.amount < 0 && createGroupHandler ? (
                      <button onClick={() => createGroupHandler(t.id)} className="px-2 py-1 bg-blue-600 text-white rounded text-sm">Create group</button>
                    ) : null
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectable && (
        <div className="mt-3 flex justify-end">
          <button onClick={handleConfirm} className="px-3 py-2 bg-green-600 text-white rounded">Confirm selection</button>
        </div>
      )}
    </div>
  );
}

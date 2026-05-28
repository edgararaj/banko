import { Transaction } from '../types';
import { openDB, readAllFromStore, normalizeTransaction } from './db-core';
import { parseDateStringToMs } from '../format';

export async function findTransactionByStrictKey(date: string, amount: number, description?: string | null): Promise<Transaction | undefined> {
  const db = await openDB();
  const tx = db.transaction('transactions', 'readonly');
  const store = tx.objectStore('transactions');
  const idx = store.index('byStrictKey');
  const key = [date, amount, description ?? null];
  return await new Promise((resolve, reject) => {
    const request = idx.get(key as unknown as IDBValidKey);
    request.onsuccess = () => resolve(request.result ? normalizeTransaction(request.result as Transaction & { linkedAccountId?: string | null; entityId?: string | null }) : undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function addTransactionIfNotExists(txn: Transaction): Promise<Transaction> {
  const normalizedTxn = normalizeTransaction(txn as Transaction & { linkedAccountId?: string | null; entityId?: string | null });
  const existing = await findTransactionByStrictKey(normalizedTxn.date, normalizedTxn.amount, normalizedTxn.description ?? null);
  if (existing) return existing;

  const db = await openDB();
  const tx = db.transaction('transactions', 'readwrite');
  const store = tx.objectStore('transactions');
  const req = store.add(normalizedTxn);
  req.onsuccess = () => console.debug('db: transaction added', normalizedTxn.id);
  req.onerror = () => console.error('db: transaction add failed', req.error);
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
  return normalizedTxn;
}

export async function getAllTransactions(): Promise<Transaction[]> {
  const db = await openDB();
  const tx = db.transaction('transactions', 'readonly');
  const store = tx.objectStore('transactions');
  const records = await readAllFromStore<Transaction & { linkedAccountId?: string | null; entityId?: string | null }>(store);
  return records.map((record) => normalizeTransaction(record as Transaction & { linkedAccountId?: string | null; entityId?: string | null }));
}

export async function getTransactionsByDateRange(startISO: string, endISO: string) {
  const transactions = await getAllTransactions();
  const startMs = parseDateStringToMs(startISO);
  const endMs = parseDateStringToMs(endISO);
  return transactions.filter((transaction) => {
    const transactionMs = parseDateStringToMs(transaction.date);
    if (isNaN(transactionMs)) return false;
    if (!isNaN(startMs) && transactionMs < startMs) return false;
    if (!isNaN(endMs) && transactionMs > endMs) return false;
    return true;
  });
}

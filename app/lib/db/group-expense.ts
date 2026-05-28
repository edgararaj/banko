import { GroupExpense, Transaction } from '../types';
import { openDB, readAllFromStore, normalizeTransaction } from './db-core';
import { addTransactionIfNotExists } from './transaction';
import { ensureEntityAndBankAccount } from './bank-account';

export async function createGroupExpense(ge: GroupExpense): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('group_expenses', 'readwrite');
  const store = tx.objectStore('group_expenses');
  const req = store.add(ge);
  req.onsuccess = () => console.debug('db: group expense added', ge.id);
  req.onerror = () => console.error('db: group expense add failed', req.error);
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllGroupExpenses(): Promise<GroupExpense[]> {
  const db = await openDB();
  const tx = db.transaction('group_expenses', 'readonly');
  const store = tx.objectStore('group_expenses');
  return await readAllFromStore<GroupExpense>(store);
}

export async function updateGroupExpense(ge: GroupExpense): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('group_expenses', 'readwrite');
  const store = tx.objectStore('group_expenses');
  const req = store.put(ge);
  req.onsuccess = () => console.debug('db: group expense updated', ge.id);
  req.onerror = () => console.error('db: group expense update failed', req.error);
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getGroupExpenseById(id: string): Promise<GroupExpense | undefined> {
  const db = await openDB();
  const tx = db.transaction('group_expenses', 'readonly');
  const store = tx.objectStore('group_expenses');
  return await new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result as GroupExpense | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteGroupExpense(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('group_expenses', 'readwrite');
  const store = tx.objectStore('group_expenses');
  const req = store.delete(id);
  req.onsuccess = () => console.debug('db: group expense deleted', id);
  req.onerror = () => console.error('db: group expense delete failed', req.error);
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
}

export async function createGroupFromTransactionIds(ids: string[], fallbackAnchorAmountCents?: number): Promise<void> {
  if (!ids || ids.length === 0) return;
  const db = await openDB();
  const readTx = db.transaction('transactions', 'readonly');
  const tStore = readTx.objectStore('transactions');

  const selected: Transaction[] = [];
  for (const id of ids) {
    const req = tStore.get(id);
    const obj = await new Promise<Transaction | undefined>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result ? normalizeTransaction(req.result as Transaction & { linkedAccountId?: string | null; entityId?: string | null }) : undefined);
      req.onerror = () => reject(req.error);
    });
    if (obj) selected.push(obj);
  }

  if (selected.length === 0) return;

  let anchor: Transaction | undefined;
  for (const transaction of selected) {
    if (transaction.amount < 0 && (!anchor || Math.abs(transaction.amount) > Math.abs(anchor.amount))) {
      anchor = transaction;
    }
  }

  if (!anchor) {
    if (typeof fallbackAnchorAmountCents !== 'number' || !Number.isFinite(fallbackAnchorAmountCents)) {
      throw new Error('NO_ANCHOR_FOUND');
    }

    const selectedDates = selected.map((transaction) => transaction.date).filter(Boolean);
    const anchorDate = selectedDates.length > 0
      ? selectedDates.reduce((earliest, current) => (earliest < current ? earliest : current))
      : new Date().toISOString().slice(0, 10);

    const fallbackOwner = await ensureEntityAndBankAccount('Edgar Araujo');

    const syntheticAnchor: Transaction = {
      id: crypto.randomUUID(),
      date: anchorDate,
      description: 'Edgar Araujo',
      amount: -Math.abs(Math.round(fallbackAnchorAmountCents)),
      bankAccountId: fallbackOwner.bankAccount.id,
    };

    anchor = await addTransactionIfNotExists(syntheticAnchor);
  }

  const tx = db.transaction('group_expenses', 'readwrite');
  const gStore = tx.objectStore('group_expenses');
  const participantIds = selected.map((transaction) => transaction.id).filter((id) => id !== anchor!.id);

  const dates = selected.map((transaction) => transaction.date).filter(Boolean);
  const start = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : anchor.date;
  const end = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : anchor.date;

  const ge: GroupExpense = {
    id: crypto.randomUUID(),
    anchorTransactionId: anchor.id,
    participantTransactionIds: participantIds,
    dateWindow: { start, end },
    totalAmount: Math.abs(anchor.amount),
    extraExpenses: 0,
    friendCount: participantIds.length,
    status: 'modified',
  };

  const req = gStore.add(ge);
  req.onsuccess = () => console.debug('db: created group from selection', ge.id);
  req.onerror = () => console.error('db: create group failed', req.error);

  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
}

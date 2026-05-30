import { GroupExpense, Transaction } from '../types';
import { openDB, readAllFromStore, normalizeTransaction } from './db-core';
import { addTransactionIfNotExists } from './transaction';
import { ensureEntityAndBankAccount } from './bank-account';

type TransactionConflictResult = {
  conflictingIds: string[];
  groupIds: string[];
};

function getGroupTransactionIds(group: GroupExpense): string[] {
  return [...(group.expenseTransactionIds || []), ...(group.refundTransactionIds || [])];
}

export async function checkTransactionConflicts(transactionIds: string[], excludeGroupId?: string): Promise<TransactionConflictResult> {
  const allGroups = await getAllGroupExpenses();
  const conflictingIds = new Set<string>();
  const groupIds = new Set<string>();

  for (const group of allGroups) {
    if (excludeGroupId && group.id === excludeGroupId) continue;

    const groupTransactionIds = new Set(getGroupTransactionIds(group));
    for (const txId of transactionIds) {
      if (groupTransactionIds.has(txId)) {
        conflictingIds.add(txId);
        groupIds.add(group.id);
      }
    }
  }

  return {
    conflictingIds: Array.from(conflictingIds),
    groupIds: Array.from(groupIds),
  };
}

async function assertNoTransactionConflicts(transactionIds: string[], excludeGroupId?: string): Promise<void> {
  const conflicts = await checkTransactionConflicts(transactionIds, excludeGroupId);
  if (conflicts.conflictingIds.length === 0) return;

  const message = excludeGroupId
    ? `Transaction(s) already belong to another group: ${conflicts.conflictingIds.join(', ')}`
    : `Transaction(s) already belong to another group: ${conflicts.conflictingIds.join(', ')}`;

  const error = new Error(message);
  error.name = 'TRANSACTION_GROUP_CONFLICT';
  throw error;
}

export async function createGroupExpense(ge: GroupExpense): Promise<void> {
  await assertNoTransactionConflicts(getGroupTransactionIds(ge));

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
  await assertNoTransactionConflicts(getGroupTransactionIds(ge), ge.id);

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

  // Separate transactions into expenses (negative) and refunds (positive)
  const expenseTransactions = selected.filter((t) => t.amount < 0);
  const refundTransactions = selected.filter((t) => t.amount >= 0);

  // If no expenses, try to create a synthetic anchor for fallback
  let finalExpenses = expenseTransactions;
  if (finalExpenses.length === 0) {
    if (typeof fallbackAnchorAmountCents !== 'number' || !Number.isFinite(fallbackAnchorAmountCents)) {
      throw new Error('NO_EXPENSES_FOUND');
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

    const anchor = await addTransactionIfNotExists(syntheticAnchor);
    finalExpenses = [anchor];
  }

  const expenseIds = finalExpenses.map((t) => t.id);
  const refundIds = refundTransactions.map((t) => t.id);

  const dates = selected.map((transaction) => transaction.date).filter(Boolean);
  const start = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : finalExpenses[0].date;
  const end = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : finalExpenses[0].date;

  // Calculate totalAmount as the sum of absolute values of expenses
  const ge: GroupExpense = {
    id: crypto.randomUUID(),
    expenseTransactionIds: expenseIds,
    refundTransactionIds: refundIds,
    dateWindow: { start, end },
    extraExpenses: 0,
    friendCount: refundIds.length,
    status: 'modified',
  };

  await assertNoTransactionConflicts(getGroupTransactionIds(ge));

  const tx = db.transaction('group_expenses', 'readwrite');
  const gStore = tx.objectStore('group_expenses');
  const req = gStore.add(ge);
  req.onsuccess = () => console.debug('db: created group from selection', ge.id);
  req.onerror = () => console.error('db: create group failed', req.error);

  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
}

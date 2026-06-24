import { Transaction, Entity, BankAccount, GroupExpense } from '../types';

const DB_NAME = 'banko-db';
const DB_VERSION = 5;

export function normalizeName(value: string | undefined | null) {
  if (!value) return '';
  return value.trim().toLowerCase();
}

export function normalizeEntity(entity: Partial<Entity> & { id: string; bankName?: string }): Entity {
  return {
    id: entity.id,
    name: normalizeName(entity.name ?? entity.bankName ?? '') || '__unknown__',
  };
}

export function normalizeBankAccount(account: Partial<BankAccount> & { id: string; entityId: string; bankName?: string; name?: string }): BankAccount {
  return {
    id: account.id,
    entityId: account.entityId,
    name: normalizeName(account.name ?? account.bankName ?? '') || '__unknown__',
  };
}

export function normalizeTransaction(tx: Transaction & { linkedAccountId?: string | null; entityId?: string | null }): Transaction {
  return {
    id: tx.id as string,
    date: tx.date as string,
    valueDate: tx.valueDate as string | undefined,
    description: (tx.description as string | null | undefined) ?? null,
    location: (tx.location as string | null | undefined) ?? null,
    amount: tx.amount as number,
    bankAccountId: resolveTransactionBankAccountId(tx as Transaction),
    groupExpenseId: (tx as unknown as { groupExpenseId?: string | null }).groupExpenseId ?? null,
  };
}

export function resolveTransactionBankAccountId(tx: Transaction): string | null {
  const legacy = tx as unknown as { linkedAccountId?: string | null; entityId?: string | null };
  return tx.bankAccountId ?? legacy.linkedAccountId ?? legacy.entityId ?? null;
}

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (ev) => {
      const request = ev.target as IDBOpenDBRequest;
      const db = request.result;
      const tx = request.transaction;
      const oldVersion = ev.oldVersion;
      if (!tx) return;

      const transactionsStore = db.objectStoreNames.contains('transactions')
        ? tx.objectStore('transactions')
        : db.createObjectStore('transactions', { keyPath: 'id' });
      if (!transactionsStore.indexNames.contains('byDate')) {
        transactionsStore.createIndex('byDate', 'date');
      }
      if (!transactionsStore.indexNames.contains('byBankAccount')) {
        transactionsStore.createIndex('byBankAccount', 'bankAccountId');
      }
      if (!transactionsStore.indexNames.contains('byStrictKey')) {
        transactionsStore.createIndex('byStrictKey', ['date', 'amount', 'description'], { unique: false });
      }
      if (!transactionsStore.indexNames.contains('byGroupExpense')) {
        transactionsStore.createIndex('byGroupExpense', 'groupExpenseId');
      }

      const entitiesStore = db.objectStoreNames.contains('entities')
        ? tx.objectStore('entities')
        : db.createObjectStore('entities', { keyPath: 'id' });
      if (!entitiesStore.indexNames.contains('byName')) {
        entitiesStore.createIndex('byName', 'name', { unique: true });
      }

      const accountsStore = db.objectStoreNames.contains('linked_accounts')
        ? tx.objectStore('linked_accounts')
        : db.createObjectStore('linked_accounts', { keyPath: 'id' });
      if (!accountsStore.indexNames.contains('byEntity')) {
        accountsStore.createIndex('byEntity', 'entityId');
      }
      if (!accountsStore.indexNames.contains('byName')) {
        accountsStore.createIndex('byName', 'name', { unique: true });
      }

      const groupStore = db.objectStoreNames.contains('group_expenses')
        ? tx.objectStore('group_expenses')
        : db.createObjectStore('group_expenses', { keyPath: 'id' });
      if (!groupStore.indexNames.contains('byStatus')) {
        groupStore.createIndex('byStatus', 'status');
      }
      if (groupStore.indexNames.contains('byAnchor')) {
        groupStore.deleteIndex('byAnchor');
      }

      const indexStore = db.objectStoreNames.contains('transaction_index')
        ? tx.objectStore('transaction_index')
        : db.createObjectStore('transaction_index', { keyPath: 'idx', autoIncrement: true });
      if (!indexStore.indexNames.contains('date')) {
        indexStore.createIndex('date', 'date');
      }
      if (!indexStore.indexNames.contains('amount')) {
        indexStore.createIndex('amount', 'amount');
      }
      if (!indexStore.indexNames.contains('description')) {
        indexStore.createIndex('description', 'description');
      }

      // Migration sequencing:
      // - v3→v4: restructure group_expenses (anchor → expenses/refunds)
      // - v4→v5: backfill groupExpenseId on transactions
      //
      // When upgrading from v3 directly to v5, we must chain v5 inside v4's
      // onsuccess callback to guarantee group records are written before we
      // read them back for the transaction backfill.
      if (oldVersion < 4 && oldVersion > 0) {
        migrateGroupExpensesV3toV4(tx, groupStore, () => {
          if (oldVersion < 5) {
            migrateTransactionGroupExpenseIdsV4toV5(tx);
          }
        });
      } else if (oldVersion === 4) {
        migrateTransactionGroupExpenseIdsV4toV5(tx);
      }
    };
  });
}

export async function readAllFromStore<T>(store: IDBObjectStore): Promise<T[]> {
  return await new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

/**
 * ISOLATED MIGRATION LOGIC (v3 → v4)
 * Migrates group_expenses from old format (anchor + participants)
 * to new format (expenses + refunds).
 *
 * Migration rules:
 * - anchorTransactionId becomes the first expense
 * - participantTransactionIds become refunds
 * - friendCount is calculated from refunds count
 *
 * Calls onDone() after all records have been written, so that dependent
 * migrations (e.g. v4→v5) can be safely chained.
 */
function migrateGroupExpensesV3toV4(tx: IDBTransaction, groupStore: IDBObjectStore, onDone?: () => void): void {
  const getAllRequest = groupStore.getAll();

  getAllRequest.onsuccess = () => {
    const oldRecords = getAllRequest.result as any[];
    let pending = 0;

    for (const oldRecord of oldRecords) {
      // Skip if already in new format
      if (oldRecord.expenseTransactionIds && !oldRecord.anchorTransactionId) {
        continue;
      }

      const migratedRecord = {
        id: oldRecord.id,
        expenseTransactionIds: oldRecord.anchorTransactionId ? [oldRecord.anchorTransactionId] : [],
        refundTransactionIds: oldRecord.participantTransactionIds || [],
        dateWindow: oldRecord.dateWindow,
        friendCount: (oldRecord.participantTransactionIds || []).length,
        status: oldRecord.status,
        anchorTransactionId: undefined,
        participantTransactionIds: undefined,
        extraExpenses: oldRecord.extraExpenses ?? 0,
      };

      // Clean up undefined fields
      Object.keys(migratedRecord).forEach(
        (key) => (migratedRecord as any)[key] === undefined && delete (migratedRecord as any)[key]
      );

      pending++;
      const putReq = groupStore.put(migratedRecord);
      putReq.onsuccess = () => {
        pending--;
        if (pending === 0) onDone?.();
      };
      putReq.onerror = () => {
        pending--;
        if (pending === 0) onDone?.();
      };
    }

    // If there were no records to migrate, call onDone immediately
    if (pending === 0) onDone?.();
  };

  getAllRequest.onerror = () => {
    // Still call onDone so dependent migrations aren't silently skipped
    onDone?.();
  };
}

/**
 * ISOLATED MIGRATION LOGIC (v4 → v5)
 * Backfills groupExpenseId on all transactions that belong to a group expense.
 *
 * Reads all group_expenses and for each transaction ID listed in
 * expenseTransactionIds / refundTransactionIds, writes groupExpenseId back
 * onto the transaction record.
 *
 * Safe to run multiple times (idempotent — skips if already set correctly).
 */
function migrateTransactionGroupExpenseIdsV4toV5(tx: IDBTransaction): void {
  const groupStore = tx.objectStore('group_expenses');
  const transactionStore = tx.objectStore('transactions');

  const getAllGroups = groupStore.getAll();

  getAllGroups.onsuccess = () => {
    const groups = getAllGroups.result as GroupExpense[];

    for (const group of groups) {
      const allTxIds = [
        ...(group.expenseTransactionIds || []),
        ...(group.refundTransactionIds || []),
      ];

      for (const txId of allTxIds) {
        const getReq = transactionStore.get(txId);
        getReq.onsuccess = () => {
          const transaction = getReq.result;
          if (transaction && transaction.groupExpenseId !== group.id) {
            transactionStore.put({ ...transaction, groupExpenseId: group.id });
          }
        };
      }
    }
  };
}
import { Transaction, Entity, BankAccount, GroupExpense, Investment } from '../types';

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

export function normalizeInvestment(investment: Investment): Investment {
  return {
    id: investment.id,
    name: (investment.name ?? '').trim(),
    ticker: (investment.ticker ?? '').trim().toUpperCase(),
    date: investment.date,
    initialValue: investment.initialValue ?? 0,
    todayValue: investment.todayValue ?? 0,
    additionalTaxes: investment.additionalTaxes ?? 0,
  };
}

export function normalizeTransaction(tx: Transaction & { linkedAccountId?: string | null; entityId?: string | null }): Transaction {
  const raw = tx as any;
  return {
    id: tx.id,
    date: tx.date,
    valueDate: tx.valueDate,
    description: tx.description ?? null,
    location: tx.location ?? null,
    amount: tx.amount,
    bankAccountId: tx.bankAccountId ?? raw.linkedAccountId ?? raw.entityId ?? null,
    groupExpenseId: raw.groupExpenseId ?? null,
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
    req.onblocked = () => console.warn('db: upgrade blocked by another open connection — close other tabs');
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        console.warn('db: database version changed in another tab, connection closed');
      };
      // Backfill groupExpenseId on every open — handles imported databases
      // that were exported before this field existed, where onupgradeneeded
      // never fires and records come in without groupExpenseId set.
      backfillGroupExpenseIds(db).then(() => resolve(db));
    };
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

      const investmentsStore = db.objectStoreNames.contains('investments')
        ? tx.objectStore('investments')
        : db.createObjectStore('investments', { keyPath: 'id' });
      if (!investmentsStore.indexNames.contains('byDate')) {
        investmentsStore.createIndex('byDate', 'date');
      }
      if (!investmentsStore.indexNames.contains('byTicker')) {
        investmentsStore.createIndex('byTicker', 'ticker', { unique: false });
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

      // v3 → v4: restructure group_expenses (anchor → expenses/refunds)
      if (oldVersion < 4 && oldVersion > 0) {
        migrateGroupExpensesV3toV4(tx, groupStore);
      }
    };
  });
}

/**
 * Backfills groupExpenseId on transactions on every DB open.
 * Reads all group_expenses, builds a txId → groupId map, then patches
 * any transaction that is missing or has a stale value. Fully idempotent.
 */
async function backfillGroupExpenseIds(db: IDBDatabase): Promise<void> {
  const groups = await new Promise<GroupExpense[]>((resolve, reject) => {
    const tx = db.transaction('group_expenses', 'readonly');
    const store = tx.objectStore('group_expenses');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as GroupExpense[]);
    req.onerror = () => reject(req.error);
  });

  if (groups.length === 0) return;

  const expectedGroupId = new Map<string, string>();
  for (const group of groups) {
    for (const txId of [...(group.expenseTransactionIds || []), ...(group.refundTransactionIds || [])]) {
      expectedGroupId.set(txId, group.id);
    }
  }

  if (expectedGroupId.size === 0) return;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('transactions', 'readwrite');
    const store = tx.objectStore('transactions');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);

    for (const [txId, groupId] of expectedGroupId) {
      const getReq = store.get(txId);
      getReq.onsuccess = () => {
        const transaction = getReq.result;
        if (transaction && transaction.groupExpenseId !== groupId) {
          store.put({ ...transaction, groupExpenseId: groupId });
        }
      };
    }
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
 */
function migrateGroupExpensesV3toV4(tx: IDBTransaction, groupStore: IDBObjectStore): void {
  const getAllRequest = groupStore.getAll();

  getAllRequest.onsuccess = () => {
    const oldRecords = getAllRequest.result as any[];

    for (const oldRecord of oldRecords) {
      if (oldRecord.expenseTransactionIds && !oldRecord.anchorTransactionId) continue;

      const migratedRecord = {
        id: oldRecord.id,
        expenseTransactionIds: oldRecord.anchorTransactionId ? [oldRecord.anchorTransactionId] : [],
        refundTransactionIds: oldRecord.participantTransactionIds || [],
        dateWindow: oldRecord.dateWindow,
        friendCount: (oldRecord.participantTransactionIds || []).length,
        status: oldRecord.status,
        extraExpenses: oldRecord.extraExpenses ?? 0,
      };

      groupStore.put(migratedRecord);
    }
  };
}
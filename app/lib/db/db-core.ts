import { Transaction, Entity, BankAccount } from '../types';

const DB_NAME = 'banko-db';
const DB_VERSION = 4;

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
      // v3 to v4 migration: remove byAnchor index and add migration logic below
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

      // Migration from v3 to v4: Convert old group_expenses format to new format
      // ISOLATED MIGRATION LOGIC - Can be removed after v4 is stable
      if (oldVersion < 4 && oldVersion > 0) {
        migrateGroupExpensesV3toV4(tx, groupStore);
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
 * This function can be removed once v4 is deployed and no v3 databases
 * are expected to be migrated anymore.
 * 
 * Migration rules:
 * - anchorTransactionId becomes the first expense
 * - participantTransactionIds become refunds
 * - totalAmount is preserved from the anchor
 * - friendCount is calculated from refunds count
 */
function migrateGroupExpensesV3toV4(tx: IDBTransaction, groupStore: IDBObjectStore): void {
  const getAllRequest = groupStore.getAll();
  
  getAllRequest.onsuccess = () => {
    const oldRecords = getAllRequest.result as any[];
    
    for (const oldRecord of oldRecords) {
      // Skip if already in new format
      if (oldRecord.expenseTransactionIds && !oldRecord.anchorTransactionId) {
        continue;
      }
      
      // Transform old format to new format
      const migratedRecord = {
        id: oldRecord.id,
        expenseTransactionIds: oldRecord.anchorTransactionId ? [oldRecord.anchorTransactionId] : [],
        refundTransactionIds: oldRecord.participantTransactionIds || [],
        dateWindow: oldRecord.dateWindow,
        friendCount: (oldRecord.participantTransactionIds || []).length,
        status: oldRecord.status,
        // Remove old fields
        anchorTransactionId: undefined,
        participantTransactionIds: undefined,
        extraExpenses: oldRecord.extraExpenses ?? 0,
      };
      
      // Clean up undefined fields
      // Cast to `any` for dynamic property access to satisfy TS index checks
      Object.keys(migratedRecord).forEach(
        (key) => (migratedRecord as any)[key] === undefined && delete (migratedRecord as any)[key]
      );
      
      groupStore.put(migratedRecord);
    }
  };
}

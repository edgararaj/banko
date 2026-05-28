import { Transaction, Entity, BankAccount } from '../types';

const DB_NAME = 'banko-db';
const DB_VERSION = 3;

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
      if (!groupStore.indexNames.contains('byAnchor')) {
        groupStore.createIndex('byAnchor', 'anchorTransactionId');
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

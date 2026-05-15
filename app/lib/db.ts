import { Transaction, Entity, GroupExpense } from './types';
import { parseDateStringToMs } from './format';

const DB_NAME = 'banko-db';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('transactions')) {
        const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
        txStore.createIndex('byDate', 'date');
        txStore.createIndex('byEntity', 'entityId');
        // compound index for strict dedupe: [date, amount, description]
        txStore.createIndex('byStrictKey', ['date', 'amount', 'description'], { unique: false });
      }
      if (!db.objectStoreNames.contains('entities')) {
        const enStore = db.createObjectStore('entities', { keyPath: 'id' });
        enStore.createIndex('byName', 'name', { unique: true });
        enStore.createIndex('byBankName', 'bankName');
      }
      if (!db.objectStoreNames.contains('group_expenses')) {
        const geStore = db.createObjectStore('group_expenses', { keyPath: 'id' });
        geStore.createIndex('byStatus', 'status');
        geStore.createIndex('byAnchor', 'anchorTransactionId');
      }
      if (!db.objectStoreNames.contains('transaction_index')) {
        const ix = db.createObjectStore('transaction_index', { keyPath: 'idx', autoIncrement: true });
        ix.createIndex('date', 'date');
        ix.createIndex('amount', 'amount');
        ix.createIndex('description', 'description');
      }
    };
  });
}

function normalizeName(s: string | undefined | null) {
  if (!s) return '';
  return s.trim().toLowerCase();
}

export function normalizeBankName(bankName: string | undefined | null) {
  // Deterministic normalization per spec: trim and lowercase only
  if (!bankName) return '';
  return bankName.trim().toLowerCase();
}

export async function getEntityByName(name: string): Promise<Entity | undefined> {
  const db = await openDB();
  const tx = db.transaction('entities', 'readonly');
  const store = tx.objectStore('entities');
  const idx = store.index('byName');
  return await new Promise((res, rej) => {
    const r = idx.get(name);
    r.onsuccess = () => res(r.result as Entity | undefined);
    r.onerror = () => rej(r.error);
  });
}

export async function addEntityIfNotExists(bankName: string): Promise<Entity> {
  const nameNormalized = normalizeBankName(bankName) || '';

  // Only attempt index lookup when there is a non-empty normalized name.
  if (nameNormalized) {
    const existing = await getEntityByName(nameNormalized);
    if (existing) return existing;
  }

  const db = await openDB();
  const tx = db.transaction('entities', 'readwrite');
  const store = tx.objectStore('entities');

  const id = crypto.randomUUID();
  const entity: Entity = { id, bankName: bankName ?? '', name: nameNormalized };
  // If nameNormalized is empty, set a deterministic placeholder to avoid unique index collisions
  if (!entity.name) entity.name = `__unknown__`;

  const req = store.add(entity);
  req.onsuccess = () => console.debug('db: entity added', entity.id);
  req.onerror = () => console.error('db: entity add failed', req.error);
  await new Promise((res, rej) => {
    tx.oncomplete = () => res(undefined);
    tx.onerror = () => rej(tx.error);
  });
  return entity;
}

export async function findTransactionByStrictKey(date: string, amount: number, description?: string | null): Promise<Transaction | undefined> {
  const db = await openDB();
  const tx = db.transaction('transactions', 'readonly');
  const store = tx.objectStore('transactions');
  const idx = store.index('byStrictKey');
  const key = [date, amount, description ?? null];
  return await new Promise((res, rej) => {
    // idx.get accepts a compound key array at runtime, but TypeScript's DOM types
    // don't include null as a valid key element. Cast to unknown to avoid build error.
    const r = idx.get(key as unknown as IDBValidKey);
    r.onsuccess = () => res(r.result as Transaction | undefined);
    r.onerror = () => rej(r.error);
  });
}

export async function addTransactionIfNotExists(txn: Transaction): Promise<Transaction> {
  const existing = await findTransactionByStrictKey(txn.date, txn.amount, txn.description ?? null);
  if (existing) return existing;
  const db = await openDB();
  const tx = db.transaction('transactions', 'readwrite');
  const store = tx.objectStore('transactions');
  const req = store.add(txn);
  req.onsuccess = () => console.debug('db: transaction added', txn.id);
  req.onerror = () => console.error('db: transaction add failed', req.error);
  await new Promise((res, rej) => {
    tx.oncomplete = () => res(undefined);
    tx.onerror = () => rej(tx.error);
  });
  return txn;
}

export async function createGroupExpense(ge: GroupExpense): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('group_expenses', 'readwrite');
  const store = tx.objectStore('group_expenses');
  const req = store.add(ge);
  req.onsuccess = () => console.debug('db: group expense added', ge.id);
  req.onerror = () => console.error('db: group expense add failed', req.error);
  await new Promise((res, rej) => {
    tx.oncomplete = () => res(undefined);
    tx.onerror = () => rej(tx.error);
  });
}

export async function getAllTransactions(): Promise<Transaction[]> {
  const db = await openDB();
  const tx = db.transaction('transactions', 'readonly');
  const store = tx.objectStore('transactions');
  return await new Promise((res, rej) => {
    const r = store.getAll();
    r.onsuccess = () => res(r.result as Transaction[]);
    r.onerror = () => rej(r.error);
  });
}

export async function getAllEntities(): Promise<Entity[]> {
  const db = await openDB();
  const tx = db.transaction('entities', 'readonly');
  const store = tx.objectStore('entities');
  return await new Promise((res, rej) => {
    const r = store.getAll();
    r.onsuccess = () => res(r.result as Entity[]);
    r.onerror = () => rej(r.error);
  });
}

export async function getAllGroupExpenses(): Promise<GroupExpense[]> {
  const db = await openDB();
  const tx = db.transaction('group_expenses', 'readonly');
  const store = tx.objectStore('group_expenses');
  return await new Promise((res, rej) => {
    const r = store.getAll();
    r.onsuccess = () => res(r.result as GroupExpense[]);
    r.onerror = () => rej(r.error);
  });
}

// Additional helpers for GroupExpense and queries

export async function updateGroupExpense(ge: any): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('group_expenses', 'readwrite');
  const store = tx.objectStore('group_expenses');
  const req = store.put(ge);
  req.onsuccess = () => console.debug('db: group expense updated', ge.id);
  req.onerror = () => console.error('db: group expense update failed', req.error);
  await new Promise((res, rej) => {
    tx.oncomplete = () => res(undefined);
    tx.onerror = () => rej(tx.error);
  });
}

export async function getGroupExpenseById(id: string): Promise<GroupExpense | undefined> {
  const db = await openDB();
  const tx = db.transaction('group_expenses', 'readonly');
  const store = tx.objectStore('group_expenses');
  return await new Promise((res, rej) => {
    const r = store.get(id);
    r.onsuccess = () => res(r.result as GroupExpense | undefined);
    r.onerror = () => rej(r.error);
  });
}

export async function deleteGroupExpense(id: string): Promise<void> {
  // mark as deleted per spec
  const g = await getGroupExpenseById(id);
  if (!g) return;
  g.status = 'deleted';
  await updateGroupExpense(g);
}

export async function getTransactionsByDateRange(startISO: string, endISO: string) {
  // With dates stored as dd-mm-yyyy, IDB ranged string queries are not chronological.
  // Fetch all and filter by parsed timestamps for correctness.
  const db = await openDB();
  const tx = db.transaction('transactions', 'readonly');
  const store = tx.objectStore('transactions');
  return await new Promise((res, rej) => {
    const r = store.getAll();
    r.onsuccess = () => {
      try {
        const startMs = parseDateStringToMs(startISO);
        const endMs = parseDateStringToMs(endISO);
        const filtered = (r.result as any[]).filter(t => {
          const tm = parseDateStringToMs(t.date);
          if (isNaN(tm)) return false;
          if (!isNaN(startMs) && tm < startMs) return false;
          if (!isNaN(endMs) && tm > endMs) return false;
          return true;
        });
        res(filtered);
      } catch (err) { rej(err); }
    };
    r.onerror = () => rej(r.error);
  });
}

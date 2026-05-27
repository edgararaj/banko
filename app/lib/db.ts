import { Transaction, Entity, BankAccount, GroupExpense } from './types';
import { parseDateStringToMs } from './format';

const DB_NAME = 'banko-db';
const DB_VERSION = 3;

function normalizeName(value: string | undefined | null) {
  if (!value) return '';
  return value.trim().toLowerCase();
}

function normalizeEntity(entity: Partial<Entity> & { id: string; bankName?: string }): Entity {
  return {
    id: entity.id,
    name: normalizeName(entity.name ?? entity.bankName ?? '') || '__unknown__',
  };
}

function normalizeBankAccount(account: Partial<BankAccount> & { id: string; entityId: string; bankName?: string; name?: string }): BankAccount {
  return {
    id: account.id,
    entityId: account.entityId,
    name: normalizeName(account.name ?? account.bankName ?? '') || '__unknown__',
  };
}

export async function updateBankAccount(account: BankAccount): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('linked_accounts', 'readwrite');
  const store = tx.objectStore('linked_accounts');
  const req = store.put(normalizeBankAccount(account));
  req.onsuccess = () => console.debug('db: bank account updated', account.id);
  req.onerror = () => console.error('db: bank account update failed', req.error);
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
}

function normalizeTransaction(tx: Transaction & { linkedAccountId?: string | null; entityId?: string | null }): Transaction {
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

async function readAllFromStore<T>(store: IDBObjectStore): Promise<T[]> {
  return await new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

export function normalizeBankName(bankName: string | undefined | null) {
  return normalizeName(bankName);
}

export async function getEntityByName(name: string): Promise<Entity | undefined> {
  const entities = await getAllEntities();
  const normalized = normalizeName(name);
  return entities.find((entity) => normalizeName(entity.name) === normalized);
}

export async function addEntityIfNotExists(name: string): Promise<Entity> {
  const normalized = normalizeName(name) || '__unknown__';
  const existing = await getEntityByName(normalized);
  if (existing) return existing;

  const db = await openDB();
  const tx = db.transaction('entities', 'readwrite');
  const store = tx.objectStore('entities');
  const entity: Entity = { id: crypto.randomUUID(), name: normalized };
  const req = store.add(entity);
  req.onsuccess = () => console.debug('db: entity added', entity.id);
  req.onerror = () => console.error('db: entity add failed', req.error);

  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });

  return entity;
}

export async function getBankAccountByName(bankName: string): Promise<BankAccount | undefined> {
  const accounts = await getAllBankAccounts();
  const normalized = normalizeBankName(bankName);
  return accounts.find((account) => normalizeBankName(account.name) === normalized);
}

export async function getBankAccountById(id: string): Promise<BankAccount | undefined> {
  const db = await openDB();
  const tx = db.transaction('linked_accounts', 'readonly');
  const store = tx.objectStore('linked_accounts');
  return await new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result ? normalizeBankAccount(request.result as BankAccount & { bankName?: string; name?: string }) : undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllBankAccounts(): Promise<BankAccount[]> {
  const db = await openDB();
  const tx = db.transaction('linked_accounts', 'readonly');
  const store = tx.objectStore('linked_accounts');
  const accounts = await readAllFromStore<BankAccount & { bankName?: string; name?: string }>(store);
  return accounts.map((account) => normalizeBankAccount(account));
}

export async function getBankAccountsByEntityId(entityId: string): Promise<BankAccount[]> {
  const accounts = await getAllBankAccounts();
  return accounts.filter((account) => account.entityId === entityId);
}

export async function addBankAccountIfNotExists(bankName: string, entityId: string): Promise<BankAccount> {
  const normalizedName = normalizeBankName(bankName) || '__unknown__';
  const existing = await getBankAccountByName(normalizedName);
  if (existing) return existing;

  const db = await openDB();
  const tx = db.transaction('linked_accounts', 'readwrite');
  const store = tx.objectStore('linked_accounts');
  const bankAccount: BankAccount = {
    id: crypto.randomUUID(),
    entityId,
    name: normalizedName,
  };
  const req = store.add(bankAccount);
  req.onsuccess = () => console.debug('db: bank account added', bankAccount.id);
  req.onerror = () => console.error('db: bank account add failed', req.error);

  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });

  return bankAccount;
}

export async function ensureEntityAndBankAccount(bankName: string): Promise<{ entity: Entity; bankAccount: BankAccount }> {
  const normalized = normalizeBankName(bankName) || '__unknown__';
  const existingBankAccount = await getBankAccountByName(normalized);
  if (existingBankAccount) {
    const entity = (await getEntityById(existingBankAccount.entityId)) ?? { id: existingBankAccount.entityId, name: normalized };
    return { entity, bankAccount: existingBankAccount };
  }

  const entity = await addEntityIfNotExists(normalized);
  const bankAccount = await addBankAccountIfNotExists(normalized, entity.id);
  return { entity, bankAccount };
}

export async function getEntityById(id: string): Promise<Entity | undefined> {
  const db = await openDB();
  const tx = db.transaction('entities', 'readonly');
  const store = tx.objectStore('entities');
  return await new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result ? normalizeEntity(request.result as Entity & { bankName?: string }) : undefined);
    request.onerror = () => reject(request.error);
  });
}

export function resolveTransactionBankAccountId(tx: Transaction): string | null {
  const legacy = tx as unknown as { linkedAccountId?: string | null; entityId?: string | null };
  return tx.bankAccountId ?? legacy.linkedAccountId ?? legacy.entityId ?? null;
}

export async function updateEntity(entity: Entity): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('entities', 'readwrite');
  const store = tx.objectStore('entities');
  const req = store.put(normalizeEntity(entity));
  req.onsuccess = () => console.debug('db: entity updated', entity.id);
  req.onerror = () => console.error('db: entity update failed', req.error);
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
}

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

export async function getAllTransactions(): Promise<Transaction[]> {
  const db = await openDB();
  const tx = db.transaction('transactions', 'readonly');
  const store = tx.objectStore('transactions');
  const records = await readAllFromStore<Transaction & { linkedAccountId?: string | null; entityId?: string | null }>(store);
  return records.map((record) => normalizeTransaction(record as Transaction & { linkedAccountId?: string | null; entityId?: string | null }));
}

export async function getAllEntities(): Promise<Entity[]> {
  const db = await openDB();
  const tx = db.transaction('entities', 'readonly');
  const store = tx.objectStore('entities');
  const records = await readAllFromStore<Entity & { bankName?: string }>(store);
  return records.map((record) => normalizeEntity(record));
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

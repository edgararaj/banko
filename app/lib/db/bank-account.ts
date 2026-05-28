import { BankAccount } from '../types';
import { openDB, readAllFromStore, normalizeName, normalizeBankAccount } from './db-core';
import { addEntityIfNotExists, getEntityById } from './entity';

export function normalizeBankName(bankName: string | undefined | null) {
  return normalizeName(bankName);
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

export async function ensureEntityAndBankAccount(bankName: string): Promise<{ entity: import('../types').Entity; bankAccount: BankAccount }> {
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

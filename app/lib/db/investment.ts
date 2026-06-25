import { Investment } from '../types';
import { normalizeInvestment, openDB, readAllFromStore } from './db-core';

export async function getAllInvestments(): Promise<Investment[]> {
  const db = await openDB();
  const tx = db.transaction('investments', 'readonly');
  const store = tx.objectStore('investments');
  const records = await readAllFromStore<Investment>(store);
  return records.map((record) => normalizeInvestment(record));
}

export async function getInvestmentById(id: string): Promise<Investment | undefined> {
  const db = await openDB();
  const tx = db.transaction('investments', 'readonly');
  const store = tx.objectStore('investments');
  return await new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result ? normalizeInvestment(request.result as Investment) : undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function addInvestmentIfNotExists(investment: Investment): Promise<Investment> {
  const db = await openDB();
  const tx = db.transaction('investments', 'readwrite');
  const store = tx.objectStore('investments');
  const normalized = normalizeInvestment(investment);
  const req = store.add(normalized);
  req.onsuccess = () => console.debug('db: investment added', normalized.id);
  req.onerror = () => console.error('db: investment add failed', req.error);
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
  return normalized;
}

export async function updateInvestment(investment: Investment): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('investments', 'readwrite');
  const store = tx.objectStore('investments');
  const req = store.put(normalizeInvestment(investment));
  req.onsuccess = () => console.debug('db: investment updated', investment.id);
  req.onerror = () => console.error('db: investment update failed', req.error);
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteInvestment(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('investments', 'readwrite');
  const store = tx.objectStore('investments');
  const req = store.delete(id);
  req.onsuccess = () => console.debug('db: investment deleted', id);
  req.onerror = () => console.error('db: investment delete failed', req.error);
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
}
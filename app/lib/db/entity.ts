import { Entity } from '../types';
import { openDB, readAllFromStore, normalizeName, normalizeEntity } from './db-core';

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

export async function getAllEntities(): Promise<Entity[]> {
  const db = await openDB();
  const tx = db.transaction('entities', 'readonly');
  const store = tx.objectStore('entities');
  const records = await readAllFromStore<Entity & { bankName?: string }>(store);
  return records.map((record) => normalizeEntity(record));
}

export async function deleteEntity(id: string): Promise<void> {
  const { getBankAccountsByEntityId } = await import('./bank-account');
  const linkedAccounts = await getBankAccountsByEntityId(id);
  if (linkedAccounts.length > 0) {
    throw new Error('ENTITY_HAS_LINKED_ACCOUNTS');
  }

  const db = await openDB();
  const tx = db.transaction('entities', 'readwrite');
  const store = tx.objectStore('entities');
  const req = store.delete(id);
  req.onsuccess = () => console.debug('db: entity deleted', id);
  req.onerror = () => console.error('db: entity delete failed', req.error);
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
}

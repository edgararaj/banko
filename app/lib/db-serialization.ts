import { Transaction, Entity, BankAccount, GroupExpense, Investment } from './types';
import {
  getAllTransactions,
  getAllEntities,
  getAllBankAccounts,
  getAllGroupExpenses,
  getAllInvestments,
  openDB,
} from './db';
import { normalizeEntity, normalizeBankAccount, normalizeTransaction, normalizeInvestment } from './db/db-core';

export interface DatabaseSnapshot {
  version: number;
  exportDate: string;
  transactions: Transaction[];
  entities: Entity[];
  bankAccounts: BankAccount[];
  groupExpenses: GroupExpense[];
  investments: Investment[];
}

export async function serializeDatabase(): Promise<DatabaseSnapshot> {
  const [transactions, entities, bankAccounts, groupExpenses, investments] = await Promise.all([
    getAllTransactions(),
    getAllEntities(),
    getAllBankAccounts(),
    getAllGroupExpenses(),
    getAllInvestments(),
  ]);

  return {
    version: 2,
    exportDate: new Date().toISOString(),
    transactions,
    entities,
    bankAccounts,
    groupExpenses,
    investments,
  };
}

export async function exportDatabaseAsJson(): Promise<string> {
  const snapshot = await serializeDatabase();
  return JSON.stringify(snapshot, null, 2);
}

export async function importDatabaseFromJson(jsonString: string): Promise<string[]> {
  let snapshot: Partial<DatabaseSnapshot>;

  try {
    snapshot = JSON.parse(jsonString);
  } catch {
    throw new Error('Invalid JSON format');
  }

  if (
    typeof snapshot !== 'object' ||
    snapshot === null ||
    !Array.isArray(snapshot.entities) ||
    !Array.isArray(snapshot.bankAccounts) ||
    !Array.isArray(snapshot.transactions) ||
    !Array.isArray(snapshot.groupExpenses)
  ) {
    throw new Error('Invalid database snapshot format');
  }

  const investments = Array.isArray((snapshot as any).investments) ? (snapshot as any).investments as Investment[] : [];

  // ISOLATED MIGRATION LOGIC (v1 → v2)
  // Migrate group expenses from old format (anchor + participants) to new format (expenses + refunds)
  // Can be removed once v1 databases are no longer expected
  const migratedGroupExpenses = snapshot.groupExpenses.map((ge: any) => {
    // Check if this is an old format record
    if (ge.anchorTransactionId && !ge.expenseTransactionIds) {
      return migrateGroupExpenseV1toV2(ge);
    }
    return ge;
  });

  const db = await openDB();
  const tx = db.transaction(
    ['entities', 'linked_accounts', 'transactions', 'group_expenses', 'investments', 'transaction_index'],
    'readwrite'
  );

  const entitiesStore = tx.objectStore('entities');
  const accountsStore = tx.objectStore('linked_accounts');
  const transactionsStore = tx.objectStore('transactions');
  const groupsStore = tx.objectStore('group_expenses');
  const investmentsStore = tx.objectStore('investments');
  const indexStore = tx.objectStore('transaction_index');

  await new Promise<void>((resolve, reject) => {
    const req = entitiesStore.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  await new Promise<void>((resolve, reject) => {
    const req = accountsStore.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  await new Promise<void>((resolve, reject) => {
    const req = transactionsStore.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  await new Promise<void>((resolve, reject) => {
    const req = groupsStore.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  await new Promise<void>((resolve, reject) => {
    const req = investmentsStore.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  await new Promise<void>((resolve, reject) => {
    const req = indexStore.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  for (const entity of snapshot.entities) {
    entitiesStore.put(normalizeEntity(entity as Entity));
  }

  for (const bankAccount of snapshot.bankAccounts) {
    accountsStore.put(normalizeBankAccount(bankAccount as BankAccount));
  }

  for (const transaction of snapshot.transactions) {
    transactionsStore.put(normalizeTransaction(transaction as Transaction));
  }

  for (const investment of investments) {
    investmentsStore.put(normalizeInvestment(investment as Investment));
  }

  // When importing groups, avoid allowing the same transaction id to be referenced
  // by more than one group. Track seen transaction ids across imported groups
  // for this import run and remove any duplicated references, recording warnings
  // for each conflict. Use a local Set so multiple imports don't share state.
  const warnings: string[] = [];
  const seenSet: Set<string> = new Set<string>();

  for (const groupExpense of migratedGroupExpenses) {
    const processed: any = { ...groupExpense };
    processed.expenseTransactionIds = (processed.expenseTransactionIds || []).filter(Boolean);
    processed.refundTransactionIds = (processed.refundTransactionIds || []).filter(Boolean);

    const removedIds: string[] = [];

    processed.expenseTransactionIds = processed.expenseTransactionIds.filter((id: string) => {
      if (seenSet.has(id)) {
        removedIds.push(id);
        return false;
      }
      return true;
    });

    processed.refundTransactionIds = processed.refundTransactionIds.filter((id: string) => {
      if (seenSet.has(id)) {
        removedIds.push(id);
        return false;
      }
      return true;
    });

    // Mark remaining ids as seen so subsequent groups won't reuse them
    for (const id of [...processed.expenseTransactionIds, ...processed.refundTransactionIds]) {
      seenSet.add(id);
    }

    if (removedIds.length > 0) {
      const msg = `Import skipped ${removedIds.length} duplicated transaction id(s) for group ${processed.id}: ${removedIds.join(', ')}`;
      console.error(msg);
      warnings.push(msg);
    }

    groupsStore.put(processed as GroupExpense);
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Import aborted'));
  });

  return warnings;
}

export function downloadJson(jsonString: string, filename: string = 'banko-database.json'): void {
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('Failed to read file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/**
 * ISOLATED MIGRATION LOGIC (database serialization v1 → v2)
 * Converts GroupExpense from old format (single anchor + participants)
 * to new format (expenses list + refunds list).
 * 
 * This function is called during JSON import to support databases
 * exported in the old format. Once all old databases are migrated,
 * this function can be removed.
 * 
 * Migration rules:
 * - anchorTransactionId becomes the first expense in expenseTransactionIds
 * - participantTransactionIds become refundTransactionIds
 * - totalAmount is preserved
 * - friendCount is set to the number of refund transaction IDs
 */
function migrateGroupExpenseV1toV2(oldRecord: any): GroupExpense {
  return {
    id: oldRecord.id,
    name: oldRecord.name,
    expenseTransactionIds: oldRecord.anchorTransactionId ? [oldRecord.anchorTransactionId] : [],
    refundTransactionIds: oldRecord.participantTransactionIds || [],
    dateWindow: oldRecord.dateWindow,
    friendCount: (oldRecord.participantTransactionIds || []).length,
    extraExpenses: oldRecord.extraExpenses ?? 0,
    status: oldRecord.status,
  };
}

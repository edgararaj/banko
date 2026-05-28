import { Transaction, Entity, BankAccount, GroupExpense } from './types';
import {
  getAllTransactions,
  getAllEntities,
  getAllBankAccounts,
  getAllGroupExpenses,
  addTransactionIfNotExists,
  addEntityIfNotExists,
  addBankAccountIfNotExists,
  createGroupExpense,
} from './db';

export interface DatabaseSnapshot {
  version: number;
  exportDate: string;
  transactions: Transaction[];
  entities: Entity[];
  bankAccounts: BankAccount[];
  groupExpenses: GroupExpense[];
}

export async function serializeDatabase(): Promise<DatabaseSnapshot> {
  const [transactions, entities, bankAccounts, groupExpenses] = await Promise.all([
    getAllTransactions(),
    getAllEntities(),
    getAllBankAccounts(),
    getAllGroupExpenses(),
  ]);

  return {
    version: 1,
    exportDate: new Date().toISOString(),
    transactions,
    entities,
    bankAccounts,
    groupExpenses,
  };
}

export async function exportDatabaseAsJson(): Promise<string> {
  const snapshot = await serializeDatabase();
  return JSON.stringify(snapshot, null, 2);
}

export async function importDatabaseFromJson(jsonString: string): Promise<void> {
  let snapshot: DatabaseSnapshot;

  try {
    snapshot = JSON.parse(jsonString);
  } catch (error) {
    throw new Error('Invalid JSON format');
  }

  if (!snapshot.version || !Array.isArray(snapshot.transactions)) {
    throw new Error('Invalid database snapshot format');
  }

  // Import entities first (they need to exist before bank accounts)
  for (const entity of snapshot.entities || []) {
    // This will skip if it already exists
    await addEntityIfNotExists(entity.name);
  }

  // Import bank accounts (they reference entities)
  for (const bankAccount of snapshot.bankAccounts || []) {
    await addBankAccountIfNotExists(bankAccount.name, bankAccount.entityId);
  }

  // Import transactions
  for (const transaction of snapshot.transactions || []) {
    await addTransactionIfNotExists(transaction);
  }

  // Import group expenses
  for (const groupExpense of snapshot.groupExpenses || []) {
    try {
      await createGroupExpense(groupExpense);
    } catch (error) {
      // Skip if group expense already exists
      console.debug('Group expense already exists or failed to import:', groupExpense.id);
    }
  }
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

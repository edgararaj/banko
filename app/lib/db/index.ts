// Barrel export for backward compatibility
// This file re-exports all database operations from their respective modules

export { openDB } from './db-core';
export { resolveTransactionBankAccountId } from './db-core';
export { normalizeInvestment } from './db-core';

export {
  getEntityByName,
  addEntityIfNotExists,
  getEntityById,
  updateEntity,
  getAllEntities,
  deleteEntity,
} from './entity';

export {
  normalizeBankName,
  getBankAccountByName,
  getBankAccountById,
  getAllBankAccounts,
  getBankAccountsByEntityId,
  addBankAccountIfNotExists,
  updateBankAccount,
  ensureEntityAndBankAccount,
} from './bank-account';

export {
  findTransactionByStrictKey,
  addTransactionIfNotExists,
  getAllTransactions,
  getTransactionsByDateRange,
} from './transaction';

export {
  getAllInvestments,
  getInvestmentById,
  addInvestmentIfNotExists,
  updateInvestment,
  deleteInvestment,
} from './investment';

export {
  createGroupExpense,
  getAllGroupExpenses,
  updateGroupExpense,
  getGroupExpenseById,
  deleteGroupExpense,
  createGroupFromTransactionIds,
  checkTransactionConflicts,
} from './group-expense';

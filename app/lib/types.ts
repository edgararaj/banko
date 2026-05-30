export type Cents = number; // integer cents, EUR only

export interface Transaction {
  id: string; // uuid
  date: string; // ISO date string (Data mov.)
  valueDate?: string; // ISO date string (Data-valor)
  description?: string | null;
  location?: string | null;
  amount: Cents; // signed integer (cents)
  bankAccountId?: string | null; // FK → BankAccount
}

export interface Entity {
  id: string; // uuid
  name: string; // normalized display name (trim + lowercased for deterministic match)
}

export interface BankAccount {
  id: string; // uuid
  entityId: string; // FK → Entity
  name: string; // raw extracted identifier for the account
}

export interface DateWindow {
  start: string; // ISO date string
  end: string;   // ISO date string
}

export type GroupExpenseStatus = 'inferred' | 'modified' | 'completed';

export interface GroupExpense {
  id: string; // uuid
  name?: string; // optional label for the group
  expenseTransactionIds: string[]; // transaction ids for expenses (negative amounts)
  refundTransactionIds: string[]; // transaction ids for refunds/reimbursements (positive amounts)
  dateWindow: DateWindow; // ±1 day window
  extraExpenses?: Cents; // additional ad-hoc expenses stored separately (cents)
  friendCount: number; // other participants
  status: GroupExpenseStatus;
}

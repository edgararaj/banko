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
  anchorTransactionId: string;
  participantTransactionIds: string[]; // reimbursement transaction ids
  dateWindow: DateWindow; // ±1 day window
  totalAmount: Cents; // absolute value of anchor (cents)
  extraExpenses?: Cents; // additional expenses to add to anchor (cents)
  friendCount: number; // other participants
  status: GroupExpenseStatus;
}

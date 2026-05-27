export type Cents = number; // integer cents, EUR only

export interface Transaction {
  id: string; // uuid
  date: string; // ISO date string (Data mov.)
  valueDate?: string; // ISO date string (Data-valor)
  description?: string | null;
  location?: string | null;
  amount: Cents; // signed integer (cents)
  entityId?: string | null; // FK → Entity
}

export interface Entity {
  id: string; // uuid
  bankName: string; // raw extracted identifier
  name: string; // normalized display name (trim + lowercased for deterministic match)
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

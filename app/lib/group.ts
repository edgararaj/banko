import { Transaction, GroupExpense } from './types';
import { parseDateStringToMs } from './format';

export function sumReimbursements(txs: Transaction[], refundTransactionIds?: string[]): number {
  if (!refundTransactionIds || refundTransactionIds.length === 0) return 0;
  return refundTransactionIds.reduce((s, txnId) => {
    const t = txs.find(x => x.id === txnId);
    return s + (t ? t.amount : 0);
  }, 0);
}

export function computeGroupTotals(g: GroupExpense, txs: Transaction[]) {
  const expensesTotal = (g.expenseTransactionIds || []).reduce((s, id) => {
    const t = txs.find(x => x.id === id);
    return s + (t ? Math.abs(t.amount) : 0);
  }, 0) + (g.extraExpenses ?? 0);

  const refundsTotal = (g.refundTransactionIds || []).reduce((s, id) => {
    const t = txs.find(x => x.id === id);
    return s + (t ? t.amount : 0);
  }, 0);

  return { expensesTotal, refundsTotal, total: expensesTotal };
}

export function participantCountForGroup(g: GroupExpense, _refundTransactionIds?: string[]): number {
  // In the new model, use the explicit friendCount field which represents total participants
  if (typeof g.friendCount === 'number') return g.friendCount + 1;
  // Fallback: calculate from refund transaction IDs if needed
  if (_refundTransactionIds && _refundTransactionIds.length > 0) return _refundTransactionIds.length + 1;
  // Default to 1 (payer only)
  return 1;
}

export function payerShare(totalAmount: number, participantCount: number): number {
  if (participantCount <= 0) return 0;
  return Math.round(totalAmount / participantCount);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const arr = [...values].sort((a,b)=>a-b);
  const mid = Math.floor(arr.length / 2);
  if (arr.length % 2 === 1) return arr[mid];
  return Math.round((arr[mid-1] + arr[mid]) / 2);
}

export function balanceExcludingPayer(totalAmount: number, txs: Transaction[], refundTransactionIds?: string[], friendCount?: number, extraExpenses?: number): number {
  const sum = sumReimbursements(txs, refundTransactionIds);
  const pc = (typeof friendCount === 'number') ? (friendCount + 1) : ((refundTransactionIds && refundTransactionIds.length > 0) ? (refundTransactionIds.length + 1) : 1);
  const totalWithExtras = totalAmount + (extraExpenses ?? 0);

  // If we have reimbursements, use median reimbursement as payer's share (per user request)
  let payer = 0;
  if (refundTransactionIds && refundTransactionIds.length > 0) {
    const reimbAmounts = refundTransactionIds.map(txnId => {
      const t = txs.find(x => x.id === txnId);
      return t ? t.amount : 0;
    }).filter(v=>v>0);
    const med = median(reimbAmounts);
    payer = med > 0 ? med : payerShare(totalWithExtras, pc);
  } else {
    payer = payerShare(totalWithExtras, pc);
  }

  return sum + payer - totalWithExtras;
}

export function remainingIncludingPayer(totalAmount: number, txs: Transaction[], refundTransactionIds?: string[], extraExpenses?: number): number {
  const sum = sumReimbursements(txs, refundTransactionIds);
  const totalWithExtras = totalAmount + (extraExpenses ?? 0);
  return Math.max(0, totalWithExtras - sum);
}

export function candidateTransfersNearExpense(txs: Transaction[], expenseTransactions: Transaction[], daysWindow = 7, maxPerShareFactor = 0.5): Transaction[] {
  if (!expenseTransactions || expenseTransactions.length === 0) return [];
  
  const candidates: Transaction[] = [];
  const expenseIds = new Set(expenseTransactions.map(t => t.id));
  const DAY_MS = daysWindow * 24 * 60 * 60 * 1000;
  
  for (const expense of expenseTransactions) {
    const nearbyRefunds = txs.filter(t =>
      !expenseIds.has(t.id) &&
      t.amount > 0 &&
      Math.abs(parseDateStringToMs(t.date) - parseDateStringToMs(expense.date)) <= DAY_MS &&
      t.amount <= Math.abs(expense.amount) * maxPerShareFactor
    );
    candidates.push(...nearbyRefunds);
  }
  
  // Remove duplicates
  const uniqueIds = new Set<string>();
  return candidates.filter(t => {
    if (uniqueIds.has(t.id)) return false;
    uniqueIds.add(t.id);
    return true;
  });
}

export function candidateExpensesNearTransfer(txs: Transaction[], transferTransactions: Transaction[], daysWindow = 7, maxPerShareFactor = 0.5): Transaction[] {
  if (!transferTransactions || transferTransactions.length === 0) return [];
  
  const candidates: Transaction[] = [];
  const transferIds = new Set(transferTransactions.map(t => t.id));
  const DAY_MS = daysWindow * 24 * 60 * 60 * 1000;
  
  for (const transfer of transferTransactions) {
    const nearbyExpenses = txs.filter(t =>
      !transferIds.has(t.id) &&
      t.amount < 0 &&
      Math.abs(parseDateStringToMs(t.date) - parseDateStringToMs(transfer.date)) <= DAY_MS &&
      Math.abs(t.amount) >= transfer.amount * maxPerShareFactor
    );
    candidates.push(...nearbyExpenses);
  }
  
  // Remove duplicates
  const uniqueIds = new Set<string>();
  return candidates.filter(t => {
    if (uniqueIds.has(t.id)) return false;
    uniqueIds.add(t.id);
    return true;
  });
}

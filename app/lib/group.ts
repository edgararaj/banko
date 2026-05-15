import { Transaction, GroupExpense } from './types';
import { parseDateStringToMs } from './format';

export function sumReimbursements(txs: Transaction[], participantTransactionIds?: string[]): number {
  if (!participantTransactionIds || participantTransactionIds.length === 0) return 0;
  return participantTransactionIds.reduce((s, pid) => {
    const t = txs.find(x => x.id === pid);
    return s + (t ? t.amount : 0);
  }, 0);
}

export function participantCountForGroup(g: GroupExpense, participantTransactionIds?: string[]): number {
  // Prefer explicit friendCount if available (represents total friends in the group).
  if (typeof g.friendCount === 'number') return g.friendCount + 1;
  // Fallback to participantTransactionIds (number of reimbursements) if friendCount missing.
  if (participantTransactionIds && participantTransactionIds.length > 0) return participantTransactionIds.length + 1;
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

export function remainingExcludingPayer(totalAmount: number, txs: Transaction[], participantTransactionIds?: string[], friendCount?: number, extraExpenses?: number): number {
  const sum = sumReimbursements(txs, participantTransactionIds);
  const pc = (typeof friendCount === 'number') ? (friendCount + 1) : ((participantTransactionIds && participantTransactionIds.length > 0) ? (participantTransactionIds.length + 1) : 1);
  const totalWithExtras = totalAmount + (extraExpenses ?? 0);

  // If we have reimbursements, use median reimbursement as payer's share (per user request)
  let payer = 0;
  if (participantTransactionIds && participantTransactionIds.length > 0) {
    const reimbAmounts = participantTransactionIds.map(pid => {
      const t = txs.find(x => x.id === pid);
      return t ? t.amount : 0;
    }).filter(v=>v>0);
    const med = median(reimbAmounts);
    payer = med > 0 ? med : payerShare(totalWithExtras, pc);
  } else {
    payer = payerShare(totalWithExtras, pc);
  }

  return Math.max(0, totalWithExtras - sum - payer);
}

export function remainingIncludingPayer(totalAmount: number, txs: Transaction[], participantTransactionIds?: string[], extraExpenses?: number): number {
  const sum = sumReimbursements(txs, participantTransactionIds);
  const totalWithExtras = totalAmount + (extraExpenses ?? 0);
  return Math.max(0, totalWithExtras - sum);
}

export function candidateTransfersNearAnchor(txs: Transaction[], anchorTx: Transaction | undefined, daysWindow = 10, maxPerShareFactor = 0.5): Transaction[] {
  if (!anchorTx) return [];
  const DAY_MS = daysWindow * 24 * 60 * 60 * 1000;
  return txs.filter(t =>
    t.id !== anchorTx.id &&
    t.amount > 0 &&
    Math.abs(parseDateStringToMs(t.date) - parseDateStringToMs(anchorTx.date)) <= DAY_MS &&
    t.amount <= Math.abs(anchorTx.amount) * maxPerShareFactor
  );
}

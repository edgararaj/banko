import { getAllGroupExpenses, getAllTransactions, getAllEntities } from './db';
import type { GroupExpense } from './types';

export interface EntityNetDebt {
  entityId: string;
  name: string;
  netDebt: number; // cents. >0 they owe you, <0 you owe them
}

export interface GroupFriendBalance {
  entityId: string;
  paymentsMade: number; // cents
  friendBalance: number; // paymentsMade - expectedShare
}

export interface GroupDebtDetail {
  groupId: string;
  total: number;
  participants: number;
  expectedShare: number;
  friendBalances: GroupFriendBalance[];
}

export async function computeDebts(): Promise<{ entityDebts: EntityNetDebt[]; groupDetails: GroupDebtDetail[] }> {
  const groups = await getAllGroupExpenses();
  const txs = await getAllTransactions();
  const entities = await getAllEntities();
  const txById = new Map<string, typeof txs[0]>();
  for (const t of txs) txById.set(t.id, t);
  const entityById = new Map<string, string>();
  for (const e of entities) entityById.set(e.id, e.name);

  const groupDetails: GroupDebtDetail[] = [];
  const netDebtMap = new Map<string, number>();

  const rounding = (v: number) => Math.round(v); // cents already

  for (const g of groups) {
    const total = g.totalAmount;
    const participants = g.friendCount + 1;
    const expectedShare = rounding(total / participants);

    // Sum payments made per friend (entity) using participantTransactionIds
    const paymentsPerEntity = new Map<string, number>();
    for (const pid of g.participantTransactionIds) {
      const t = txById.get(pid);
      if (!t) continue;
      if (!t.entityId) continue;
      const prev = paymentsPerEntity.get(t.entityId) ?? 0;
      paymentsPerEntity.set(t.entityId, prev + t.amount);
    }

    const friendBalances: GroupFriendBalance[] = [];
    for (const [entityId, paymentsMade] of paymentsPerEntity.entries()) {
      const friendBalance = paymentsMade - expectedShare;
      friendBalances.push({ entityId, paymentsMade, friendBalance });
      const prev = netDebtMap.get(entityId) ?? 0;
      netDebtMap.set(entityId, prev + friendBalance);
    }

    groupDetails.push({
      groupId: g.id,
      total,
      participants,
      expectedShare,
      friendBalances,
    });
  }

  const entityDebts: EntityNetDebt[] = [];
  for (const [entityId, netDebt] of netDebtMap.entries()) {
    const name = entityById.get(entityId) ?? '__unknown__';
    entityDebts.push({ entityId, name, netDebt });
  }

  // sort by descending netDebt (people who owe you first)
  entityDebts.sort((a, b) => b.netDebt - a.netDebt);

  return { entityDebts, groupDetails };
}

import { getAllTransactions, getAllGroupExpenses, createGroupExpense } from './db';
import type { Transaction } from './types';
import { parseDateStringToMs } from './format';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * DAY_MS;            // Max time distance for clusters and proximity
const CENTS_5 = 5;                           // 5 cents rounding tolerance

// ─── Helpers ──────────────────────────────────────────────────────────────────

function time(t: Transaction): number {
  return parseDateStringToMs(t.valueDate);
}

function dateYMD(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getUTCFullYear());
  return `${dd}-${mm}-${yyyy}`;
}

/** Validates the strict description prefixes requested by the specification */
function hasValidPrefix(description?: string | null): boolean {
  if (!description) return false;
  const d = (description as string).trim().toLowerCase();
  return d.startsWith('tfi') || d.startsWith('trf mbway');
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * inferGroupExpenses
 *
 * Detects group expenses by building valid time-bound and value-bound clusters first,
 * then linking them directly to the lowest satisfying anchor spending transaction.
 */
export async function inferGroupExpenses(): Promise<number> {
  const txs      = await getAllTransactions();
  const existing = await getAllGroupExpenses();

  // Build exclusion sets so already-matched transactions are never reused
  const usedTransactionIds = new Set<string>();
  const usedAnchorIds      = new Set<string>(
    existing.map(g => g.anchorTransactionId)
  );

  for (const g of existing) {
    for (const id of g.participantTransactionIds) usedTransactionIds.add(id);
  }

  // Gather all unconsumed spendings (anchors)
  const availableAnchors = txs.filter(t => t.amount < 0 && !usedAnchorIds.has(t.id));

  // Gather all unconsumed incoming transfers matching the keyword filter
  const availableInflows = txs.filter(t => 
    t.amount > 0 && 
    !usedTransactionIds.has(t.id) && 
    hasValidPrefix(t.description)
  );

  // Sort chronologically to safely compute rolling 7-day windows
  availableInflows.sort((a, b) => time(a) - time(b));

  let created = 0;

  // 1. Build all globally potential clusters adhering to both Time and Value boundaries
  const validClusters: Transaction[][] = [];

  for (let i = 0; i < availableInflows.length; i++) {
    const baseTx = availableInflows[i];
    const baseAmountCents = Math.round(baseTx.amount * 100);
    const baseTime = time(baseTx);

    // Form a candidate group around this base transaction
    const potentialCluster: Transaction[] = [baseTx];

    for (let j = i + 1; j < availableInflows.length; j++) {
      const compareTx = availableInflows[j];
      
      // Since it's sorted, if this one is out of the 7-day window from the baseTx, all subsequent ones will be too
      if (time(compareTx) - baseTime > SEVEN_DAYS_MS) break;

      // Value Tolerance Check: Must be within 5 cents of the base item
      const compareAmountCents = Math.round(compareTx.amount * 100);
      if (Math.abs(compareAmountCents - baseAmountCents) <= CENTS_5) {
        potentialCluster.push(compareTx);
      }
    }

    // Size Constraint: Must contain >= 2 incoming payments
    if (potentialCluster.length >= 2) {
      // Ensure absolute time variance constraint within the entire group holds up (earliest to latest <= 7 days)
      const times = potentialCluster.map(t => time(t));
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);

      if (maxTime - minTime <= SEVEN_DAYS_MS) {
        validClusters.push(potentialCluster);
      }
    }
  }

  // Sort clusters descending by size (greedy prioritization)
  validClusters.sort((a, b) => b.length - a.length);

  // 2. Iterate through valid clusters and map them to their ideal anchor spending
  for (const cluster of validClusters) {
    // Skip if any element in this cluster was consumed during a previous iteration loop
    if (cluster.some(c => usedTransactionIds.has(c.id))) continue;

    // Convert values to integer cents to safeguard floating point math
    const clusterTotalCents = Math.round(cluster.reduce((sum, tx) => sum + tx.amount, 0) * 100);
    const averageParcelCents = Math.round(clusterTotalCents / cluster.length);
    
    // Strict Boundary Condition: Cluster Total + Parcel < A + 0.05
    // Rewritten to isolate anchor target value in integer cents:
    const minAnchorThresholdCents = clusterTotalCents + averageParcelCents - CENTS_5;

    // Find all qualifying anchors inside the chronological window of this cluster
    const eligibleAnchors = availableAnchors.filter(anchor => {
      if (usedAnchorIds.has(anchor.id)) return false;

      const anchorTime = time(anchor);
      const anchorCents = Math.round(Math.abs(anchor.amount) * 100);

      // Bound checking: Anchor must satisfy the new formula requirement
      if (anchorCents <= minAnchorThresholdCents) {
        return false;
      }

      // Time Proximity: Must be within 7 days of at least one payment in the cluster
      return cluster.some(c => Math.abs(time(c) - anchorTime) <= SEVEN_DAYS_MS);
    });

    if (eligibleAnchors.length === 0) continue;

    // The Lowest Match Rule: Choose the lowest absolute spending value anchor
    eligibleAnchors.sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));
    
    const bestAnchor = eligibleAnchors[0];
    const A = Math.abs(bestAnchor.amount);
    const anchorTime = time(bestAnchor);

    const participantTransactionIds = cluster.map(t => t.id);
    const friendsCount = cluster.length;

    const groupExpense = {
      id: crypto.randomUUID(),
      anchorTransactionId: bestAnchor.id,
      participantTransactionIds,
      dateWindow: {
        start: dateYMD(new Date(anchorTime - SEVEN_DAYS_MS)),
        end:   dateYMD(new Date(anchorTime + SEVEN_DAYS_MS)),
      },
      totalAmount: A,
      friendCount: friendsCount, 
      status: 'inferred' as const,
    };

    await createGroupExpense(groupExpense as any);
    created++;

    // Lock transactions out immediately
    usedAnchorIds.add(bestAnchor.id);
    for (const id of participantTransactionIds) usedTransactionIds.add(id);
  }

  return created;
}

/**
 * inferCustomGroup
 * Attempts to create a new group expense for a specific anchor with an additional
 * extra amount (in cents) added to the anchor's absolute value.
 */
export async function inferCustomGroup(anchorId: string, extraCents: number): Promise<boolean> {
  const txs = await getAllTransactions();
  const existing = await getAllGroupExpenses();

  const usedReimbursementIds = new Set<string>();
  for (const g of existing) {
    for (const pid of g.participantTransactionIds) usedReimbursementIds.add(pid);
  }

  const anchor = txs.find(t => t.id === anchorId);
  if (!anchor) return false;

  const anchorTime = time(anchor);
  const ACents = Math.round(Math.abs(anchor.amount) * 100) + extraCents;
  const A = ACents / 100;

  // Gather all potential inbound candidates near this anchor
  const candidates = txs.filter(t =>
    t.amount > 0 &&
    !usedReimbursementIds.has(t.id) &&
    Math.abs(time(t) - anchorTime) <= SEVEN_DAYS_MS &&
    hasValidPrefix(t.description)
  );

  if (candidates.length < 2) { 
    return createEmptyFallback(anchorId, anchorTime, A);
  }

  // Sort chronologically for precise sliding-window evaluation
  candidates.sort((a, b) => time(a) - time(b));

  const validClusters: Transaction[][] = [];

  // Re-grouping candidates utilizing strict 7-day rolling window constraints
  for (let i = 0; i < candidates.length; i++) {
    const baseTx = candidates[i];
    const baseAmountCents = Math.round(baseTx.amount * 100);
    const potentialCluster = [baseTx];

    for (let j = i + 1; j < candidates.length; j++) {
      const compareTx = candidates[j];
      if (time(compareTx) - time(baseTx) > SEVEN_DAYS_MS) break;

      if (Math.round(Math.abs(compareTx.amount - baseTx.amount) * 100) <= CENTS_5) {
        potentialCluster.push(compareTx);
      }
    }

    if (potentialCluster.length >= 2) {
      const times = potentialCluster.map(t => time(t));
      if (Math.max(...times) - Math.min(...times) <= SEVEN_DAYS_MS) {
        validClusters.push(potentialCluster);
      }
    }
  }

  if (validClusters.length === 0) {
    return createEmptyFallback(anchorId, anchorTime, A);
  }

  // Process the largest clusters first
  validClusters.sort((a, b) => b.length - a.length);

  for (const cl of validClusters) {
    const n = cl.length;
    const clusterTotalCents = Math.round(cl.reduce((sum, t) => sum + t.amount, 0) * 100);
    const averageParcelCents = Math.round(clusterTotalCents / n);
    
    const minAnchorThresholdCents = clusterTotalCents + averageParcelCents - CENTS_5;

    // Check if the forced anchor calculation satisfies the new formula limit
    if (ACents <= minAnchorThresholdCents) {
      continue;
    }

    const participantTransactionIds = cl.map(t => t.id);
    const ge = {
      id: crypto.randomUUID(),
      anchorTransactionId: anchorId,
      participantTransactionIds,
      dateWindow: { 
        start: dateYMD(new Date(anchorTime - SEVEN_DAYS_MS)), 
        end: dateYMD(new Date(anchorTime + SEVEN_DAYS_MS)) 
      },
      totalAmount: A,
      friendCount: n,
      status: 'inferred' as const,
    };
    try {
      await createGroupExpense(ge as any);
      return true;
    } catch (err) {
      console.error('inferCustomGroup failed', err);
      return false;
    }
  }

  return createEmptyFallback(anchorId, anchorTime, A);
}

/** Helper fallback generation keeping logic clean */
async function createEmptyFallback(anchorId: string, anchorTime: number, A: number): Promise<boolean> {
  const fallbackGroup = {
    id: crypto.randomUUID(),
    anchorTransactionId: anchorId,
    participantTransactionIds: [] as string[],
    dateWindow: { 
      start: dateYMD(new Date(anchorTime - SEVEN_DAYS_MS)), 
      end: dateYMD(new Date(anchorTime + SEVEN_DAYS_MS)) 
    },
    totalAmount: A,
    friendCount: 0,
    status: 'inferred' as const,
  };
  try {
    await createGroupExpense(fallbackGroup as any);
    return true;
  } catch (err) {
    console.error('inferCustomGroup:failed-to-create-empty', err);
    return false;
  }
}
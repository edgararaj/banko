'use client'

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, Card, CardActionArea, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Divider, List, ListItem, ListItemText, Stack, TextField, Typography, Collapse, IconButton } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { getAllGroupExpenses, getAllTransactions, getAllEntities, getAllBankAccounts, updateGroupExpense, deleteGroupExpense, resolveTransactionBankAccountId } from '../lib/db';
import type { GroupExpense, BankAccount, Transaction } from '../lib/types';
import TransactionsList from '../components/TransactionsList';
import { participantCountForGroup, balanceExcludingPayer, candidateTransfersNearExpense, candidateExpensesNearTransfer, computeGroupTotals } from '../lib/group';
import { parseDateStringToMs } from '../lib/format';

function formatCents(cents: number) {
  const sign = cents < 0 ? '-' : '';
  const a = Math.abs(cents);
  const euros = Math.floor(a / 100);
  const rem = Math.abs(a % 100).toString().padStart(2, '0');
  return `${sign}${euros},${rem} €`;
}

function parseExtraExpensesInput(input: string) {
  const cleaned = input.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned || '0');
  return Math.round((Number.isFinite(parsed) ? parsed : 0) * 100);
}

function formatExtraExpensesInput(cents: number) {
  const v = Math.round(cents || 0) / 100;
  return v.toFixed(2);
}

function calculateExpensesTotal(group: GroupExpense, txs: Transaction[]): number {
  return (group.expenseTransactionIds || []).reduce((sum, txnId) => {
    const tx = txs.find(t => t.id === txnId);
    return sum + (tx ? Math.abs(tx.amount) : 0);
  }, 0);
}

function calculateRefundsTotal(group: GroupExpense, txs: Transaction[]): number {
  return (group.refundTransactionIds || []).reduce((sum, txnId) => {
    const tx = txs.find(t => t.id === txnId);
    return sum + (tx ? tx.amount : 0);
  }, 0);
}

function groupAnchorDateMs(group: GroupExpense, txs: Transaction[]) {
  const firstExpense = txs.find((tx) => tx.id === group.expenseTransactionIds?.[0]);
  const fallbackDate = group.dateWindow?.start ?? group.dateWindow?.end ?? '';
  const ms = parseDateStringToMs(firstExpense?.date ?? fallbackDate);
  return Number.isFinite(ms) ? ms : 0;
}

function groupStatusRank(status: GroupExpense['status']) {
  if (status === 'modified') return 0;
  if (status === 'inferred') return 1;
  return 2;
}

function getPrimaryExpenseInfo(group: GroupExpense, txs: Transaction[], linkedAccounts: Record<string, BankAccount>) {
  const primaryExpense = txs.find((tx) => tx.id === group.expenseTransactionIds?.[0]);
  const primaryExpenseAccount = primaryExpense ? linkedAccounts[resolveTransactionBankAccountId(primaryExpense) ?? ''] : undefined;

  return {
    primaryExpenseName: primaryExpense?.description ?? primaryExpense?.id ?? '',
    primaryExpenseBankName: primaryExpenseAccount?.name ?? '',
  };
}

function getEntityNameForTransaction(tx: Transaction | undefined, linkedAccounts: Record<string, BankAccount>, entities: Record<string, string>): string {
  if (!tx) return 'unknown';
  const accountId = resolveTransactionBankAccountId(tx);
  const account = accountId ? linkedAccounts[accountId] : undefined;
  return account ? (entities[account.entityId] ?? account.entityId) : 'unknown';
}

interface AggregatedTransactions {
  type: 'aggregation';
  entityName: string;
  totalAmount: number;
  transactions: Transaction[];
}

interface IndividualTransaction {
  type: 'individual';
  transaction: Transaction;
  entityName: string;
}

type TransactionItem = AggregatedTransactions | IndividualTransaction;

function organizeTransactionsByEntity(
  txnIds: string[],
  allTransactions: Transaction[],
  linkedAccounts: Record<string, BankAccount>,
  entities: Record<string, string>
): TransactionItem[] {
  const txMap = new Map(allTransactions.map(t => [t.id, t]));
  
  // Group by entity
  const byEntity = new Map<string, Transaction[]>();
  for (const txnId of txnIds) {
    const tx = txMap.get(txnId);
    if (!tx) continue;
    const entityName = getEntityNameForTransaction(tx, linkedAccounts, entities);
    if (!byEntity.has(entityName)) {
      byEntity.set(entityName, []);
    }
    byEntity.get(entityName)!.push(tx);
  }

  // Separate aggregations (2+) from individuals
  const aggregations: AggregatedTransactions[] = [];
  const individuals: IndividualTransaction[] = [];

  for (const [entityName, transactions] of byEntity) {
    if (transactions.length > 1) {
      const sorted = [...transactions].sort((a, b) => parseDateStringToMs(b.date) - parseDateStringToMs(a.date));
      const total = sorted.reduce((sum, t) => sum + t.amount, 0);
      const avgDate = sorted.reduce((sum, t) => sum + parseDateStringToMs(t.date), 0) / sorted.length;
      aggregations.push({
        type: 'aggregation',
        entityName,
        totalAmount: total,
        transactions: sorted,
        avgDate,
      } as any);
    } else {
      individuals.push({
        type: 'individual',
        transaction: transactions[0],
        entityName,
      });
    }
  }

  // Sort aggregations by average date (most recent first), individuals by date
  aggregations.sort((a, b) => (b as any).avgDate - (a as any).avgDate);
  individuals.sort((a, b) => parseDateStringToMs(b.transaction.date) - parseDateStringToMs(a.transaction.date));

  return [...aggregations, ...individuals];
}

export default function GroupExpensesPage() {
  const [groups, setGroups] = useState<GroupExpense[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [entities, setEntities] = useState<Record<string,string>>({});
  const [linkedAccounts, setLinkedAccounts] = useState<Record<string, BankAccount>>({});
  const [editing, setEditing] = useState<GroupExpense | null>(null);
  const [extraExpensesInput, setExtraExpensesInput] = useState('');
  const [showSelector, setShowSelector] = useState(false);
  const [showExpenseSelector, setShowExpenseSelector] = useState(false);
  const [showAllTransfers, setShowAllTransfers] = useState(false);
  const [selectedTransferIds, setSelectedTransferIds] = useState<string[]>([]);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);
  const [expandedAggregations, setExpandedAggregations] = useState<Set<string>>(new Set());

  const router = useRouter();
  const [editId, setEditId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const p = new URLSearchParams(window.location.search);
    return p.get('edit');
  });

  useEffect(() => {
    async function load() {
      const gs = await getAllGroupExpenses();
      setGroups(gs);
      const allTx = await getAllTransactions();
      allTx.sort((a, b) => parseDateStringToMs(b.date) - parseDateStringToMs(a.date));
      setTxs(allTx);
      const es = await getAllEntities();
      const map: Record<string,string> = {};
      for (const e of es) map[e.id] = e.name;
      setEntities(map);
      const accounts = await getAllBankAccounts();
      const accountMap: Record<string, BankAccount> = {};
      for (const account of accounts) accountMap[account.id] = account;
      setLinkedAccounts(accountMap);

      if (editId) {
        const g = gs.find(x => x.id === editId);
        setEditing(g || null);
        setExtraExpensesInput(g ? formatExtraExpensesInput(g.extraExpenses ?? 0) : '0.00');
        setShowAllTransfers(false);
        setSelectedTransferIds([]);
        setSelectedExpenseIds([]);
      } else {
        setEditing(null);
        setExtraExpensesInput('');
      }
    }
    load();
  }, [editId]);

  if (editing) {
    const ed = editing;
    const expenseTransactions = txs.filter(x => ed.expenseTransactionIds?.includes(x.id) ?? false);
    const refundTransactions = txs.filter(x => ed.refundTransactionIds?.includes(x.id) ?? false);
    
    // Find nearby transfers anchored on existing expenses
    let transferSelectorCandidates: Transaction[] = [];
    if (expenseTransactions.length > 0) {
      transferSelectorCandidates = candidateTransfersNearExpense(txs, expenseTransactions);
    }
    
    // Find nearby expenses anchored on existing refunds
    let expenseSelectorCandidates: Transaction[] = [];
    if (refundTransactions.length > 0) {
      expenseSelectorCandidates = candidateExpensesNearTransfer(txs, refundTransactions);
    }
    
    const existingSet = new Set([...(ed.expenseTransactionIds || []), ...(ed.refundTransactionIds || [])]);
    transferSelectorCandidates = transferSelectorCandidates.filter(t => !existingSet.has(t.id));
    expenseSelectorCandidates = expenseSelectorCandidates.filter(t => !existingSet.has(t.id));
    const allSelectableTransfers = txs.filter((t) => !existingSet.has(t.id));
    const visibleTransfers = showAllTransfers
      ? allSelectableTransfers.filter(t => t.amount > 0)
      : transferSelectorCandidates.filter(t => t.amount > 0);
    const visibleExpenses = showAllTransfers
      ? allSelectableTransfers.filter(t => t.amount < 0)
      : expenseSelectorCandidates.filter(t => t.amount < 0);

    const participantCount = participantCountForGroup(ed, ed.refundTransactionIds);
    const parsedExtraExpenses = parseExtraExpensesInput(extraExpensesInput);
    const expensesTotal = calculateExpensesTotal(ed, txs) + parsedExtraExpenses;
    const refundsTotal = calculateRefundsTotal(ed, txs);
    const totals = computeGroupTotals({ ...ed, extraExpenses: parsedExtraExpenses }, txs);
    const balanceExcludingMyShare = balanceExcludingPayer(totals.total, txs, ed.refundTransactionIds, ed.friendCount, 0);
    const balance = refundsTotal - expensesTotal;

    const organizedExpenses = organizeTransactionsByEntity(ed.expenseTransactionIds || [], txs, linkedAccounts, entities);
    const organizedRefunds = organizeTransactionsByEntity(ed.refundTransactionIds || [], txs, linkedAccounts, entities);

    const toggleAggregationExpanded = (aggregationKey: string) => {
      setExpandedAggregations(prev => {
        const newSet = new Set(prev);
        if (newSet.has(aggregationKey)) {
          newSet.delete(aggregationKey);
        } else {
          newSet.add(aggregationKey);
        }
        return newSet;
      });
    };

    return (
      <Box sx={{ p: 2 }}>
        <Stack direction="row" spacing={1.5} sx={{ mb: 2, alignItems: 'center' }}>
          <Button variant="outlined" size="small" onClick={() => { setEditId(null); router.push('/group-expenses'); }}>Back</Button>
          <Typography variant="h5" component="h1">Edit Group</Typography>
        </Stack>

        <Stack spacing={1.25} sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="body1">Group name:</Typography>
            <TextField
              type="text"
              size="small"
              placeholder="Optional label"
              value={ed.name ?? ''}
              onChange={(e) => {
                setEditing({ ...ed, name: e.target.value || undefined });
              }}
              sx={{ flex: 1, minWidth: 200 }}
            />
          </Stack>

          <Typography variant="body1">Total expenses: <strong>{formatCents(expensesTotal)}</strong></Typography>
          <Typography variant="body1">Balance: <strong>{formatCents(balance)}</strong></Typography>
        </Stack>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>Expense shared by participants</Typography>
            <Typography variant="body1">Balance (excluding my share): <strong>{formatCents(balanceExcludingMyShare)}</strong></Typography>
            <Typography variant="body1">Participants: <strong>{participantCount}</strong> (<strong>{formatCents(Math.trunc(expensesTotal / Math.max(1, participantCount)))}</strong> each)</Typography>
            <Typography className="small-muted" sx={{ mt: 2, fontSize: '0.875rem' }}>
              Your share is calculated as the median refund amount received from the other participants. The number of participants = total expenses / each participant's share.
            </Typography>
          </CardContent>
        </Card>

        <Divider sx={{ my: 2 }} />

        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>Expenses</Typography>
            {(ed.expenseTransactionIds || []).length === 0 ? (
              <Alert severity="info">No expense transactions recorded.</Alert>
            ) : (
              <List disablePadding>
                {organizedExpenses.map((item, idx) => {
                  if (item.type === 'aggregation') {
                    const aggregationKey = `expense-agg-${item.entityName}`;
                    const isExpanded = expandedAggregations.has(aggregationKey);
                    return (
                      <React.Fragment key={aggregationKey}>
                        <ListItem
                          disableGutters
                          onClick={() => toggleAggregationExpanded(aggregationKey)}
                          sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                        >
                          <IconButton
                            size="small"
                            sx={{
                              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                              transition: 'transform 0.3s',
                            }}
                          >
                            <ExpandMoreIcon />
                          </IconButton>
                          <ListItemText
                            primary={`${item.entityName}`}
                            secondary={`${item.transactions.length} transactions - ${formatCents(Math.abs(item.totalAmount))}`}
                          />
                        </ListItem>
                        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                          <List component="div" disablePadding sx={{ pl: 4, bgcolor: 'rgba(0, 0, 0, 0.02)' }}>
                            {item.transactions.map((tx, txIdx) => (
                              <React.Fragment key={tx.id}>
                                <ListItem
                                  disableGutters
                                  secondaryAction={
                                    <Button
                                      color="error"
                                      size="small"
                                      onClick={() => {
                                        const updated = {
                                          ...ed,
                                          expenseTransactionIds: ed.expenseTransactionIds.filter((x: string) => x !== tx.id),
                                        };
                                        setEditing(updated);
                                      }}
                                    >
                                      Remove
                                    </Button>
                                  }
                                >
                                  <ListItemText
                                    primary={
                                      <Typography variant="body2">
                                        {tx.date} - {formatCents(Math.abs(tx.amount))}
                                      </Typography>
                                    }
                                  />
                                </ListItem>
                                {txIdx < item.transactions.length - 1 ? <Divider component="li" /> : null}
                              </React.Fragment>
                            ))}
                          </List>
                        </Collapse>
                        {idx < organizedExpenses.length - 1 ? <Divider component="li" /> : null}
                      </React.Fragment>
                    );
                  } else {
                    const tx = item.transaction;
                    return (
                      <React.Fragment key={tx.id}>
                        <ListItem
                          disableGutters
                          secondaryAction={
                            <Button
                              color="error"
                              onClick={() => {
                                const updated = {
                                  ...ed,
                                  expenseTransactionIds: ed.expenseTransactionIds.filter((x: string) => x !== tx.id),
                                };
                                setEditing(updated);
                              }}
                            >
                              Remove
                            </Button>
                          }
                        >
                          <ListItemText
                            primary={`${tx.date} ${tx ? `- ${formatCents(Math.abs(tx.amount))}` : ''}`}
                            secondary={item.entityName}
                          />
                        </ListItem>
                        {idx < organizedExpenses.length - 1 ? <Divider component="li" /> : null}
                      </React.Fragment>
                    );
                  }
                })}
              </List>
            )}
            <Box sx={{ mt: 2 }}>
              <Button variant="outlined" onClick={() => setShowExpenseSelector(true)}>Add expense</Button>
            </Box>
            {(ed.expenseTransactionIds || []).length > 0 ? <Divider sx={{mb: 2, mt: 2}} /> : <></>}
              <Stack spacing={1.5} sx={{ mb: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography variant="body2">Extra expenses:</Typography>
                <TextField
                  type="text"
                  size="small"
                  inputMode="decimal"
                  autoComplete="off"
                  value={extraExpensesInput}
                  onChange={(e) => {
                    setExtraExpensesInput(e.target.value);
                  }}
                  sx={{ width: 100 }}
                />
              </Stack>
              <Typography variant="body1">Total: <strong>{formatCents(expensesTotal)}</strong></Typography>
            </Stack>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>Refunds</Typography>
            {(ed.refundTransactionIds || []).length === 0 ? (
              <Alert severity="info">No refund transfers selected yet.</Alert>
            ) : (
              <List disablePadding>
                {organizedRefunds.map((item, idx) => {
                  if (item.type === 'aggregation') {
                    const aggregationKey = `refund-agg-${item.entityName}`;
                    const isExpanded = expandedAggregations.has(aggregationKey);
                    return (
                      <React.Fragment key={aggregationKey}>
                        <ListItem
                          disableGutters
                          onClick={() => toggleAggregationExpanded(aggregationKey)}
                          sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                        >
                          <IconButton
                            size="small"
                            sx={{
                              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                              transition: 'transform 0.3s',
                            }}
                          >
                            <ExpandMoreIcon />
                          </IconButton>
                          <ListItemText
                            primary={`${item.entityName}`}
                            secondary={`${item.transactions.length} transactions - ${formatCents(item.totalAmount)}`}
                          />
                        </ListItem>
                        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                          <List component="div" disablePadding sx={{ pl: 4, bgcolor: 'rgba(0, 0, 0, 0.02)' }}>
                            {item.transactions.map((tx, txIdx) => (
                              <React.Fragment key={tx.id}>
                                <ListItem
                                  disableGutters
                                  secondaryAction={
                                    <Button
                                      color="error"
                                      size="small"
                                      onClick={() => {
                                        const updated = {
                                          ...ed,
                                          refundTransactionIds: ed.refundTransactionIds.filter((x: string) => x !== tx.id),
                                        };
                                        setEditing(updated);
                                      }}
                                    >
                                      Remove
                                    </Button>
                                  }
                                >
                                  <ListItemText
                                    primary={
                                      <Typography variant="body2">
                                        {tx.date} - {formatCents(tx.amount)}
                                      </Typography>
                                    }
                                  />
                                </ListItem>
                                {txIdx < item.transactions.length - 1 ? <Divider component="li" /> : null}
                              </React.Fragment>
                            ))}
                          </List>
                        </Collapse>
                        {idx < organizedRefunds.length - 1 ? <Divider component="li" /> : null}
                      </React.Fragment>
                    );
                  } else {
                    const tx = item.transaction;
                    return (
                      <React.Fragment key={tx.id}>
                        <ListItem
                          disableGutters
                          secondaryAction={
                            <Button
                              color="error"
                              onClick={() => {
                                const updated = {
                                  ...ed,
                                  refundTransactionIds: ed.refundTransactionIds.filter((x: string) => x !== tx.id),
                                };
                                setEditing(updated);
                              }}
                            >
                              Remove
                            </Button>
                          }
                        >
                          <ListItemText
                            primary={`${tx.date} ${tx ? `- ${formatCents(tx.amount)}` : ''}`}
                            secondary={item.entityName}
                          />
                        </ListItem>
                        {idx < organizedRefunds.length - 1 ? <Divider component="li" /> : null}
                      </React.Fragment>
                    );
                  }
                })}
              </List>
            )}
            <Box sx={{ mt: 2 }}>
              <Button variant="outlined" onClick={() => setShowSelector(true)}>Add refund</Button>
            </Box>
            {(ed.expenseTransactionIds || []).length > 0 ? <Divider sx={{mb: 2, mt: 2}} /> : <></>}
            <Stack spacing={1.5} sx={{ mb: 0 }}>
              <Typography variant="body1">Total: <strong>{formatCents(refundsTotal)}</strong></Typography>
            </Stack>
          </CardContent>
        </Card>

        <Dialog open={showSelector} onClose={() => setShowSelector(false)} fullWidth maxWidth="md">
          <DialogTitle>Select transfers to add</DialogTitle>
          <DialogContent dividers>
            <Box sx={{ maxHeight: '62vh', overflowY: 'auto', pt: 1 }}>
              <TransactionsList
                transactions={visibleTransfers}
                selectable={true}
                selectedIds={selectedTransferIds}
                onSelectionChange={setSelectedTransferIds}
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button variant="outlined" onClick={() => setShowAllTransfers((prev) => !prev)}>
              {showAllTransfers ? 'Show less' : 'Show more'}
            </Button>
            <Button
              variant="contained"
              color="success"
              onClick={() => {
                const unique = new Set([...(ed.refundTransactionIds || []), ...selectedTransferIds]);
                const updated = { ...ed, refundTransactionIds: Array.from(unique) };
                setEditing(updated);
                setGroups(gs => gs.map(g => g.id === updated.id ? updated : g));
                setShowSelector(false);
                setShowAllTransfers(false);
                setSelectedTransferIds([]);
              }}
            >
              Confirm selection
            </Button>
            <Button onClick={() => { setShowSelector(false); setSelectedTransferIds([]); }}>Close</Button>
          </DialogActions>
        </Dialog>

        <Dialog open={showExpenseSelector} onClose={() => setShowExpenseSelector(false)} fullWidth maxWidth="md">
          <DialogTitle>Select expense transactions to add</DialogTitle>
          <DialogContent dividers>
            <Box sx={{ maxHeight: '62vh', overflowY: 'auto', pt: 1 }}>
              <TransactionsList
                transactions={visibleExpenses}
                selectable={true}
                selectedIds={selectedExpenseIds}
                onSelectionChange={setSelectedExpenseIds}
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button variant="outlined" onClick={() => setShowAllTransfers((prev) => !prev)}>
              {showAllTransfers ? 'Show less' : 'Show more'}
            </Button>
            <Button
              variant="contained"
              color="success"
              onClick={() => {
                const unique = new Set([...(ed.expenseTransactionIds || []), ...selectedExpenseIds]);
                const updated = { ...ed, expenseTransactionIds: Array.from(unique) };
                setEditing(updated);
                setGroups(gs => gs.map(g => g.id === updated.id ? updated : g));
                setShowExpenseSelector(false);
                setShowAllTransfers(false);
                setSelectedExpenseIds([]);
              }}
            >
              Confirm selection
            </Button>
            <Button onClick={() => { setShowExpenseSelector(false); setSelectedExpenseIds([]); }}>Close</Button>
          </DialogActions>
        </Dialog>

        <Stack spacing={1.25} sx={{ mt: 2.5 }}>
          <Button
            variant="contained"
            onClick={async () => {
              try {
                const distinctEntities = new Set<string>();
                for (const txnId of ed.refundTransactionIds || []) {
                  const t = txs.find(x => x.id === txnId);
                  const accountId = t ? resolveTransactionBankAccountId(t) : null;
                  const account = accountId ? linkedAccounts[accountId] : undefined;
                  if (account) distinctEntities.add(account.entityId);
                }
                const toSave = {
                  ...ed,
                  extraExpenses: parsedExtraExpenses,
                  friendCount: distinctEntities.size > 0 ? distinctEntities.size : (ed.refundTransactionIds?.length ?? 0),
                  status: 'modified' as const
                };
                await updateGroupExpense(toSave);
                setEditId(null);
                router.push('/group-expenses');
              } catch (err) {
                console.error(err);
                alert(err instanceof Error ? err.message : 'Save failed');
              }
            }}
          >
            Save
          </Button>
          <Button
            variant="contained"
            color={ed.status === 'completed' ? 'inherit' : 'success'}
            sx={ed.status === 'completed' ? { bgcolor: 'action.disabledBackground', color: 'text.disabled' } : {}}
            onClick={async () => {
              try {
                const toSave = {
                  ...ed,
                  extraExpenses: parsedExtraExpenses,
                  status: ed.status === 'completed' ? ('modified' as const) : ('completed' as const),
                };
                await updateGroupExpense(toSave);
                setEditId(null);
                router.push('/group-expenses');
              } catch (err) {
                console.error(err);
                alert(err instanceof Error ? err.message : 'Failed to update status');
              }
            }}
          >
            {ed.status === 'completed' ? 'Mark uncomplete' : 'Mark complete'}
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={async () => {
              if (!confirm('Are you sure you want to delete this group expense? This action cannot be undone.')) {
                return;
              }
              try {
                await deleteGroupExpense(ed.id);
                setEditId(null);
                router.push('/group-expenses');
              } catch (err) {
                console.error(err);
                alert(err instanceof Error ? err.message : 'Delete failed');
              }
            }}
          >
            Delete
          </Button>
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" component="h2" sx={{ mb: 2 }}>Group Expenses</Typography>
      <Stack spacing={1.25}>
        {[...groups]
          .sort((a, b) => {
            const statusDiff = groupStatusRank(a.status) - groupStatusRank(b.status);
            if (statusDiff !== 0) return statusDiff;
            return groupAnchorDateMs(b, txs) - groupAnchorDateMs(a, txs);
          })
          .map(g => {
          const totals = computeGroupTotals(g, txs);
          const { primaryExpenseName, primaryExpenseBankName } = getPrimaryExpenseInfo(g, txs, linkedAccounts);
          const balanceExcludingMyShare = balanceExcludingPayer(totals.total, txs, g.refundTransactionIds, g.friendCount, 0);
          const participantCount = participantCountForGroup(g, g.refundTransactionIds);
          const isCompleted = g.status === 'completed';
          return (
            <Card key={g.id} variant="outlined">
              <CardActionArea
                onClick={() => {
                  setEditId(g.id);
                  router.push(`/group-expenses?edit=${g.id}`);
                }}
                sx={{ px: 1.25, py: 1.1 }}
              >
                <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                    {isCompleted ? <CheckCircleRoundedIcon sx={{ color: 'success.main', fontSize: 18 }} /> : null}
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, color: isCompleted ? 'success.main' : 'text.primary' }}>
                      {g.name ? `${g.name} - ` : ''}{formatCents(totals.total)} - {g.status}
                    </Typography>
                  </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
                      Primary: {primaryExpenseName}{primaryExpenseBankName ? ` - ${primaryExpenseBankName}` : ''}
                    </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
                    Participants: {participantCount}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
                    Balance (excluding my share): {formatCents(balanceExcludingMyShare)}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          );
        })}
      </Stack>
    </Box>
  );
}

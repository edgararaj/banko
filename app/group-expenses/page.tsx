'use client'

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, Card, CardActionArea, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Divider, List, ListItem, ListItemText, Stack, TextField, Typography } from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { getAllGroupExpenses, getAllTransactions, getAllEntities, getAllBankAccounts, updateGroupExpense, deleteGroupExpense, resolveTransactionBankAccountId } from '../lib/db';
import type { GroupExpense, BankAccount, Transaction } from '../lib/types';
import TransactionsList from '../components/TransactionsList';
import { participantCountForGroup, remainingExcludingPayer, candidateTransfersNearAnchor } from '../lib/group';
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

function groupAnchorDateMs(group: GroupExpense, txs: Transaction[]) {
  const anchor = txs.find((tx) => tx.id === group.anchorTransactionId);
  const fallbackDate = group.dateWindow?.start ?? group.dateWindow?.end ?? '';
  const ms = parseDateStringToMs(anchor?.date ?? fallbackDate);
  return Number.isFinite(ms) ? ms : 0;
}

export default function GroupExpensesPage() {
  const [groups, setGroups] = useState<GroupExpense[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [entities, setEntities] = useState<Record<string,string>>({});
  const [linkedAccounts, setLinkedAccounts] = useState<Record<string, BankAccount>>({});
  const [editing, setEditing] = useState<GroupExpense | null>(null);
  const [extraExpensesInput, setExtraExpensesInput] = useState('');
  const [showSelector, setShowSelector] = useState(false);
  const [showAllTransfers, setShowAllTransfers] = useState(false);
  const [selectedTransferIds, setSelectedTransferIds] = useState<string[]>([]);

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
        setExtraExpensesInput(((g?.extraExpenses ?? 0) / 100).toFixed(2));
        setShowAllTransfers(false);
        setSelectedTransferIds([]);
      } else {
        setEditing(null);
        setExtraExpensesInput('');
      }
    }
    load();
  }, [editId]);

  if (editing) {
    const ed = editing;
    const anchorTx = txs.find(x => x.id === ed.anchorTransactionId);
    let selectorCandidates: Transaction[] = [];
    if (anchorTx) {
      selectorCandidates = candidateTransfersNearAnchor(txs, anchorTx, 10, 0.5);
      const existingSet = new Set(ed.participantTransactionIds || []);
      selectorCandidates = selectorCandidates.filter(t => !existingSet.has(t.id));
    }
    const existingSet = new Set(ed.participantTransactionIds || []);
    const allSelectableTransfers = txs.filter((t) => !existingSet.has(t.id));
    const visibleTransfers = showAllTransfers ? allSelectableTransfers : selectorCandidates;

    const participantCount = participantCountForGroup(ed, ed.participantTransactionIds);
    const remainingExcludingMyShare = remainingExcludingPayer(ed.totalAmount, txs, ed.participantTransactionIds, ed.friendCount, ed.extraExpenses ?? 0);
    const anchor = txs.find(x => x.id === ed.anchorTransactionId);
    const anchorDescription = anchor ? (anchor.description ?? '') : '';
    const anchorAccount = anchor ? linkedAccounts[resolveTransactionBankAccountId(anchor) ?? ''] : undefined;
    const anchorName = anchorAccount ? (entities[anchorAccount.entityId] ?? anchorAccount.entityId) : '';
    const parsedExtraExpenses = parseExtraExpensesInput(extraExpensesInput);

    return (
      <Box sx={{ p: 2 }}>
        <Stack direction="row" spacing={1.5} sx={{ mb: 2, alignItems: 'center' }}>
          <Button variant="outlined" size="small" onClick={() => { setEditId(null); router.push('/group-expenses'); }}>Back</Button>
          <Typography variant="h5" component="h1">Edit Group</Typography>
        </Stack>

        <Stack spacing={1.25} sx={{ mb: 2 }}>
          <Typography variant="body1">Total: <strong>{formatCents(ed.totalAmount)}</strong></Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="body1">Extra expenses:</Typography>
            <TextField
              type="text"
              size="small"
              inputMode="decimal"
              autoComplete="off"
              value={extraExpensesInput}
              onChange={(e) => {
                setExtraExpensesInput(e.target.value);
              }}
              sx={{ width: 120 }}
            />
            <Typography variant="body1"><strong>{formatCents(parsedExtraExpenses)}</strong></Typography>
          </Stack>
          <Typography variant="body1">Participants: <strong>{participantCount}</strong></Typography>
          <Typography variant="body1">Remaining (excluding my share): <strong>{formatCents(remainingExcludingMyShare)}</strong></Typography>
          <Typography variant="body2" color="text.secondary">Date window: {ed.dateWindow?.start}{' -> '}{ed.dateWindow?.end}</Typography>
          <Typography variant="body2" color="text.secondary">Anchor Tx ID: {ed.anchorTransactionId}</Typography>
          <Typography variant="body2" color="text.secondary">Anchor description: {anchorDescription}</Typography>
          <Typography variant="body2" color="text.secondary">Anchor name: {anchorName}</Typography>
        </Stack>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>Participants</Typography>
            {(ed.participantTransactionIds || []).length === 0 ? (
              <Alert severity="info">No participant transfers selected yet.</Alert>
            ) : (
              <List disablePadding>
                {(ed.participantTransactionIds || []).map((pid: string, idx: number) => {
                  const t = txs.find(x => x.id === pid);
                  return (
                    <React.Fragment key={pid}>
                      <ListItem
                        disableGutters
                        secondaryAction={
                          <Button
                            color="error"
                            onClick={() => {
                              const updated = {
                                ...ed,
                                participantTransactionIds: ed.participantTransactionIds.filter((x: string) => x !== pid),
                              };
                              setEditing(updated);
                            }}
                          >
                            Remove
                          </Button>
                        }
                      >
                        <ListItemText
                          primary={`${t ? t.date : pid} ${t ? `- ${formatCents(t.amount)}` : ''}`}
                          secondary={(() => {
                            const accountId = t ? resolveTransactionBankAccountId(t) : null;
                            const account = accountId ? linkedAccounts[accountId] : undefined;
                            return account ? (entities[account.entityId] ?? account.entityId) : 'unknown';
                          })()}
                        />
                      </ListItem>
                      {idx < (ed.participantTransactionIds || []).length - 1 ? <Divider component="li" /> : null}
                    </React.Fragment>
                  );
                })}
              </List>
            )}
            <Box sx={{ mt: 2 }}>
              <Button variant="outlined" onClick={() => setShowSelector(true)}>Add participant transfer</Button>
            </Box>
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
                const unique = new Set([...(ed.participantTransactionIds || []), ...selectedTransferIds]);
                const updated = { ...ed, participantTransactionIds: Array.from(unique) };
                updated.extraExpenses = parsedExtraExpenses;
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

        <Stack spacing={1.25} sx={{ mt: 2.5 }}>
          <Button
            variant="contained"
            onClick={async () => {
              try {
                const distinctEntities = new Set<string>();
                for (const pid of ed.participantTransactionIds || []) {
                  const t = txs.find(x => x.id === pid);
                  const accountId = t ? resolveTransactionBankAccountId(t) : null;
                  const account = accountId ? linkedAccounts[accountId] : undefined;
                  if (account) distinctEntities.add(account.entityId);
                }
                const toSave = {
                  ...ed,
                  extraExpenses: parsedExtraExpenses,
                  friendCount: distinctEntities.size > 0 ? distinctEntities.size : (ed.participantTransactionIds?.length ?? 0),
                  status: 'modified' as const
                };
                await updateGroupExpense(toSave);
                setEditId(null);
                router.push('/group-expenses');
              } catch (err) {
                console.error(err);
                alert('Save failed');
              }
            }}
          >
            Save
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={async () => {
              try {
                const toSave = {
                  ...ed,
                  extraExpenses: parsedExtraExpenses,
                  status: 'completed' as const,
                };
                await updateGroupExpense(toSave);
                setEditId(null);
                router.push('/group-expenses');
              } catch (err) {
                console.error(err);
                alert('Mark complete failed');
              }
            }}
          >
            Mark complete
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={async () => {
              try {
                await deleteGroupExpense(ed.id);
                setEditId(null);
                router.push('/group-expenses');
              } catch (err) {
                console.error(err);
                alert('Delete failed');
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
          .sort((a, b) => groupAnchorDateMs(b, txs) - groupAnchorDateMs(a, txs))
          .map(g => {
          const anchor = txs.find(t => t.id === g.anchorTransactionId);
          const anchorAccount = anchor ? linkedAccounts[resolveTransactionBankAccountId(anchor) ?? ''] : undefined;
          const anchorName = anchorAccount ? (entities[anchorAccount.entityId] || anchorAccount.entityId) : '';
          const anchorDesc = anchor ? (anchor.description ?? '') : '';
          const remaining = remainingExcludingPayer(g.totalAmount, txs, g.participantTransactionIds, g.friendCount, g.extraExpenses ?? 0);
          const participantCount = participantCountForGroup(g, g.participantTransactionIds);
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
                      {formatCents(g.totalAmount)} - {g.status}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
                    Anchor: {anchorDesc}{anchorName ? ` - ${anchorName}` : ''}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
                    Participants: {participantCount} • Remaining: {formatCents(remaining)}
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

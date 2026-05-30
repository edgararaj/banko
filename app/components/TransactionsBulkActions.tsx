'use client'

import React, { useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, List, ListItem, ListItemButton, Stack, Typography } from '@mui/material';
import { createGroupFromTransactionIds, getAllBankAccounts, getAllEntities, getAllGroupExpenses, getAllTransactions, resolveTransactionBankAccountId, updateGroupExpense } from '../lib/db';
import type { BankAccount, GroupExpense, Transaction } from '../lib/types';
import { computeGroupTotals } from '../lib/group';

function formatCents(cents: number) {
  const sign = cents < 0 ? '-' : '';
  const value = Math.abs(cents);
  const euros = Math.floor(value / 100);
  const rem = Math.abs(value % 100).toString().padStart(2, '0');
  return `${sign}${euros},${rem} €`;
}

export default function TransactionsBulkActions({
  selectedIds,
  clearSelection,
  refresh,
}: {
  selectedIds: string[];
  clearSelection: () => void;
  refresh: () => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [addingToGroup, setAddingToGroup] = useState(false);
  const [groups, setGroups] = useState<GroupExpense[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [entities, setEntities] = useState<Record<string, string>>({});
  const [accountsById, setAccountsById] = useState<Record<string, BankAccount>>({});
  const [chosenGroupId, setChosenGroupId] = useState<string | null>(null);

  async function loadPickerData() {
    const [allGroups, allTxs, allEntities, allAccounts] = await Promise.all([
      getAllGroupExpenses(),
      getAllTransactions(),
      getAllEntities(),
      getAllBankAccounts(),
    ]);

    allTxs.sort((a, b) => b.date.localeCompare(a.date));

    const entityMap: Record<string, string> = {};
    for (const entity of allEntities) entityMap[entity.id] = entity.name;

    const accountMap: Record<string, BankAccount> = {};
    for (const account of allAccounts) accountMap[account.id] = account;

    setGroups(allGroups);
    setTxs(allTxs);
    setEntities(entityMap);
    setAccountsById(accountMap);
  }

  async function handleCreateGroup() {
    if (!selectedIds || selectedIds.length === 0) return;
    setCreating(true);
    try {
      await createGroupFromTransactionIds(selectedIds);
      await refresh();
      clearSelection();
      alert('Group created');
    } catch (err) {
      console.error(err);
      alert('Failed to create group: ' + (err instanceof Error ? err.message : ''));
    } finally {
      setCreating(false);
    }
  }

  async function openAddToGroupDialog() {
    try {
      await loadPickerData();
      setChosenGroupId(null);
      setAddingToGroup(true);
    } catch (err) {
      console.error(err);
      alert('Failed to load groups');
    }
  }

  async function handleConfirmAddToGroup() {
    if (!chosenGroupId) return;
    try {
      const allTx = await getAllTransactions();
      const selectedTxs = allTx.filter((transaction) => selectedIds.includes(transaction.id));
      const expenseIds = selectedTxs.filter((transaction) => transaction.amount < 0).map((transaction) => transaction.id);
      const refundIds = selectedTxs.filter((transaction) => transaction.amount >= 0).map((transaction) => transaction.id);

      const group = groups.find((item) => item.id === chosenGroupId);
      if (!group) throw new Error('Group not found');

      const updated = {
        ...group,
        expenseTransactionIds: Array.from(new Set([...(group.expenseTransactionIds || []), ...expenseIds])),
        refundTransactionIds: Array.from(new Set([...(group.refundTransactionIds || []), ...refundIds])),
      };

      await updateGroupExpense(updated);
      await refresh();
      clearSelection();
      setAddingToGroup(false);
      setChosenGroupId(null);
      alert('Added to group');
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to add to group');
    }
  }

  if (!selectedIds || selectedIds.length === 0) return null;

  return (
    <>
      {!addingToGroup ? (
        <Box
          sx={{
            position: 'fixed',
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: `calc(var(--bottom-nav-height) + env(safe-area-inset-bottom) + 12px)`,
            zIndex: 1400,
            display: 'flex',
            gap: 1,
          }}
        >
          <Button
            variant="contained"
            onClick={openAddToGroupDialog}
            disabled={creating}
            sx={{
              bgcolor: (theme) =>
                theme.palette.mode === 'dark' ? 'rgba(14, 22, 40, 1)' : 'rgba(255, 255, 255, 1)',
              color: 'text.primary',
              '&:hover': {
                bgcolor: (theme) =>
                  theme.palette.mode === 'dark' ? 'rgba(20, 30, 54, 1)' : 'rgba(245, 245, 245, 1)',
              },
            }}
          >
            Add to group
          </Button>
          <Button variant="contained" color="primary" onClick={handleCreateGroup} disabled={creating}>
            {creating ? 'Creating...' : 'Create Group'}
          </Button>
        </Box>
      ) : null}

      <Dialog open={addingToGroup} onClose={() => setAddingToGroup(false)} fullWidth maxWidth="sm">
        <DialogTitle>Select group to add transactions</DialogTitle>
        <DialogContent dividers>
          {groups.length === 0 ? (
            <Typography color="text.secondary">No groups found</Typography>
          ) : (
            <List disablePadding>
              {groups.map((group, index) => {
                const totals = computeGroupTotals(group, txs);
                const firstExpense = txs.find((transaction) => transaction.id === group.expenseTransactionIds?.[0]);
                const firstExpenseAccount = firstExpense ? accountsById[resolveTransactionBankAccountId(firstExpense) ?? ''] : undefined;
                const firstExpenseName = firstExpenseAccount ? (entities[firstExpenseAccount.entityId] ?? firstExpenseAccount.entityId) : 'Unknown';
                const firstExpenseBankName = firstExpenseAccount?.name ?? '';

                return (
                  <React.Fragment key={group.id}>
                    <ListItem disableGutters sx={{ py: 0.5 }}>
                      <ListItemButton selected={chosenGroupId === group.id} onClick={() => setChosenGroupId(group.id)}>
                        <Stack spacing={0.35} sx={{ width: '100%' }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                            {group.name ? `${group.name} - ` : ''}{formatCents(totals.total)} - {group.status}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Primary: {firstExpenseName}{firstExpenseBankName ? ` - ${firstExpenseBankName}` : ''}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Expenses: {formatCents(totals.expensesTotal)} • Refunds: {formatCents(totals.refundsTotal)}
                          </Typography>
                        </Stack>
                      </ListItemButton>
                    </ListItem>
                    {index < groups.length - 1 ? <Divider component="li" /> : null}
                  </React.Fragment>
                );
              })}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddingToGroup(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleConfirmAddToGroup} disabled={!chosenGroupId}>
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

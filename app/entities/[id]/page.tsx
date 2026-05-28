'use client'

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Autocomplete, Box, Button, Card, CardContent, Divider, Stack, TextField, Typography, Chip } from '@mui/material';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import { getAllEntities, getAllTransactions, getAllBankAccounts, updateEntity, updateBankAccount, addBankAccountIfNotExists, resolveTransactionBankAccountId, deleteEntity } from '../../lib/db';
import type { Entity, BankAccount, Transaction } from '../../lib/types';
import { parseDateStringToMs } from '../../lib/format';

function formatCents(cents: number) {
  const sign = cents < 0 ? '-' : '';
  const a = Math.abs(cents);
  const euros = Math.floor(a / 100);
  const rem = Math.abs(a % 100).toString().padStart(2, '0');
  return `${sign}${euros},${rem} €`;
}

export default function EntityDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const entityId = params.id;

  const [entity, setEntity] = useState<Entity | null>(null);
  const [linkedAccounts, setLinkedAccounts] = useState<BankAccount[]>([]);
  const [unlinkedAccounts, setUnlinkedAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [nameInput, setNameInput] = useState('');
  const [accountSearchInput, setAccountSearchInput] = useState('');

  async function reloadAccounts() {
    const allAccounts = await getAllBankAccounts();
    setLinkedAccounts(allAccounts.filter((a) => a.entityId === entityId));
    setUnlinkedAccounts(allAccounts.filter((a) => a.entityId !== entityId));
  }

  async function reloadAccountsAndTransactions() {
    const [allAccounts, allTransactions] = await Promise.all([
      getAllBankAccounts(),
      getAllTransactions(),
    ]);

    const currentAccounts = allAccounts.filter((a) => a.entityId === entityId);
    const currentAccountIds = new Set(currentAccounts.map((a) => a.id));
    const relevantTransactions = allTransactions
      .filter((t) => currentAccountIds.has(resolveTransactionBankAccountId(t) ?? ''))
      .sort((a, b) => parseDateStringToMs(b.date) - parseDateStringToMs(a.date));

    setLinkedAccounts(currentAccounts);
    setUnlinkedAccounts(allAccounts.filter((a) => a.entityId !== entityId));
    setTransactions(relevantTransactions);
  }

  useEffect(() => {
    async function load() {
      const [allEntities, allTransactions, allAccounts] = await Promise.all([
        getAllEntities(),
        getAllTransactions(),
        getAllBankAccounts(),
      ]);

      const currentEntity = allEntities.find((item) => item.id === entityId) ?? null;
      const currentAccounts = allAccounts.filter((a) => a.entityId === entityId);
      const currentAccountIds = new Set(currentAccounts.map((a) => a.id));
      const relevantTransactions = allTransactions
        .filter((t) => currentAccountIds.has(resolveTransactionBankAccountId(t) ?? ''))
        .sort((a, b) => parseDateStringToMs(b.date) - parseDateStringToMs(a.date));

      setEntity(currentEntity);
      setLinkedAccounts(currentAccounts);
      setUnlinkedAccounts(allAccounts.filter((a) => a.entityId !== entityId));
      setTransactions(relevantTransactions);
      setNameInput(currentEntity?.name ?? '');
    }
    load();
  }, [entityId]);

  const incoming = useMemo(() => transactions.filter((t) => t.amount > 0), [transactions]);
  const outgoing = useMemo(() => transactions.filter((t) => t.amount < 0), [transactions]);

  if (!entity) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Entity not found</Typography>
        <Button variant="outlined" onClick={() => router.push('/entities')}>Back</Button>
      </Box>
    );
  }

  const handleSave = async () => {
    try {
      const updatedEntity = { ...entity, name: nameInput.trim() || entity.name };
      await updateEntity(updatedEntity);
      setEntity(updatedEntity);
      router.push('/entities');
    } catch (error) {
      console.error(error);
      alert('Save failed');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this entity? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteEntity(entityId);
      router.push('/entities');
    } catch (error) {
      console.error(error);
      if (error instanceof Error && error.message === 'ENTITY_HAS_LINKED_ACCOUNTS') {
        alert('Cannot delete entity with linked bank accounts');
      } else {
        alert('Delete failed');
      }
    }
  };

  const handleUnlinkAccount = async (account: BankAccount) => {
    try {
      await updateBankAccount({ ...account, entityId: '' });
      await reloadAccountsAndTransactions();
    } catch (error) {
      console.error(error);
      alert('Failed to unlink bank account');
    }
  };

  const handleSelectAccount = async (account: BankAccount | string | null) => {
    if (!account) return;
    setAccountSearchInput('');

    try {
      if (typeof account === 'string') {
        // Free-form input: create a new account linked to this entity
        const trimmed = account.trim();
        if (!trimmed) return;
        await addBankAccountIfNotExists(trimmed, entityId);
      } else {
        // Existing account: re-link it to this entity
        await updateBankAccount({ ...account, entityId });
      }
      await reloadAccountsAndTransactions();
    } catch (error) {
      console.error(error);
      alert('Failed to link bank account');
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" spacing={1.5} sx={{ mb: 2, alignItems: 'center' }}>
        <Button variant="outlined" size="small" onClick={() => router.push('/entities')}>Back</Button>
        <Typography variant="h5" component="h1">Entity</Typography>
      </Stack>

      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Stack spacing={1.5}>
            <Box>
              <Typography variant="body2" color="text.secondary">Friendly name</Typography>
              <TextField
                fullWidth
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Enter a familiar name"
                sx={{ mt: 0.5 }}
              />
            </Box>

            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>Bank accounts</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: linkedAccounts.length > 0 ? 1.25 : 1 }}>
                {linkedAccounts.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No linked bank accounts yet.</Typography>
                ) : linkedAccounts.map((account) => (
                  <Chip
                    key={account.id}
                    label={account.name}
                    variant="outlined"
                    onDelete={() => handleUnlinkAccount(account)}
                    size="small"
                  />
                ))}
              </Box>

              <Autocomplete
                freeSolo
                options={unlinkedAccounts}
                getOptionLabel={(option) => typeof option === 'string' ? option : option.name}
                inputValue={accountSearchInput}
                onInputChange={(_, value) => setAccountSearchInput(value)}
                onChange={(_, value) => handleSelectAccount(value)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Link bank account"
                    placeholder="Type to search or create…"
                    size="small"
                  />
                )}
                renderOption={(props, option) => (
                  <li {...props} key={option.id}>
                    <Typography variant="body2">{option.name}</Typography>
                  </li>
                )}
              />
            </Box>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Box>
                <Typography variant="body2" color="text.secondary">Incoming</Typography>
                <Typography sx={{ fontWeight: 600, color: 'success.main' }}>{incoming.length}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">Outgoing</Typography>
                <Typography sx={{ fontWeight: 600, color: 'error.main' }}>{outgoing.length}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">Total transactions</Typography>
                <Typography sx={{ fontWeight: 600 }}>{transactions.length}</Typography>
              </Box>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ mb: 2 }}>
        <Button variant="contained" onClick={handleSave}>Save</Button>
        {linkedAccounts.length === 0 && (
          <Button variant="contained" color="error" onClick={handleDelete}>Delete</Button>
        )}
      </Stack>

      <Typography variant="h6" sx={{ mb: 1 }}>Transactions</Typography>
      <Stack spacing={1.25}>
        {transactions.length === 0 ? (
          <Card variant="outlined">
            <CardContent>
              <Typography color="text.secondary">No transactions linked to this entity.</Typography>
            </CardContent>
          </Card>
        ) : transactions.map((transaction, index) => {
          const isOutgoing = transaction.amount < 0;
          return (
            <React.Fragment key={transaction.id}>
              <Card variant="outlined">
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    bgcolor: isOutgoing ? 'error.light' : 'success.light',
                    color: isOutgoing ? 'error.dark' : 'success.dark',
                  }}>
                    {isOutgoing ? <ArrowDownwardRoundedIcon /> : <ArrowUpwardRoundedIcon />}
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ fontWeight: 600 }} noWrap>{transaction.date}</Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {transaction.description || 'No description'}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                    <Typography sx={{ fontWeight: 600, color: isOutgoing ? 'error.main' : 'success.main' }}>
                      {formatCents(transaction.amount)}
                    </Typography>
                    <Typography variant="body2" color={isOutgoing ? 'error.main' : 'success.main'}>
                      {isOutgoing ? 'Outgoing' : 'Incoming'}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
              {index < transactions.length - 1 ? <Divider /> : null}
            </React.Fragment>
          );
        })}
      </Stack>
    </Box>
  );
}
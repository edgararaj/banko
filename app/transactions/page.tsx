'use client'

import React, { useEffect, useMemo, useState } from 'react';
import { getAllTransactions, getAllEntities, getAllBankAccounts, createGroupFromTransactionIds, resolveTransactionBankAccountId } from '../lib/db';
import TransactionsBulkActions from '../components/TransactionsBulkActions';
import { parseDateStringToMs } from '../lib/format';
import { Box, Button, Card, CardActionArea, CardContent, Stack, TextField, Typography, Chip, FormControl, InputLabel, Select, MenuItem, Dialog, DialogActions, DialogContent, DialogTitle, Divider } from '@mui/material';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import type { BankAccount, Transaction } from '../lib/types';

function formatCents(cents: number) {
  const sign = cents < 0 ? '-' : '';
  const a = Math.abs(cents);
  const euros = Math.floor(a / 100);
  const rem = Math.abs(a % 100).toString().padStart(2, '0');
  return `${sign}${euros},${rem} €`;
}

function parseCentsInput(input: string) {
  const cleaned = input.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned || '0');
  return Math.round((Number.isFinite(parsed) ? parsed : 0) * 100);
}

export default function TransactionsPage() {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [entitiesMap, setEntitiesMap] = useState<Record<string,string>>({});
  const [accountsById, setAccountsById] = useState<Record<string, BankAccount>>({});
  const [accountIdsByEntityId, setAccountIdsByEntityId] = useState<Record<string, string[]>>({});
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [anchorPromptOpen, setAnchorPromptOpen] = useState(false);
  const [anchorAmountInput, setAnchorAmountInput] = useState('');
  const [pendingGroupIds, setPendingGroupIds] = useState<string[]>([]);

  const [filterEntity, setFilterEntity] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [filterAmountMin, setFilterAmountMin] = useState<string>('');
  const [filterAmountMax, setFilterAmountMax] = useState<string>('');

  useEffect(() => {
    async function load() {
      const [arr, es, accounts] = await Promise.all([getAllTransactions(), getAllEntities(), getAllBankAccounts()]);
      arr.sort((a,b) => parseDateStringToMs(b.date) - parseDateStringToMs(a.date));
      setTxs(arr);
      const entityMap: Record<string,string> = {};
      for (const e of es) entityMap[e.id] = e.name;
      setEntitiesMap(entityMap);
      const accountMap: Record<string, BankAccount> = {};
      const groupedAccountIds: Record<string, string[]> = {};
      for (const account of accounts) {
        accountMap[account.id] = account;
        groupedAccountIds[account.entityId] = [...(groupedAccountIds[account.entityId] ?? []), account.id];
      }
      setAccountsById(accountMap);
      setAccountIdsByEntityId(groupedAccountIds);
    }
    load();
  }, []);

  const toggleSelect = (id: string) => setSelected(s => ({ ...s, [id]: !s[id] }));

  const selectedIds = useMemo(() => Object.entries(selected).filter(([,v])=>v).map(([k])=>k), [selected]);

  const handleCreateGroup = async () => {
    if (selectedIds.length === 0) return;
    setCreating(true);
    try {
      await createGroupFromTransactionIds(selectedIds);
      await refreshTransactions();
      setSelected({});
      alert('Group created');
    } catch (err) {
      console.error(err);
      if (err instanceof Error && err.message === 'NO_ANCHOR_FOUND') {
        setPendingGroupIds(selectedIds);
        setAnchorAmountInput('');
        setAnchorPromptOpen(true);
      } else {
        alert('Failed to create group: ' + (err instanceof Error ? err.message : ''));
      }
    } finally {
      setCreating(false);
    }
  };

  const refreshTransactions = async () => {
    const arr = await getAllTransactions();
    arr.sort((a, b) => parseDateStringToMs(b.date) - parseDateStringToMs(a.date));
    setTxs(arr);
  };

  const filtered = useMemo(() => {
    return txs.filter(t => {
      if (filterEntity) {
        const accountId = resolveTransactionBankAccountId(t);
        const allowedAccounts = accountIdsByEntityId[filterEntity] ?? [];
        if (!accountId || !allowedAccounts.includes(accountId)) return false;
      }
      if (filterDateFrom && parseDateStringToMs(t.date) < parseDateStringToMs(filterDateFrom)) return false;
      if (filterDateTo && parseDateStringToMs(t.date) > parseDateStringToMs(filterDateTo)) return false;
      const amt = t.amount;
      if (filterAmountMin) {
        const minCents = Math.round(parseFloat(filterAmountMin || '0') * 100);
        if (amt < minCents) return false;
      }
      if (filterAmountMax) {
        const maxCents = Math.round(parseFloat(filterAmountMax || '0') * 100);
        if (amt > maxCents) return false;
      }
      return true;
    });
  }, [txs, filterEntity, filterDateFrom, filterDateTo, filterAmountMin, filterAmountMax, accountIdsByEntityId]);

  const handleCreateMissingAnchorGroup = async () => {
    if (pendingGroupIds.length === 0) return;
    const cents = parseCentsInput(anchorAmountInput);
    if (cents <= 0) {
      alert('Enter an anchor amount greater than 0.');
      return;
    }

    setCreating(true);
    try {
      await createGroupFromTransactionIds(pendingGroupIds, cents);
      await refreshTransactions();
      setSelected({});
      setPendingGroupIds([]);
      setAnchorPromptOpen(false);
      setAnchorAmountInput('');
      alert('Group created');
    } catch (err) {
      console.error(err);
      alert('Failed to create group: ' + (err instanceof Error ? err.message : ''));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>Transactions</Typography>

      <Stack spacing={2} sx={{ mb: 2, flexDirection: { xs: 'column', md: 'row' } }}>
        <FormControl sx={{ minWidth: 160 }}>
          <InputLabel id="entity-filter-label">Entity</InputLabel>
          <Select
            labelId="entity-filter-label"
            value={filterEntity}
            label="Entity"
            onChange={(e) => setFilterEntity(e.target.value as string)}
          >
            <MenuItem value=""><em>All entities</em></MenuItem>
            {Object.entries(entitiesMap).map(([id, name]) => (
              <MenuItem key={id} value={id}>{name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} label="From" slotProps={{ inputLabel: { shrink: true } }} />
        <TextField type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} label="To" slotProps={{ inputLabel: { shrink: true } }} />
        <TextField type="number" slotProps={{ htmlInput: { step: '0.01' } }} value={filterAmountMin} onChange={e => setFilterAmountMin(e.target.value)} label="Min (€)" />
        <TextField type="number" slotProps={{ htmlInput: { step: '0.01' } }} value={filterAmountMax} onChange={e => setFilterAmountMax(e.target.value)} label="Max (€)" />
      </Stack>

      <Stack spacing={1.25}>
        {filtered.map((t, index) => {
          const isOutgoing = t.amount < 0;
          const accountId = resolveTransactionBankAccountId(t);
          const account = accountId ? accountsById[accountId] : null;
          const entityName = account ? (entitiesMap[account.entityId] ?? 'Unknown') : '';

          return (
            <React.Fragment key={t.id}>
              <Card
                variant="outlined"
                sx={{
                  outline: selected[t.id] ? '2px solid' : undefined,
                  outlineColor: selected[t.id] ? 'primary.main' : undefined,
                }}
              >
                <CardActionArea onClick={() => toggleSelect(t.id)}>
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
                      <Typography sx={{ fontWeight: 600 }} noWrap>
                        {t.date}{entityName ? ` · ${entityName}` : ''}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {t.description || 'No description'}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                      <Typography sx={{ fontWeight: 600, color: isOutgoing ? 'error.main' : 'success.main' }}>
                        {formatCents(t.amount)}
                      </Typography>
                      <Typography variant="body2" color={isOutgoing ? 'error.main' : 'success.main'}>
                        {isOutgoing ? 'Outgoing' : 'Incoming'}
                      </Typography>
                      {selected[t.id] ? <Chip label="Selected" color="primary" size="small" sx={{ mt: 0.5 }} /> : null}
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
              {index < filtered.length - 1 ? <Divider /> : null}
            </React.Fragment>
          );
        })}
      </Stack>

      <TransactionsBulkActions selectedIds={selectedIds} clearSelection={() => setSelected({})} refresh={refreshTransactions} />

      <Dialog open={anchorPromptOpen} onClose={() => setAnchorPromptOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Enter anchor amount</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            No anchor payment was found in the selected transfers. Enter the anchor amount to create the group.
          </Typography>
          <TextField
            fullWidth
            label="Anchor amount"
            value={anchorAmountInput}
            onChange={(e) => setAnchorAmountInput(e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setAnchorPromptOpen(false); setPendingGroupIds([]); setAnchorAmountInput(''); }}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateMissingAnchorGroup} disabled={creating}>
            Create group
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
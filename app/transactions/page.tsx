'use client'

import React, { useEffect, useMemo, useState } from 'react';
import { getAllTransactions, getAllEntities, createGroupFromTransactionIds } from '../lib/db';
import { parseDateStringToMs } from '../lib/format';
import { Box, Button, Card, CardActionArea, CardContent, Stack, TextField, Typography, Chip, FormControl, InputLabel, Select, MenuItem, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import type { Transaction } from '../lib/types';

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
      const arr = await getAllTransactions();
      arr.sort((a,b) => parseDateStringToMs(b.date) - parseDateStringToMs(a.date));
      setTxs(arr);
      const es = await getAllEntities();
      const m: Record<string,string> = {};
      for (const e of es) m[e.id] = e.name || e.bankName || '__unknown__';
      setEntitiesMap(m);
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
      if (filterEntity && t.entityId !== filterEntity) return false;
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
  }, [txs, filterEntity, filterDateFrom, filterDateTo, filterAmountMin, filterAmountMax]);

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

      <Stack spacing={1}>
        {filtered.map(t => (
          <Card key={t.id} variant="outlined">
            <CardActionArea onClick={() => toggleSelect(t.id)} sx={{ px: 1.25, py: 1.1 }}>
              <CardContent sx={{ p: 1 }}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{formatCents(t.amount)}</Typography>
                    <Typography variant="body2" color="text.secondary">{t.date} {t.entityId ? ` — ${entitiesMap[t.entityId]}` : ''}</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="body2" className="text-sm">{t.description ?? ''}</Typography>
                    {selected[t.id] ? <Chip label="Selected" color="primary" size="small" sx={{ mt: 1 }} /> : null}
                  </Box>
                </Stack>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Stack>

      {selectedIds.length > 0 && (
        <Box sx={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: `calc(var(--bottom-nav-height) + env(safe-area-inset-bottom) + 12px)`, zIndex: 1400 }}>
          <Button variant="contained" color="primary" onClick={handleCreateGroup} sx={{ borderRadius: 999, px: 3, py: 1.25 }}> {creating ? 'Creating...' : 'Create Group Exchange'} </Button>
        </Box>
      )}

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

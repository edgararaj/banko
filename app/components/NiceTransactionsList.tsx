'use client'

import React, { useEffect, useState } from 'react';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import { Box, Button, Card, CardActionArea, CardContent, Stack, Typography } from '@mui/material';
import { getAllBankAccounts, getAllEntities, getAllGroupExpenses, getAllTransactions, resolveTransactionBankAccountId } from '../lib/db';
import type { BankAccount, Transaction } from '../lib/types';
import { formatDateDisplay, parseDateStringToMs } from '../lib/format';

type Props = {
  transactions?: Transaction[];
  entitiesMap?: Record<string, string>;
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  createGroupHandler?: (id: string) => void;
};

function formatCents(cents: number) {
  const sign = cents < 0 ? '-' : '';
  const value = Math.abs(cents);
  const euros = Math.floor(value / 100);
  const rem = Math.abs(value % 100).toString().padStart(2, '0');
  return `${sign}${euros},${rem} €`;
}

export default function NiceTransactionsList(props: Props) {
  const { transactions: txsProp, entitiesMap: emapProp, selectable, selectedIds = [], onSelectionChange, createGroupHandler } = props;
  const [fetchedTxs, setFetchedTxs] = useState<Transaction[] | null>(null);
  const [fetchedEntities, setFetchedEntities] = useState<Record<string, string> | null>(null);
  const [fetchedAccounts, setFetchedAccounts] = useState<Record<string, BankAccount> | null>(null);
  const [groupedTransactionIds, setGroupedTransactionIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      if (!txsProp) {
        const arr = await getAllTransactions();
        arr.sort((a, b) => parseDateStringToMs(b.date) - parseDateStringToMs(a.date));
        setFetchedTxs(arr);
      }
      if (!emapProp) {
        const entities = await getAllEntities();
        const map: Record<string, string> = {};
        for (const entity of entities) map[entity.id] = entity.name;
        setFetchedEntities(map);
      }
      if (!fetchedAccounts) {
        const accounts = await getAllBankAccounts();
        const map: Record<string, BankAccount> = {};
        for (const account of accounts) map[account.id] = account;
        setFetchedAccounts(map);
      }

      const groups = await getAllGroupExpenses();
      const txIds = new Set<string>();
      for (const group of groups) {
        for (const txId of group.expenseTransactionIds || []) txIds.add(txId);
        for (const txId of group.refundTransactionIds || []) txIds.add(txId);
      }
      setGroupedTransactionIds(txIds);
    }

    load();
  }, [txsProp, emapProp, fetchedAccounts]);

  const toggle = (id: string) => {
    if (!onSelectionChange) return;
    const next = selectedIds.includes(id) ? selectedIds.filter((selectedId) => selectedId !== id) : [...selectedIds, id];
    onSelectionChange(next);
  };

  const displayTxs = txsProp ?? fetchedTxs ?? [];
  const displayEntities = emapProp ?? fetchedEntities ?? {};
  const displayAccounts = fetchedAccounts ?? {};
  const sortedDisplayTxs = [...displayTxs].sort((a, b) => parseDateStringToMs(b.date) - parseDateStringToMs(a.date));

  return (
    <Box>
      <Stack spacing={1.25}>
        {sortedDisplayTxs.map((t) => {
          const isOutgoing = t.amount < 0;
          const accountId = resolveTransactionBankAccountId(t);
          const account = accountId ? displayAccounts[accountId] : null;
          const entityName = account ? (displayEntities[account.entityId] ?? 'Unknown') : '';

          return (
            <Card
              key={t.id}
              variant="outlined"
              sx={{
                outline: selectedIds.includes(t.id) ? '2px solid' : undefined,
                outlineColor: selectedIds.includes(t.id) ? 'primary.main' : undefined,
              }}
            >
              <CardActionArea
                onClick={() => (selectable ? toggle(t.id) : undefined)}
                sx={{ px: 1.25, py: 1.1 }}
              >
                <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }} spacing={1.5}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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

                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 600 }} noWrap>
                          {formatDateDisplay(t.date)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {t.description || 'No description'}
                        </Typography>
                        {groupedTransactionIds.has(t.id) ? (
                          <Typography variant="caption" sx={{ display: 'block', mt: 0.25, color: 'text.disabled' }}>
                            In group
                          </Typography>
                        ) : null}
                      </Box>
                    </Box>

                    <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                      <Typography sx={{ fontWeight: 600, color: isOutgoing ? 'error.main' : 'success.main' }}>
                        {formatCents(t.amount)}
                      </Typography>
                      <Typography variant="body2" color={isOutgoing ? 'error.main' : 'success.main'}>
                        {isOutgoing ? 'Outgoing' : 'Incoming'}
                      </Typography>
                    </Box>

                    {selectable ? null : t.amount < 0 && createGroupHandler ? (
                      <Button
                        size="small"
                        variant="contained"
                        onClick={(event) => {
                          event.stopPropagation();
                          createGroupHandler(t.id);
                        }}
                      >
                        Create group
                      </Button>
                    ) : null}
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          );
        })}
      </Stack>

      {selectable ? <Box sx={{ mt: 2 }} /> : null}
    </Box>
  );
}
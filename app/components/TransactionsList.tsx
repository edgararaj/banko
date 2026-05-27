'use client'

import React, { useEffect, useState } from 'react';
import { getAllTransactions, getAllEntities, getAllBankAccounts, resolveTransactionBankAccountId } from '../lib/db';
import { formatDateDisplay, parseDateStringToMs } from '../lib/format';
import type { BankAccount, Transaction } from '../lib/types';
import { Box, Button, Card, CardActionArea, CardContent, Checkbox, Stack, Typography } from '@mui/material';

type Props = {
  transactions?: Transaction[];
  entitiesMap?: Record<string,string>;
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  createGroupHandler?: (id: string) => void;
};

function formatCents(cents: number) {
  const sign = cents < 0 ? '-' : '';
  const a = Math.abs(cents);
  const euros = Math.floor(a / 100);
  const rem = Math.abs(a % 100).toString().padStart(2, '0');
  return `${sign}${euros},${rem} €`;
}

export default function TransactionsList(props: Props) {
  // ensure dark-mode container class
  const { transactions: txsProp, entitiesMap: emapProp, selectable, selectedIds = [], onSelectionChange, createGroupHandler } = props;
  const [fetchedTxs, setFetchedTxs] = useState<Transaction[] | null>(null);
  const [fetchedEntities, setFetchedEntities] = useState<Record<string,string> | null>(null);
  const [fetchedAccounts, setFetchedAccounts] = useState<Record<string, BankAccount> | null>(null);

  useEffect(() => {
    async function load() {
      if (!txsProp) {
        const arr = await getAllTransactions();
        arr.sort((a,b) => parseDateStringToMs(b.date) - parseDateStringToMs(a.date));
        setFetchedTxs(arr);
      }
      if (!emapProp) {
        const es = await getAllEntities();
        const m: Record<string,string> = {};
        for (const e of es) m[e.id] = e.name;
        setFetchedEntities(m);
      }
      if (!fetchedAccounts) {
        const accounts = await getAllBankAccounts();
        const map: Record<string, BankAccount> = {};
        for (const account of accounts) map[account.id] = account;
        setFetchedAccounts(map);
      }
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

  return (
    <Box>
      <Stack spacing={1.25}>
        {displayTxs.map((t) => (
          <Card key={t.id} variant="outlined">
            <CardActionArea
              onClick={() => (selectable ? toggle(t.id) : undefined)}
              sx={{ px: 1.25, py: 1.1 }}
            >
              <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }} spacing={1.5}>
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {formatDateDisplay(t.date)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {(() => {
                        const accountId = resolveTransactionBankAccountId(t);
                        const account = accountId ? displayAccounts[accountId] : undefined;
                        const entityName = account ? (displayEntities[account.entityId] ?? '__unknown__') : '__unknown__';
                        return account ? `${entityName} — ${account.name}` : entityName;
                      })()}
                    </Typography>
                  </Box>

                  <Box sx={{ textAlign: 'right', flex: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {formatCents(t.amount)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t.description ?? ''}
                    </Typography>
                  </Box>

                  {selectable ? (
                    <Checkbox checked={selectedIds.includes(t.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggle(t.id)} />
                  ) : t.amount < 0 && createGroupHandler ? (
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
        ))}
      </Stack>

      {selectable ? <Box sx={{ mt: 2 }} /> : null}
    </Box>
  );
}

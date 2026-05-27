'use client'

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Box, Button, Card, CardContent, Divider, Stack, TextField, Typography } from '@mui/material';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import { getAllEntities, getAllTransactions, updateEntity } from '../../lib/db';
import type { Entity, Transaction } from '../../lib/types';
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
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [nameInput, setNameInput] = useState('');

  useEffect(() => {
    async function load() {
      const [allEntities, allTransactions] = await Promise.all([getAllEntities(), getAllTransactions()]);
      const currentEntity = allEntities.find((item) => item.id === entityId) ?? null;
      const relevantTransactions = allTransactions
        .filter((transaction) => transaction.entityId === entityId)
        .sort((a, b) => parseDateStringToMs(b.date) - parseDateStringToMs(a.date));

      setEntity(currentEntity);
      setTransactions(relevantTransactions);
      setNameInput(currentEntity ? (currentEntity.name || currentEntity.bankName || '') : '');
    }
    load();
  }, [entityId]);

  const incoming = useMemo(() => transactions.filter((transaction) => transaction.amount > 0), [transactions]);
  const outgoing = useMemo(() => transactions.filter((transaction) => transaction.amount < 0), [transactions]);

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
      const trimmedName = nameInput.trim();
      const updatedEntity = {
        ...entity,
        name: trimmedName || entity.name || entity.bankName,
      };
      await updateEntity(updatedEntity);
      setEntity(updatedEntity);
      router.push('/entities');
    } catch (error) {
      console.error(error);
      alert('Save failed');
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
              <Typography variant="body2" color="text.secondary">Bank name</Typography>
              <Typography sx={{ fontWeight: 600 }}>{entity.bankName}</Typography>
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
        <Button variant="outlined" onClick={handleSave}>Save</Button>
        <Button variant="contained" color="success" onClick={() => router.push('/entities')}>Back</Button>
      </Stack>

      <Typography variant="h6" sx={{ mb: 1 }}>Transactions</Typography>
      <Stack spacing={1.25}>
        {transactions.length === 0 ? (
          <Card variant="outlined">
            <CardContent>
              <Typography color="text.secondary">No transactions linked to this entity.</Typography>
            </CardContent>
          </Card>
        ) : (
          transactions.map((transaction, index) => {
            const isOutgoing = transaction.amount < 0;
            return (
              <React.Fragment key={transaction.id}>
                <Card variant="outlined">
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: '50%', bgcolor: isOutgoing ? 'error.light' : 'success.light', color: isOutgoing ? 'error.dark' : 'success.dark' }}>
                      {isOutgoing ? <ArrowDownwardRoundedIcon /> : <ArrowUpwardRoundedIcon />}
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography sx={{ fontWeight: 600 }} noWrap>
                        {transaction.date}
                      </Typography>
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
          })
        )}
      </Stack>
    </Box>
  );
}

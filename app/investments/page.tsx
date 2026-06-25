'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import { addInvestmentIfNotExists, getAllInvestments } from '../lib/db';
import type { Investment } from '../lib/types';
import { parseDateStringToMs } from '../lib/format';

function formatCents(cents: number) {
  const sign = cents < 0 ? '-' : '';
  const value = Math.abs(cents);
  const euros = Math.floor(value / 100);
  const rem = Math.abs(value % 100).toString().padStart(2, '0');
  return `${sign}${euros},${rem} €`;
}

function investmentGainLoss(investment: Investment) {
  return investment.todayValue - investment.initialValue - investment.additionalTaxes;
}

function parseCentsInput(input: string) {
  const cleaned = input.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned || '0');
  return Math.round((Number.isFinite(parsed) ? parsed : 0) * 100);
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function InvestmentsPage() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newInvestment, setNewInvestment] = useState({
    name: '',
    ticker: '',
    date: todayIsoDate(),
    initialValue: '',
    todayValue: '',
    additionalTaxes: '0.00',
  });

  const loadInvestments = useCallback(async () => {
    const data = await getAllInvestments();
    data.sort((a: Investment, b: Investment) => parseDateStringToMs(b.date) - parseDateStringToMs(a.date));
    setInvestments(data);
  }, []);

  useEffect(() => {
    loadInvestments();
  }, [loadInvestments]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return investments;
    return investments.filter((investment) => {
      const haystack = `${investment.name} ${investment.ticker}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [investments, search]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, investment) => {
        acc.initialValue += investment.initialValue + investment.additionalTaxes;
        acc.todayValue += investment.todayValue;
        return acc;
      },
      { initialValue: 0, todayValue: 0 }
    );
  }, [investments]);

  const handleCreateInvestment = async () => {
    if (!newInvestment.name.trim() || !newInvestment.ticker.trim()) return;

    setCreating(true);
    try {
      await addInvestmentIfNotExists({
        id: crypto.randomUUID(),
        name: newInvestment.name.trim(),
        ticker: newInvestment.ticker.trim(),
        date: newInvestment.date,
        initialValue: parseCentsInput(newInvestment.initialValue),
        todayValue: parseCentsInput(newInvestment.todayValue),
        additionalTaxes: parseCentsInput(newInvestment.additionalTaxes),
      });
      await loadInvestments();
      setNewInvestment({
        name: '',
        ticker: '',
        date: todayIsoDate(),
        initialValue: '',
        todayValue: '',
        additionalTaxes: '0.00',
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>Investments</Typography>

      <Stack spacing={2} sx={{ mb: 2 }}>
        <Card variant="outlined">
          <CardContent>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" color="text.secondary">Total invested</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>{formatCents(totals.initialValue)}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">Total today</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>{formatCents(totals.todayValue)}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">Total gain / loss</Typography>
                <Typography
                  variant="h6"
                  sx={{ fontWeight: 700, color: totals.todayValue - totals.initialValue >= 0 ? 'success.main' : 'error.main' }}
                >
                  {formatCents(totals.todayValue - totals.initialValue)}
                </Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Stack spacing={1.5}>
              <Typography variant="h6">Add investment</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField
                  fullWidth
                  label="Name"
                  value={newInvestment.name}
                  onChange={(event) => setNewInvestment((current) => ({ ...current, name: event.target.value }))}
                />
                <TextField
                  fullWidth
                  label="Ticker"
                  value={newInvestment.ticker}
                  onChange={(event) => setNewInvestment((current) => ({ ...current, ticker: event.target.value.toUpperCase() }))}
                />
                <TextField
                  type="date"
                  label="Date"
                  value={newInvestment.date}
                  onChange={(event) => setNewInvestment((current) => ({ ...current, date: event.target.value }))}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ minWidth: 180 }}
                />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField
                  fullWidth
                  label="Initial value"
                  value={newInvestment.initialValue}
                  onChange={(event) => setNewInvestment((current) => ({ ...current, initialValue: event.target.value }))}
                  inputMode="decimal"
                  placeholder="0.00"
                />
                <TextField
                  fullWidth
                  label="Today value"
                  value={newInvestment.todayValue}
                  onChange={(event) => setNewInvestment((current) => ({ ...current, todayValue: event.target.value }))}
                  inputMode="decimal"
                  placeholder="0.00"
                />
                <TextField
                  fullWidth
                  label="Additional taxes"
                  value={newInvestment.additionalTaxes}
                  onChange={(event) => setNewInvestment((current) => ({ ...current, additionalTaxes: event.target.value }))}
                  inputMode="decimal"
                  placeholder="0.00"
                />
              </Stack>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="contained" onClick={handleCreateInvestment} disabled={creating}>
                  {creating ? 'Saving...' : 'Save investment'}
                </Button>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        <TextField
          fullWidth
          label="Search investments"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or ticker"
        />

        <Stack spacing={1.25}>
          {filtered.map((investment) => {
            const gainLoss = investmentGainLoss(investment);
            return (
              <Link
                key={investment.id}
                href={`/investments/${investment.id}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <Card variant="outlined">
                  <CardContent>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }} spacing={2}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 700 }} noWrap>
                        {investment.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {investment.ticker} • {investment.date}
                      </Typography>
                    </Box>

                    <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                      <Typography variant="body2" color="text.secondary">Gain / loss</Typography>
                      <Typography sx={{ fontWeight: 700, color: gainLoss >= 0 ? 'success.main' : 'error.main' }}>
                        {formatCents(gainLoss)}
                      </Typography>
                    </Box>
                  </Stack>

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="caption" color="text.secondary">Initial value</Typography>
                      <Typography sx={{ fontWeight: 600 }}>{formatCents(investment.initialValue)}</Typography>
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="caption" color="text.secondary">Today value</Typography>
                      <Typography sx={{ fontWeight: 600 }}>{formatCents(investment.todayValue)}</Typography>
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="caption" color="text.secondary">Additional taxes</Typography>
                      <Typography sx={{ fontWeight: 600 }}>{formatCents(investment.additionalTaxes)}</Typography>
                    </Box>
                  </Stack>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
          {filtered.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No investments found.</Typography>
          ) : null}
        </Stack>
      </Stack>
    </Box>
  );
}
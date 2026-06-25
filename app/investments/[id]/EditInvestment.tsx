'use client'

import React, { useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import { getInvestmentById, updateInvestment, deleteInvestment } from '../../lib/db';
import type { Investment } from '../../lib/types';
import { useRouter } from 'next/navigation';
import { parseDateStringToMs } from '../../lib/format';

function formatCents(cents: number) {
  const sign = cents < 0 ? '-' : '';
  const value = Math.abs(cents);
  const euros = Math.floor(value / 100);
  const rem = Math.abs(value % 100).toString().padStart(2, '0');
  return `${sign}${euros},${rem} €`;
}

function parseCentsInput(input: string) {
  const cleaned = input.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned || '0');
  return Math.round((Number.isFinite(parsed) ? parsed : 0) * 100);
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function EditInvestment({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [investment, setInvestment] = useState<Investment | null>(null);
  const [form, setForm] = useState({
    name: '',
    ticker: '',
    date: todayIsoDate(),
    initialValue: '',
    todayValue: '',
    additionalTaxes: '0.00',
  });

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getInvestmentById(id).then((found) => {
      if (!mounted) return;
      if (!found) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setInvestment(found);
      setForm({
        name: found.name,
        ticker: found.ticker,
        date: found.date || todayIsoDate(),
        initialValue: (found.initialValue / 100).toFixed(2),
        todayValue: (found.todayValue / 100).toFixed(2),
        additionalTaxes: (found.additionalTaxes / 100).toFixed(2),
      });
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [id]);

  const handleSave = async () => {
    if (!investment) return;
    setSaving(true);
    try {
      await updateInvestment({
        ...investment,
        name: form.name.trim(),
        ticker: form.ticker.trim(),
        date: form.date,
        initialValue: parseCentsInput(form.initialValue),
        todayValue: parseCentsInput(form.todayValue),
        additionalTaxes: parseCentsInput(form.additionalTaxes),
      });
      router.push('/investments');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!investment) return;
    if (!confirm('Delete this investment? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await deleteInvestment(investment.id);
      router.push('/investments');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <Box sx={{ p: 2 }}><Typography>Loading…</Typography></Box>;
  if (notFound) return <Box sx={{ p: 2 }}><Typography>Investment not found.</Typography></Box>;

  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" spacing={1.5} sx={{ mb: 2, alignItems: 'center' }}>
        <Button variant="outlined" size="small" onClick={() => { router.push('/group-expenses'); }}>Back</Button>
          <Typography variant="h5" sx={{ mb: 2 }}>Edit Investment</Typography>
      </Stack>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1.5}>
            <TextField
              fullWidth
              label="Name"
              value={form.name}
              onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
            />
            <TextField
              fullWidth
              label="Ticker"
              value={form.ticker}
              onChange={(e) => setForm((c) => ({ ...c, ticker: e.target.value.toUpperCase() }))}
            />
            <TextField
              type="date"
              label="Date"
              value={form.date}
              onChange={(e) => setForm((c) => ({ ...c, date: e.target.value }))}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ minWidth: 180 }}
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField
                fullWidth
                label="Initial value"
                value={form.initialValue}
                onChange={(e) => setForm((c) => ({ ...c, initialValue: e.target.value }))}
                inputMode="decimal"
                placeholder="0.00"
              />
              <TextField
                fullWidth
                label="Today value"
                value={form.todayValue}
                onChange={(e) => setForm((c) => ({ ...c, todayValue: e.target.value }))}
                inputMode="decimal"
                placeholder="0.00"
              />
              <TextField
                fullWidth
                label="Additional taxes"
                value={form.additionalTaxes}
                onChange={(e) => setForm((c) => ({ ...c, additionalTaxes: e.target.value }))}
                inputMode="decimal"
                placeholder="0.00"
              />
            </Stack>

            <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
              <Button variant="outlined" onClick={() => router.push('/investments')}>Cancel</Button>
              <Button color="error" variant="outlined" onClick={handleDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</Button>
              <Button variant="contained" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

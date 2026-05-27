'use client'

import React, { useState } from 'react';
import { addEntityIfNotExists, addTransactionIfNotExists } from '../lib/db';
import { inferGroupExpenses } from '../lib/inference';
import type { Transaction as Tx } from '../lib/types';
import { Box, Button, Stack, Typography } from '@mui/material';

function parseCSV(content: string): Record<string,string>[] {
  // Minimal RFC4180-ish parser: handles quoted fields and simple commas
  const rows: Record<string,string>[] = [];
  const lines: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    cur += ch;
    if (ch === '"') inQuotes = !inQuotes;
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      lines.push(cur.trim());
      cur = '';
      // skip possible \n after \r
      if (content[i+1] === '\n') { i++; }
    }
  }
  if (cur.trim().length > 0) lines.push(cur.trim());
  if (lines.length === 0) return [];
  // split header
  const headerLine = lines.shift()!;
  const headers = splitCSVLine(headerLine).map(h => h.trim().toLowerCase());
  for (const l of lines) {
    if (!l) continue;
    const cols = splitCSVLine(l);
    const obj: Record<string,string> = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = cols[i] ?? '';
    }
    rows.push(obj);
  }
  return rows;
}

function splitCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function parseAmountToCents(raw: string): number {
  if (!raw) return 0;
  let s = raw.replace(/€/g,'').trim();
  s = s.replace(/\s+/g, '');
  // if both '.' and ',' present, assume '.' thousands and ',' decimal
  if (s.indexOf('.') !== -1 && s.indexOf(',') !== -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.indexOf(',') !== -1 && s.indexOf('.') === -1) {
    s = s.replace(',', '.');
  }
  // remove any non number except . and -
  s = s.replace(/[^0-9.\-]/g, '');
  const f = parseFloat(s || '0');
  return Math.round(f * 100);
}

export default function CSVImport() {
  const [status, setStatus] = useState<string>('');
  const [selectedFileName, setSelectedFileName] = useState<string>('');

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFileName(file.name);
    setStatus('Reading file...');
    const text = await file.text();
    setStatus('Parsing CSV...');

    // Detect bank export (Portuguese format with 'Data mov.') and parse accordingly
    let rows: Record<string,string>[] = [];
    const lower = text.toLowerCase();
    if (lower.includes('data mov')) {
      const allLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      let headerIdx = -1;
      for (let i = 0; i < allLines.length; i++) {
        if (allLines[i].toLowerCase().includes('data mov')) { headerIdx = i; break; }
      }
      if (headerIdx >= 0) {
        const headerLine = allLines[headerIdx];
        const headers = headerLine.split(';').map(h => h.trim().toLowerCase());
        for (let i = headerIdx + 1; i < allLines.length; i++) {
          const line = allLines[i];
          const cols = line.split(';');
          if (cols.length < 4) continue; // skip non-data lines
          const obj: Record<string,string> = {};
          for (let j = 0; j < headers.length; j++) {
            obj[headers[j]] = (cols[j] ?? '').trim();
          }
          rows.push(obj);
        }
      } else {
        rows = parseCSV(text);
      }
    } else {
      rows = parseCSV(text);
    }

    setStatus(`Found ${rows.length} rows`);
    let inserted = 0;
    let skipped = 0;
    for (const r of rows) {
      const keys = Object.keys(r);
      const get = (variants: string[]) => {
        for (const k of keys) {
          for (const v of variants) {
            if (k.includes(v)) return r[k];
          }
        }
        return '';
      };

      // include Portuguese header variants
      const dateRaw = get(['date', 'data mov', 'data mov.', 'data-valor', 'data-valor', 'data']);
      const valueDateRaw = get(['value', 'valor', 'value date', 'data-valor']);
      const description = get(['description', 'descr', 'descrição', 'descricao', 'descricao/resumo', 'payee', 'narrative']) || '';
      const location = get(['location', 'local', 'lugar']) || '';
      // Prefer the explicit "montante" column commonly present in Portuguese exports
      let amountRaw = '';
      if (r['montante'] !== undefined) amountRaw = r['montante'];
      else if (r['montante (eur)'] !== undefined) amountRaw = r['montante (eur)'];
      else amountRaw = get(['amount', 'montante', 'valor', 'amount (eur)']) || get(['credit', 'debit']) || '';
      const bankName = get(['bank', 'counterparty', 'counter-party', 'payee', 'mandate']) || description || '';

      const date = dateRaw;
      const valueDate = valueDateRaw;
      const amount = parseAmountToCents(amountRaw);

      const txn: Tx = {
        id: crypto.randomUUID(),
        date,
        valueDate,
        description: description || null,
        location: location || null,
        amount,
        entityId: null,
      };
      try {
        const entity = await addEntityIfNotExists(bankName || 'unknown');
        txn.entityId = entity.id;
        const res = await addTransactionIfNotExists(txn);
        if (res.id === txn.id) inserted++; else skipped++;
      } catch (err) {
        console.error('import error', err);
      }
    }

    setStatus(`Import finished — inserted: ${inserted}, skipped: ${skipped}`);

    // Run group inference automatically per spec (no confirmation)
    try {
      setStatus(s => s + ' — running group inference...');
      const created = await inferGroupExpenses();
      setStatus(`Import finished — inserted: ${inserted}, skipped: ${skipped}. Group expenses created: ${created}`);
    } catch (err) {
      console.error('inference error', err);
      setStatus(`Import finished — inserted: ${inserted}, skipped: ${skipped}. Inference failed`);
    }
  }

  return (
    <Box sx={{ width: '100%', minWidth: 0, overflow: 'hidden' }}>
      <Stack spacing={1.5} sx={{ width: '100%', minWidth: 0 }}>
        <Box sx={{ width: '100%', minWidth: 0 }}>
          <Button component="label" variant="contained" sx={{ justifyContent: 'flex-start' }}>
            {selectedFileName || 'Choose CSV file'}
            <input hidden type="file" accept="text/csv" onChange={handleFile} />
          </Button>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          {status}
        </Typography>
      </Stack>
    </Box>
  );
}

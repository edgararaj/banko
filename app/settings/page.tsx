'use client'

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Button, Card, CardContent, Divider, Stack, Typography, IconButton, Tooltip } from '@mui/material';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import { useAppColorMode } from '../components/AppThemeProvider';
import { exportDatabaseAsJson, importDatabaseFromJson, downloadJson, readFileAsText } from '../lib/db-serialization';

export default function SettingsPage() {
  const router = useRouter();
  const { mode, toggleMode } = useAppColorMode();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const jsonString = await exportDatabaseAsJson();
      const timestamp = new Date().toISOString().slice(0, 10);
      downloadJson(jsonString, `banko-backup-${timestamp}.json`);
    } catch (error) {
      console.error(error);
      alert('Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      const jsonString = await readFileAsText(file);
      await importDatabaseFromJson(jsonString);
      alert('Database imported successfully. Please refresh the page to see changes.');
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Import failed';
      alert(`Import failed: ${message}`);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" spacing={1.5} sx={{ mb: 2, alignItems: 'center' }}>
        <Button variant="outlined" size="small" onClick={() => router.back()}>Back</Button>
        <Typography variant="h5" component="h1">Settings</Typography>
      </Stack>

      <Stack spacing={2}>
        {/* Theme Settings */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1.5 }}>Appearance</Typography>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">Color mode:</Typography>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                <Tooltip title="Light mode">
                  <IconButton
                    size="small"
                    onClick={toggleMode}
                    sx={{
                      bgcolor: mode === 'light' ? 'action.selected' : 'transparent',
                      color: mode === 'light' ? 'primary.main' : 'text.secondary',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <LightModeRoundedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Dark mode">
                  <IconButton
                    size="small"
                    onClick={toggleMode}
                    sx={{
                      bgcolor: mode === 'dark' ? 'action.selected' : 'transparent',
                      color: mode === 'dark' ? 'primary.main' : 'text.secondary',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <DarkModeRoundedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
              <Typography variant="body2" sx={{ ml: 'auto' }}>
                {mode === 'light' ? 'Light' : 'Dark'} mode
              </Typography>
            </Stack>
          </CardContent>
        </Card>

        <Divider />

        {/* Database Settings */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1.5 }}>Database</Typography>
            <Stack spacing={1.25}>
              <Typography variant="body2" color="text.secondary">
                Export or import your entire database as a JSON file. Useful for backing up data or transferring between browsers.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                <Button
                  variant="contained"
                  onClick={handleExport}
                  disabled={isExporting}
                >
                  {isExporting ? 'Exporting...' : 'Export Database'}
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleImportClick}
                  disabled={isImporting}
                >
                  {isImporting ? 'Importing...' : 'Import Database'}
                </Button>
              </Stack>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}

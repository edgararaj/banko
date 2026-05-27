'use client'

import { usePathname } from 'next/navigation';
import React from 'react';
import { BottomNavigation, BottomNavigationAction, Box, IconButton, Paper, Tooltip } from '@mui/material';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import HubRoundedIcon from '@mui/icons-material/HubRounded';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import { useRouter } from 'next/navigation';
import { useAppColorMode } from './AppThemeProvider';

const items = [
  { href: '/', label: 'Home', icon: <HomeRoundedIcon fontSize="small" /> },
  { href: '/transactions', label: 'Txs', icon: <ReceiptLongRoundedIcon fontSize="small" /> },
  { href: '/entities', label: 'Entities', icon: <HubRoundedIcon fontSize="small" /> },
  { href: '/group-expenses', label: 'Groups', icon: <GroupsRoundedIcon fontSize="small" /> },
];

export default function BottomNav() {
  const path = usePathname();
  const router = useRouter();
  const { mode, toggleMode } = useAppColorMode();
  const selectedIndex = items.findIndex((item) => (item.href === '/' ? path === '/' : path.startsWith(item.href)));

  return (
    <Paper
      elevation={0}
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        pb: 'env(safe-area-inset-bottom)',
        bgcolor: (theme) =>
          theme.palette.mode === 'dark' ? 'rgba(14, 22, 40, 1)' : 'rgba(255, 255, 255, 1)',
        borderTop: (theme) => `1px solid ${theme.palette.divider}`,
        zIndex: (theme) => theme.zIndex.appBar,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <BottomNavigation
          showLabels
          value={selectedIndex < 0 ? 0 : selectedIndex}
          onChange={(_, nextValue) => {
            const target = items[nextValue];
            if (target && target.href !== path) router.push(target.href);
          }}
          sx={{
            flex: 1,
            minHeight: 66,
            bgcolor: 'transparent',
            '& .MuiBottomNavigationAction-root': {
              minWidth: 62,
              maxWidth: 'none',
              py: 0.75,
            },
            '& .MuiBottomNavigationAction-label': {
              fontSize: 12,
              lineHeight: 1.1,
            },
          }}
        >
          {items.map((it) => (
            <BottomNavigationAction key={it.href} label={it.label} icon={it.icon} />
          ))}
        </BottomNavigation>
        <Box
          sx={{
            minHeight: 66,
            px: 1,
            display: 'flex',
            alignItems: 'center',
            borderLeft: (theme) => `1px solid ${theme.palette.divider}`,
            bgcolor: 'transparent',
          }}
        >
          <Tooltip title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            <IconButton
              aria-label="Toggle color mode"
              onClick={toggleMode}
              sx={{
                width: 40,
                height: 40,
                color: 'text.secondary',
                bgcolor: 'transparent',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              {mode === 'dark' ? <LightModeRoundedIcon /> : <DarkModeRoundedIcon />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    </Paper>
  );
}

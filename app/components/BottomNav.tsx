'use client'

import { usePathname } from 'next/navigation';
import { BottomNavigation, BottomNavigationAction, Paper } from '@mui/material';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import HubRoundedIcon from '@mui/icons-material/HubRounded';
import { useRouter } from 'next/navigation';

const items = [
  { href: '/', label: 'Home', icon: <HomeRoundedIcon fontSize="small" /> },
  { href: '/transactions', label: 'Txs', icon: <ReceiptLongRoundedIcon fontSize="small" /> },
  { href: '/entities', label: 'Entities', icon: <HubRoundedIcon fontSize="small" /> },
  { href: '/group-expenses', label: 'Groups', icon: <GroupsRoundedIcon fontSize="small" /> },
];

export default function BottomNav() {
  const path = usePathname();
  const router = useRouter();
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
      <BottomNavigation
        showLabels
        value={selectedIndex < 0 ? 0 : selectedIndex}
        onChange={(_, nextValue) => {
          const target = items[nextValue];
          if (target && target.href !== path) router.push(target.href);
        }}
        sx={{
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
    </Paper>
  );
}

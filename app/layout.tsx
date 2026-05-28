import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import BottomNav from './components/BottomNav';
import AppThemeProvider from './components/AppThemeProvider';
import { Box, Typography, IconButton } from "@mui/material";
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import Link from 'next/link';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Banko",
  description: "Mobile-first personal finance and group expenses tracker",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f7fb' },
    { media: '(prefers-color-scheme: dark)', color: '#070d1a' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppThemeProvider>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2 }}>
            <Typography variant="h3"><b>Banko</b></Typography>
            <Link href="/settings" style={{ textDecoration: 'none' }}>
              <IconButton
                aria-label="Settings"
                sx={{
                  color: 'text.secondary',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <SettingsRoundedIcon />
              </IconButton>
            </Link>
          </Box>
          <div className="flex-1">
            {children}
          </div>
          <BottomNav />
        </AppThemeProvider>
      </body>
    </html>
  );
}

'use client'

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';

export default function BottomNav() {
  const path = usePathname();
  const items = [
    { href: '/', label: 'Home', icon: HomeIcon },
    { href: '/transactions', label: 'Txs', icon: ListIcon },
    { href: '/entities', label: 'Entities', icon: UsersIcon },
    { href: '/group-expenses', label: 'Groups', icon: GroupIcon },
  ];

  return (
    <nav className="fixed left-1/2 -translate-x-1/2 bottom-4 z-50">
      <div className="bg-[#0b1221]/95 backdrop-blur rounded-full px-4 py-2 shadow-lg flex gap-6 items-center text-white">
        {items.map(it => (
          <Link key={it.href} href={it.href} className={`flex flex-col items-center text-sm ${path === it.href ? 'text-blue-600' : 'text-zinc-700'}`}>
            <span className="w-6 h-6">{React.createElement(it.icon)}</span>
            <span className="text-xs">{it.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 11.5L12 4l9 7.5v6a1 1 0 0 1-1 1h-5v-5H9v5H4a1 1 0 0 1-1-1v-6z" />
    </svg>
  );
}
function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function GroupIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zM6 21v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1" />
    </svg>
  );
}

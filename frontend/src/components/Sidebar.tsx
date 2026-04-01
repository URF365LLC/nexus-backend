'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Target,
  Search,
  Activity,
  Shield,
  Sparkles,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[var(--sidebar-w)] glass border-r-0 z-50 p-6 flex flex-col">
      <div className="flex items-center gap-3 mb-10 px-2">
        <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
          <Zap size={18} className="text-primary fill-primary" />
        </div>
        <span className="text-xl font-bold tracking-tighter text-white">NEXUS</span>
      </div>

      <nav className="space-y-1 flex-1">
        <NavItem href="/" icon={<LayoutDashboard size={18} />} label="Operator HUD" active={pathname === '/'} />
        <NavItem href="/campaigns" icon={<Target size={18} />} label="Campaign Matrix" active={pathname === '/campaigns'} />
        <NavItem href="/keywords" icon={<Search size={18} />} label="Keyword Alpha" active={pathname === '/keywords'} />
        <NavItem href="/reports" icon={<Sparkles size={18} />} label="Synthesis" active={pathname === '/reports'} />
        <NavItem href="/compliance" icon={<Shield size={18} />} label="Compliance" active={pathname === '/compliance'} />
        <NavItem href="/sync-terminal" icon={<Activity size={18} />} label="Sync Terminal" active={pathname === '/sync-terminal'} />
      </nav>

      <div className="mt-auto pt-6 border-t border-white/5 space-y-4">
         <div className="px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/5">
            <div className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-1">System Health</div>
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              ALPHA LINK ACTIVE
            </div>
         </div>
      </div>
    </aside>
  );
}

function NavItem({ 
  href, 
  icon, 
  label, 
  active = false,
  disabled = false
}: { 
  href: string; 
  icon: React.ReactNode; 
  label: string; 
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Link 
      href={disabled ? '#' : href} 
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-bold text-[11px] uppercase tracking-widest",
        active 
          ? "bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_-5px_var(--primary-glow)]" 
          : "text-gray-500 hover:text-white hover:bg-white/[0.03]",
        disabled && "opacity-50 cursor-not-allowed pointer-events-none"
      )}
    >
      <span className={cn(active ? "text-primary" : "text-gray-600")}>{icon}</span>
      {label}
    </Link>
  );
}

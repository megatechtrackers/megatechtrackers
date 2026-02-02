'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Home, Settings, Radio, Menu, X, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkingTimezone } from '@/lib/TimezoneContext';
import { WORKING_TIMEZONES } from '@/lib/timeUtils';

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { workingTimezone, setWorkingTimezone } = useWorkingTimezone();

  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/admin/devices', label: 'Device Editor', icon: Settings },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-900 border-b border-slate-800 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Logo */}
          <div 
            className="flex items-center gap-2 sm:gap-3 cursor-pointer"
            onClick={() => router.push('/')}
          >
            <div className="p-1.5 sm:p-2 bg-slate-800 rounded-lg shadow-sm border border-slate-700">
              <Radio className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <div className="font-bold text-white text-sm">Device Service</div>
            </div>
          </div>

          {/* Working timezone: for managing devices in another region */}
          <div className="hidden sm:flex items-center gap-2">
            <span title="Working timezone for device times">
              <Globe className="w-4 h-4 text-slate-400" />
            </span>
            <select
              value={workingTimezone}
              onChange={(e) => setWorkingTimezone(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-500 max-w-[160px]"
              title="Use US/Pakistan time when viewing and setting device times"
            >
              {WORKING_TIMEZONES.map((opt) => (
                <option key={opt.value || 'browser'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Desktop Navigation Links */}
          <div className="hidden sm:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.path || 
                (item.path !== '/' && pathname?.startsWith(item.path));
              
              return (
                <button
                  key={item.path}
                  onClick={() => router.push(item.path)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    isActive
                      ? "bg-slate-800 text-white"
                      : "text-slate-300 hover:text-white hover:bg-slate-800"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="sm:hidden p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden bg-slate-800 border-t border-slate-700 shadow-lg">
          <div className="px-4 py-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.path || 
                (item.path !== '/' && pathname?.startsWith(item.path));
              
              return (
                <button
                  key={item.path}
                  onClick={() => {
                    router.push(item.path);
                    setMobileMenuOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium transition-all",
                    isActive
                      ? "bg-slate-700 text-white"
                      : "text-slate-300 hover:text-white hover:bg-slate-700"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}

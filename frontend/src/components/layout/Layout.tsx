import React from 'react';
import Button from '../ui/Button';
import Badge from '../ui/Badge';

interface NavItem {
  id: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  badge?: string;
  section?: string; // group heading (renders a divider + heading when it changes)
}

interface LayoutProps {
  brand: string;
  tagline: string;
  userEmail?: string;
  organizationName?: string;
  onLogout?: () => void;
  onBrandClick?: () => void;
  navItems?: NavItem[];
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({
  brand,
  tagline,
  userEmail,
  organizationName,
  onLogout,
  onBrandClick,
  navItems = [],
  children,
}) => {
  const initials = userEmail ? userEmail[0].toUpperCase() : 'G';

  // Group items by section
  let lastSection: string | undefined;

  return (
    <div className="flex min-h-screen bg-[#f8f9fb]">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-slate-200/70 bg-white lg:flex lg:flex-col">
        {/* Brand */}
        <button
          type="button"
          onClick={onBrandClick}
          className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4 text-left transition hover:bg-slate-50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
            S
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-slate-900">{brand}</span>
            <span className="block truncate text-[11px] text-slate-400">{tagline}</span>
          </span>
        </button>

        {/* Nav */}
        {navItems.length > 0 && (
          <nav className="flex-1 overflow-y-auto px-3 py-3">
            {navItems.map((item) => {
              const showHeading = item.section && item.section !== lastSection;
              lastSection = item.section;
              return (
                <React.Fragment key={item.id}>
                  {showHeading && (
                    <span className="mb-1.5 mt-4 first:mt-0 block px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {item.section}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={item.onClick}
                    disabled={item.disabled}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-[7px] text-left text-[13px] transition ${
                      item.active
                        ? 'bg-brand-50 font-semibold text-brand-700'
                        : item.disabled
                          ? 'cursor-not-allowed text-slate-300'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                    }`}
                  >
                    <span className="truncate">{item.label}</span>
                    {item.badge && <Badge variant="neutral">{item.badge}</Badge>}
                  </button>
                </React.Fragment>
              );
            })}
          </nav>
        )}

        {/* User chip at bottom */}
        {userEmail && (
          <div className="border-t border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                {initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-slate-800">
                  {userEmail}
                </span>
                <span className="block truncate text-[11px] text-slate-400">
                  {organizationName || 'Personal'}
                </span>
              </span>
              {onLogout && (
                <Button variant="ghost" size="xs" onClick={onLogout}>
                  Log out
                </Button>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-auto">
        {/* Mobile header */}
        <header className="flex items-center justify-between border-b border-slate-200/70 bg-white px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
              S
            </span>
            <span className="text-sm font-semibold text-slate-900">{brand}</span>
          </div>
          {userEmail && onLogout && (
            <Button variant="ghost" size="xs" onClick={onLogout}>
              Log out
            </Button>
          )}
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default Layout;

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Logo } from "@/components/layout/Logo";
import { canManageUsers, roleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";

const Icons = {
  dashboard: (
    <path d="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z" />
  ),
  students: (
    <path d="M16 14a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm0 2c-2.7 0-5 1.3-5 3v2h6v-2c0-1 .4-1.9 1-2.7A8 8 0 0 0 8 16Zm8 0c-3 0-7 1.5-7 4v2h14v-2c0-2.5-4-4-7-4Z" />
  ),
  training: (
    <path d="M12 3 1 9l4 2.2v6L12 21l7-3.8v-6l2-1.1V17h2V9L12 3Zm6.9 6L12 12.7 5.1 9 12 5.3 18.9 9ZM12 18.9l-5-2.7v-3.3l5 2.7 5-2.7v3.3l-5 2.7Z" />
  ),
  users: (
    <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.3 0-8 1.7-8 5v3h16v-3c0-3.3-4.7-5-8-5Z" />
  ),
  batches: <path d="M4 5h16v4H4V5Zm0 6h16v4H4v-4Zm0 6h10v2H4v-2Z" />,
  attendance: (
    <path d="M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7ZM5 9h14v10H5V9Zm5.6 8.6 5-5-1.4-1.4-3.6 3.6-1.6-1.6L7.2 14.6l3.4 3Z" />
  ),
  assessments: (
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 2 4 4h-4V4ZM8 13h8v2H8v-2Zm0 4h8v2H8v-2Zm0-8h3v2H8V9Z" />
  ),
  feedback: (
    <path d="M4 4h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-5 4V5a1 1 0 0 1 1-1Zm3 5v2h10V9H7Zm0 4v2h7v-2H7Z" />
  ),
  passkey: (
    <path d="M14 2a8 8 0 0 0-7.6 10.5L2 17v5h5v-3h3v-3h2.5A8 8 0 1 0 14 2Zm3 6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" />
  ),
  premium: (
    <path d="M12 2 9.2 8.6 2 9.3l5.5 4.7L5.8 21 12 17.3 18.2 21l-1.7-7 5.5-4.7-7.2-.7L12 2Z" />
  ),
};

const NAV = [
  { label: "Dashboard", href: "/", icon: "dashboard" },
  { label: "Premium Analytics", href: "/premium-analytics", icon: "premium" },
  { label: "Batches", href: "/batches", icon: "batches" },
  { label: "Attendance", href: "/attendance", icon: "attendance" },
  { label: "Assessments", href: "/assessments", icon: "assessments" },
  { label: "Feedback", href: "/feedback", icon: "feedback" },
  { label: "Students", href: "/students", icon: "students" },
  { label: "Training", href: "/training", icon: "training" },
  { label: "Users", href: "/users", icon: "users", adminOnly: true },
  { label: "Passkeys", href: "/passkeys", icon: "passkey", adminOnly: true },
];

function NavIcon({ name }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {Icons[name]}
    </svg>
  );
}

export function DashboardShell({ children }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const items = NAV.filter((i) => !i.adminOnly || canManageUsers(user));
  const isActive = (href) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  const current = items.find((i) => isActive(i.href));

  const initials = (user?.name || user?.username || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const SidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center border-b border-border px-5">
        <Logo />
      </div>
      <nav className="flex-1 space-y-1 p-3" aria-label="Dashboard">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              isActive(item.href)
                ? "bg-brand/10 text-brand"
                : "text-foreground/70 hover:bg-surface-2 hover:text-foreground",
            )}
          >
            <NavIcon name={item.icon} />
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{user?.name}</p>
            <p className="truncate text-xs text-muted">
              {roleLabel(user?.role)}
              {user?.department ? ` · ${user.department}` : ""}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setConfirmLogout(true)}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:border-brand/50 hover:text-brand"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 12H4m0 0 3.5-3.5M4 12l3.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh border-r border-border bg-surface lg:block">
        {SidebarContent}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-[260px] border-r border-border bg-surface">
            {SidebarContent}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border text-foreground lg:hidden"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-foreground">
              {current?.label ?? "Dashboard"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand sm:inline">
              {roleLabel(user?.role)}
            </span>
            <ThemeToggle />
          </div>
        </header>

        <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      {confirmLogout && (
        <LogoutConfirm
          onCancel={() => setConfirmLogout(false)}
          onConfirm={() => {
            setConfirmLogout(false);
            logout();
          }}
        />
      )}
    </div>
  );
}

/** "Are you sure?" dialog shown before ending the session. */
function LogoutConfirm({ onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-title"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
    >
      <button aria-label="Cancel" className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-card-hover">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand/10 text-brand">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 12H4m0 0 3.5-3.5M4 12l3.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 id="logout-title" className="mt-4 text-lg font-semibold text-foreground">
          Log out?
        </h2>
        <p className="mt-1 text-sm text-muted">
          You&apos;ll be signed out of this session and returned to the login screen.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}

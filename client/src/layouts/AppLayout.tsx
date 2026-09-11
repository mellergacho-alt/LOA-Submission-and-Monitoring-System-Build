import { useState } from "react";
import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import Breadcrumbs from "../components/Breadcrumbs";
import { MenuIcon } from "../icons/Icons";
import "./AppLayout.css";

interface AppLayoutProps {
  children: ReactNode;
}

// The sidebar becomes an off-canvas drawer below Sidebar.css's mobile
// breakpoint (see .sidebar's @media rule there) — this state/toggle only
// does anything below that width; above it, Sidebar renders exactly as
// before (sticky, always visible), and the hamburger button is hidden by
// CSS (.app-topbar's own @media rule).
export default function AppLayout({ children }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-layout">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <div className="app-layout__content">
        <header className="app-topbar">
          <button
            type="button"
            className="app-topbar__toggle"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <MenuIcon />
          </button>
          <img className="app-topbar__logo" src="/division-logo.png" alt="Division of Guihulngan City logo" />
          <span className="app-topbar__title">LOA System</span>
        </header>
        <main className="app-layout__main">
          <Breadcrumbs />
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card page-header" style={{ padding: "22px 26px" }}>
      <div>
        {eyebrow && <div className="eyebrow" style={{ color: "var(--accent-blue)", fontSize: 12 }}>{eyebrow}</div>}
        <h1 className="heading page-header__title">{title}</h1>
        {subtitle && <div className="page-header__subtitle">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

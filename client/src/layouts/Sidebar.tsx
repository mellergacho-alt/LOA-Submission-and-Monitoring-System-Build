import { useEffect, useRef, useState } from "react";
import type { ComponentType, SVGProps } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import "./Sidebar.css";
import { UploadIcon, ChecklistIcon, LogoutIcon, UserIcon, UsersIcon, ChevronDownIcon, LayersIcon } from "../icons/Icons";
import { useAuth } from "../context/AuthContext";
import { DOCUMENT_TYPES } from "../utils/documentTypes";
import type { Role } from "../types/api";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export interface LinkNavEntry {
  to: string;
  label: string;
  icon: IconComponent;
}

export interface SubmenuNavEntry {
  label: string;
  icon: IconComponent;
  children: { to: string; label: string }[];
}

export type NavEntry = LinkNavEntry | SubmenuNavEntry;

// Shared by every "Submission Form" / "Status of Submission" nav entry below
// -- one document type per page instead of an in-page dropdown, so each role
// gets the same 3 children under whatever base path it uses.
function documentTypeChildren(basePath: string) {
  return DOCUMENT_TYPES.map((d) => ({ to: `${basePath}/${d.slug}`, label: d.label }));
}

export const ADMIN_NAV: NavEntry[] = [
  {
    label: "Administration",
    icon: UsersIcon,
    children: [
      { to: "/school-accounts/school-year-term", label: "School Year & Term" },
      { to: "/school-accounts/accounts", label: "School Admin" },
      { to: "/school-accounts/supervisors", label: "Division Supervisor Account" },
      { to: "/school-accounts/admins", label: "Division Admin Account" },
      { to: "/school-accounts/audit-log", label: "Audit Log" },
    ],
  },
  { label: "Status of Submission from Schools", icon: ChecklistIcon, children: documentTypeChildren("/status") },
];

export const SCHOOL_NAV: NavEntry[] = [
  { to: "/organized-classes", label: "Organized Classes", icon: LayersIcon },
  { to: "/chairmen", label: "Grade Level Chairmen", icon: UsersIcon },
  { label: "Submission Form", icon: UploadIcon, children: documentTypeChildren("/loa-submission") },
  { label: "Status of Submission", icon: ChecklistIcon, children: documentTypeChildren("/status") },
];

// Grade Level Chairman: no School Profile, no chairman management (only the
// main SCHOOL account manages those) — just their scoped submission facility.
export const CHAIRMAN_NAV: NavEntry[] = [
  { label: "Submission Form", icon: UploadIcon, children: documentTypeChildren("/loa-submission") },
  { label: "Status of Submission", icon: ChecklistIcon, children: documentTypeChildren("/status") },
];

// Division Supervisor: read-only, division-wide, scoped by Learning Area
// (not by school/grade like every other role) — a single page (now split by
// Document Type like every other role's submission-facing pages), no School
// Profile, no submission facility of any kind.
export const SUPERVISOR_NAV: NavEntry[] = [
  { label: "Status of Submission from Schools", icon: ChecklistIcon, children: documentTypeChildren("/loa-result") },
];

// Every role's own "Profile" page now lives in the avatar drill-down menu
// (SidebarAccountMenu below), not the main nav list — see PROFILE_LABEL_BY_ROLE.
export const PROFILE_PATH_BY_ROLE: Record<Role, string> = {
  ADMIN: "/admin-profile",
  SCHOOL: "/school-profile",
  GRADE_CHAIRMAN: "/chairman-profile",
  SUPERVISOR: "/supervisor-profile",
};

export const PROFILE_LABEL_BY_ROLE: Record<Role, string> = {
  ADMIN: "Admin Profile",
  SCHOOL: "School Profile",
  GRADE_CHAIRMAN: "Chairman Profile",
  SUPERVISOR: "Supervisor Profile",
};

// Single source of truth for "which nav tree does this role see" — reused by
// Breadcrumbs (utils/breadcrumbs.ts) so the two can't drift apart.
export function navItemsForRole(role: Role | undefined): NavEntry[] {
  if (role === "ADMIN") return ADMIN_NAV;
  if (role === "GRADE_CHAIRMAN") return CHAIRMAN_NAV;
  if (role === "SUPERVISOR") return SUPERVISOR_NAV;
  return SCHOOL_NAV;
}

function SidebarSubmenu({
  entry,
  currentPath,
  onNavigate,
}: {
  entry: SubmenuNavEntry;
  currentPath: string;
  onNavigate: () => void;
}) {
  const isChildActive = entry.children.some((child) => currentPath === child.to || currentPath.startsWith(child.to + "/"));
  // Only the initial route decides whether the submenu starts open — after
  // that, only the user's own clicks toggle it (re-syncing on every route
  // change would make it impossible to collapse while still on a child page).
  const [open, setOpen] = useState(isChildActive);

  return (
    <div className="sidebar__submenu">
      <button
        type="button"
        className={"sidebar__link sidebar__submenu-toggle" + (isChildActive ? " active" : "")}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <entry.icon />
        <span className="sidebar__submenu-label">{entry.label}</span>
        <ChevronDownIcon className={"sidebar__submenu-chevron" + (open ? "" : " collapsed")} />
      </button>
      {open && (
        <div className="sidebar__submenu-list">
          {entry.children.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              className={({ isActive }) => "sidebar__sublink" + (isActive ? " active" : "")}
              onClick={onNavigate}
            >
              {child.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

// Avatar/name/role card, now a click-to-open drill-down (same toggle+chevron
// interaction as SidebarSubmenu above) instead of a static display — opens
// upward, since it sits at the very bottom of the sidebar with no room to
// expand downward without being clipped by the viewport edge. Closes on an
// outside click, same as any standard account menu.
function SidebarAccountMenu({
  initial,
  name,
  roleLabel,
  org,
  profilePath,
  profileLabel,
  onLogout,
  onNavigate,
}: {
  initial: string;
  name: string;
  roleLabel: string;
  org: string;
  profilePath: string;
  profileLabel: string;
  onLogout: () => void;
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="sidebar__account" ref={containerRef}>
      {open && (
        <div className="sidebar__account-menu">
          <NavLink
            to={profilePath}
            className={({ isActive }) => "sidebar__account-menu-link" + (isActive ? " active" : "")}
            onClick={() => {
              setOpen(false);
              onNavigate();
            }}
          >
            <UserIcon /> {profileLabel}
          </NavLink>
          <button
            type="button"
            className="sidebar__account-menu-link sidebar__account-menu-link--danger"
            onClick={() => {
              setOpen(false);
              onNavigate();
              onLogout();
            }}
          >
            <LogoutIcon /> Log Out
          </button>
        </div>
      )}
      <button type="button" className="sidebar__user sidebar__user--button" onClick={() => setOpen((prev) => !prev)} aria-expanded={open}>
        <div className="sidebar__avatar">{initial}</div>
        <div className="sidebar__user-text">
          <div className="sidebar__user-name">{name}</div>
          <div className="sidebar__user-role">{roleLabel}</div>
          <div className="sidebar__user-org">
            <span className="sidebar__dot" />
            {org}
          </div>
        </div>
        <ChevronDownIcon className={"sidebar__account-chevron" + (open ? "" : " collapsed")} />
      </button>
    </div>
  );
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const navItems = navItemsForRole(user?.role);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const initial = user?.name?.trim()?.[0]?.toUpperCase() ?? "?";
  const roleLabel =
    user?.role === "ADMIN"
      ? "Administrator"
      : user?.role === "GRADE_CHAIRMAN"
      ? `Grade Level Chairman${user.gradeNames.length ? ` — ${user.gradeNames.join(", ")}` : ""}`
      : user?.role === "SUPERVISOR"
      ? "Division Supervisor"
      : "School Admin";

  return (
    <aside className={"sidebar" + (isOpen ? " sidebar--open" : "")}>
      <button type="button" className="sidebar__mobile-close" onClick={onClose} aria-label="Close menu">
        ×
      </button>
      <div className="sidebar__brand">
        <img className="sidebar__logo" src="/division-logo.png" alt="Division of Guihulngan City logo" />
        <div className="sidebar__brand-text">
          <span className="sidebar__brand-title">DEPARTMENT OF EDUCATION</span>
          <span className="sidebar__brand-subtitle">DIVISION OF GUIHULNGAN CITY</span>
        </div>
      </div>

      <nav className="sidebar__nav">
        {navItems.map((entry) =>
          "children" in entry ? (
            <SidebarSubmenu key={entry.label} entry={entry} currentPath={location.pathname} onNavigate={onClose} />
          ) : (
            <NavLink
              key={entry.to}
              to={entry.to}
              className={({ isActive }) => "sidebar__link" + (isActive ? " active" : "")}
              onClick={onClose}
            >
              <entry.icon />
              {entry.label}
            </NavLink>
          )
        )}
      </nav>

      <div className="sidebar__footer">
        {user && (
          <SidebarAccountMenu
            initial={initial}
            name={user.name ?? "Guest"}
            roleLabel={roleLabel}
            org={user.schoolName ?? "DEPED"}
            profilePath={PROFILE_PATH_BY_ROLE[user.role]}
            profileLabel={PROFILE_LABEL_BY_ROLE[user.role]}
            onLogout={handleLogout}
            onNavigate={onClose}
          />
        )}
      </div>
    </aside>
  );
}

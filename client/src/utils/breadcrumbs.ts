import type { Role } from "../types/api";
import { navItemsForRole, PROFILE_LABEL_BY_ROLE, PROFILE_PATH_BY_ROLE } from "../layouts/Sidebar";

export interface BreadcrumbItem {
  label: string;
  // Omitted on the last item (the current page) -- rendered as plain text, not a link.
  to?: string;
}

function matchesPath(pathname: string, target: string) {
  return pathname === target || pathname.startsWith(target + "/");
}

// Derives the breadcrumb trail for the current route from the same nav data
// Sidebar.tsx renders, so a submenu rename/reorder can't leave breadcrumbs
// showing a stale label -- there is exactly one place role->nav is defined.
export function getBreadcrumbTrail(pathname: string, role: Role | undefined): BreadcrumbItem[] {
  if (!role) return [];

  const profilePath = PROFILE_PATH_BY_ROLE[role];
  if (matchesPath(pathname, profilePath)) {
    return [{ label: PROFILE_LABEL_BY_ROLE[role] }];
  }

  for (const entry of navItemsForRole(role)) {
    if ("children" in entry) {
      const child = entry.children.find((c) => matchesPath(pathname, c.to));
      if (child) {
        // Clicking the section label jumps to its first child page, same as
        // opening the sidebar submenu and picking the top item.
        return [{ label: entry.label, to: entry.children[0].to }, { label: child.label }];
      }
    } else if (matchesPath(pathname, entry.to)) {
      return [{ label: entry.label }];
    }
  }

  return [];
}

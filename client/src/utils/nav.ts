import type { Role } from "../types/api";

// Where to land a user right after login, or redirect them to if they try a
// route their role can't access — one place so LoginPage and ProtectedRoute
// can't drift out of sync on what each role's "home" page is.
export function landingPathFor(role: Role): string {
  if (role === "ADMIN") return "/school-accounts";
  if (role === "SUPERVISOR") return "/loa-result";
  return "/loa-submission";
}

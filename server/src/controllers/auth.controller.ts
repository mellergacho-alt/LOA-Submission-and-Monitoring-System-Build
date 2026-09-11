import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../prisma";
import { signToken } from "../utils/jwt";
import { logAudit, AUDIT_ACTIONS } from "../utils/auditLog";
import { resolveGradeNames } from "../utils/grades";

// "Sign in with Google" is a second way to *authenticate* an email that
// already has an account here — it never creates one. Every account (any
// of the 4 roles) must still be provisioned the normal way first (Admin
// creating a School/Supervisor/Admin account, or a School creating a
// Chairman) before that email can sign in with Google; an unrecognized
// email is rejected exactly like a bad password, not auto-registered.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const REQUIRED_HOSTED_DOMAIN = "deped.gov.ph";
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

function toUserResponse(
  user: {
    id: number;
    email: string;
    name: string;
    role: "ADMIN" | "SCHOOL" | "GRADE_CHAIRMAN" | "SUPERVISOR";
    schoolId: number | null;
    gradeLevelIds: number[];
    assignedLearningAreas: string[];
    school?: { id: number; schoolName: string; schoolHeadName: string | null } | null;
  },
  gradeNames: string[]
) {
  return {
    id: user.id,
    email: user.email,
    // For SCHOOL accounts, the School Head name (edited in School Profile) is
    // the authoritative displayed identity, not the one-time contact name
    // captured at account creation — falls back to it only until a head name
    // is set. A GRADE_CHAIRMAN is a distinct person, not the school head, so
    // this override only applies to the SCHOOL role.
    name: user.role === "SCHOOL" ? user.school?.schoolHeadName || user.name : user.name,
    role: user.role,
    schoolId: user.schoolId,
    schoolName: user.school?.schoolName ?? null,
    gradeLevelIds: user.gradeLevelIds,
    gradeNames,
    assignedLearningAreas: user.assignedLearningAreas,
  };
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { school: true },
  });

  if (!user) {
    await logAudit({
      action: AUDIT_ACTIONS.LOGIN_FAILURE,
      details: `Attempted login with email "${email.toLowerCase()}" (no such account)`,
    });
    return res.status(401).json({ message: "Invalid email or password" });
  }

  // Admin-set per-account policy (School Admins card) -- rejected before
  // even checking the password, since the point is to stop password login
  // entirely for this account, not just flag a wrong password. A
  // GRADE_CHAIRMAN is additionally rejected if their *school* has the
  // chairmen-wide policy on (School.forceChairmenGoogleSignIn) -- checked
  // live here rather than written onto each chairman row, so it covers a
  // chairman created before or after the policy was turned on with nothing
  // to keep in sync.
  const chairmanBlockedBySchoolPolicy = user.role === "GRADE_CHAIRMAN" && user.school?.forceChairmenGoogleSignIn;
  if (user.forceGoogleSignIn || chairmanBlockedBySchoolPolicy) {
    await logAudit({
      action: AUDIT_ACTIONS.LOGIN_FAILURE,
      actor: { id: user.id, name: user.name, email: user.email, role: user.role },
      details: "Rejected password login — account requires Google Sign-In",
    });
    return res
      .status(403)
      .json({ message: 'This account must sign in with Google. Use "Sign in with DepEd Google Account" instead.' });
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    await logAudit({
      action: AUDIT_ACTIONS.LOGIN_FAILURE,
      actor: { id: user.id, name: user.name, email: user.email, role: user.role },
      details: "Incorrect password",
    });
    return res.status(401).json({ message: "Invalid email or password" });
  }

  await logAudit({
    action: AUDIT_ACTIONS.LOGIN_SUCCESS,
    actor: { id: user.id, name: user.name, email: user.email, role: user.role },
  });

  const gradeNames = await resolveGradeNames(user.gradeLevelIds);
  const token = signToken({ sub: user.id, role: user.role, schoolId: user.schoolId, gradeLevelIds: user.gradeLevelIds });
  res.json({ token, user: toUserResponse(user, gradeNames) });
}

// "Sign in with Google" — the client sends an OAuth2 access token from
// Google's Identity Services *popup* flow (google.accounts.oauth2.initTokenClient),
// not the One Tap / FedCM flow (google.accounts.id.prompt()) tried first —
// One Tap turned out to be too fragile for real users: Chrome's FedCM API
// silently disables itself for a site after a user dismisses the prompt a
// couple of times, with no visible indication why it stopped working
// ("Provider's accounts list is empty" / a 403 from Google's own gsi/status
// endpoint — confirmed live, reproduced by the user, not a guess). The
// classic OAuth popup isn't FedCM-based, so it isn't subject to that
// auto-disable behavior — same tradeoff as any "one login method has hidden
// browser-level footguns" situation: pick the boring, robust one.
//
// This never trusts the access token's claims until two things are true:
// getTokenInfo() confirms Google issued it *for our own Client ID*
// (audience) — not some other app's token being replayed here — and only
// then is it used to fetch the account's email from Google's userinfo
// endpoint, never trusted from anything the client could have supplied
// directly.
export async function googleLogin(req: Request, res: Response) {
  if (!googleClient) {
    return res.status(501).json({ message: "Google Sign-In is not configured on this server" });
  }

  const { accessToken } = req.body as { accessToken?: string };
  if (!accessToken) {
    return res.status(400).json({ message: "accessToken is required" });
  }

  try {
    const tokenInfo = await googleClient.getTokenInfo(accessToken);
    if (tokenInfo.aud !== GOOGLE_CLIENT_ID) {
      return res.status(401).json({ message: "Invalid Google sign-in token" });
    }
  } catch {
    return res.status(401).json({ message: "Invalid Google sign-in token" });
  }

  const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userinfoRes.ok) {
    return res.status(401).json({ message: "Invalid Google sign-in token" });
  }
  const profile = (await userinfoRes.json()) as { email?: string; email_verified?: boolean; hd?: string };

  const email = profile.email;
  if (!email || !profile.email_verified) {
    return res.status(401).json({ message: "Invalid Google sign-in token" });
  }

  // Restricts to DepEd Google Workspace accounts only — a personal Gmail can
  // never reach the account lookup below, regardless of whether its address
  // happens to match a record. `hd` is Google's own hosted-domain claim, set
  // only for Workspace accounts (absent entirely for consumer @gmail.com).
  if (profile.hd !== REQUIRED_HOSTED_DOMAIN) {
    await logAudit({
      action: AUDIT_ACTIONS.LOGIN_FAILURE,
      details: `Attempted Google sign-in with non-DepEd account "${email.toLowerCase()}"`,
    });
    return res.status(403).json({ message: `Only ${REQUIRED_HOSTED_DOMAIN} Google accounts can sign in this way` });
  }

  const normalizedEmail = email.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { school: true },
  });

  if (!user) {
    await logAudit({
      action: AUDIT_ACTIONS.LOGIN_FAILURE,
      details: `Attempted Google sign-in with email "${normalizedEmail}" (no such account)`,
    });
    return res.status(403).json({
      message: "This account has not been added to the system yet. Please contact your administrator.",
    });
  }

  await logAudit({
    action: AUDIT_ACTIONS.LOGIN_SUCCESS,
    actor: { id: user.id, name: user.name, email: user.email, role: user.role },
    details: "Signed in with Google",
  });

  const gradeNames = await resolveGradeNames(user.gradeLevelIds);
  const token = signToken({ sub: user.id, role: user.role, schoolId: user.schoolId, gradeLevelIds: user.gradeLevelIds });
  res.json({ token, user: toUserResponse(user, gradeNames) });
}

export async function me(req: Request, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    include: { school: true },
  });

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const gradeNames = await resolveGradeNames(user.gradeLevelIds);
  res.json({ user: toUserResponse(user, gradeNames) });
}

// Self-service profile edit for ADMIN, SUPERVISOR, and GRADE_CHAIRMAN — the
// three roles with no other entity (like School) tying their name/email to a
// different source of truth. SCHOOL accounts don't use this — their
// name/email are driven by School Profile (schoolHeadName/schoolEmail)
// instead, to keep a single source of truth for that role.
export async function updateProfile(req: Request, res: Response) {
  const { name, email } = req.body as { name?: string; email?: string };

  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({ message: "Name and email are required" });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const conflict = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (conflict && conflict.id !== req.user!.sub) {
    return res.status(409).json({ message: "That email is already used by another account" });
  }

  const user = await prisma.user.update({
    where: { id: req.user!.sub },
    data: { name: name.trim(), email: normalizedEmail },
    include: { school: true },
  });

  const gradeNames = await resolveGradeNames(user.gradeLevelIds);
  res.json({ user: toUserResponse(user, gradeNames) });
}

export async function updatePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "Current and new password are required" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ message: "New password must be at least 6 characters" });
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });
  const matches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!matches) {
    return res.status(401).json({ message: "Current password is incorrect" });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  res.json({ message: "Password updated" });
}

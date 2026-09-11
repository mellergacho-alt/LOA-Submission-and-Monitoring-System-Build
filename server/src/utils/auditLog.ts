import { Request } from "express";
import { Role } from "@prisma/client";
import { prisma } from "../prisma";

// Security-sensitive actions only (logins, account CRUD/password resets
// across all 4 roles, LOA file upload/access/removal) — not every routine
// edit in the system. See CLAUDE.md's "Audit Log" section.
export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILURE: "LOGIN_FAILURE",
  SCHOOL_ACCOUNT_CREATE: "SCHOOL_ACCOUNT_CREATE",
  SCHOOL_ACCOUNT_UPDATE: "SCHOOL_ACCOUNT_UPDATE",
  SCHOOL_ACCOUNT_DELETE: "SCHOOL_ACCOUNT_DELETE",
  SCHOOL_ACCOUNT_PASSWORD_RESET: "SCHOOL_ACCOUNT_PASSWORD_RESET",
  CHAIRMAN_CREATE: "CHAIRMAN_CREATE",
  CHAIRMAN_UPDATE: "CHAIRMAN_UPDATE",
  CHAIRMAN_DELETE: "CHAIRMAN_DELETE",
  CHAIRMAN_PASSWORD_RESET: "CHAIRMAN_PASSWORD_RESET",
  SUPERVISOR_CREATE: "SUPERVISOR_CREATE",
  SUPERVISOR_UPDATE: "SUPERVISOR_UPDATE",
  SUPERVISOR_DELETE: "SUPERVISOR_DELETE",
  SUPERVISOR_PASSWORD_RESET: "SUPERVISOR_PASSWORD_RESET",
  ADMIN_CREATE: "ADMIN_CREATE",
  ADMIN_UPDATE: "ADMIN_UPDATE",
  ADMIN_DELETE: "ADMIN_DELETE",
  ADMIN_PASSWORD_RESET: "ADMIN_PASSWORD_RESET",
  SUBMISSION_UPLOAD: "SUBMISSION_UPLOAD",
  SUBMISSION_ACCESS: "SUBMISSION_ACCESS",
  SUBMISSION_DELETE: "SUBMISSION_DELETE",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

interface LogAuditInput {
  action: AuditAction;
  // Either pass the authenticated request (actor identity is resolved from
  // req.user.sub via a DB lookup, since the JWT payload itself only carries
  // id/role/schoolId/gradeLevelId, not name/email) or, for pre-auth events
  // like a login attempt where there's no req.user yet, pass `actor` directly.
  req?: Request;
  actor?: { id: number; name: string; email: string; role: Role } | null;
  targetType?: string;
  targetId?: number;
  details?: string;
}

// Never throws — a failure to write an audit row must not break the request
// it's describing. Actor name/email/role are snapshotted at write time (not
// a live relation to User) because the actor's account can later be deleted
// (e.g. a School delete cascades its User rows), and the log must still show
// who did what.
export async function logAudit(input: LogAuditInput) {
  try {
    let actorId: number | null = null;
    let actorName: string | null = null;
    let actorEmail: string | null = null;
    let actorRole: Role | null = null;

    if (input.actor) {
      actorId = input.actor.id;
      actorName = input.actor.name;
      actorEmail = input.actor.email;
      actorRole = input.actor.role;
    } else if (input.req?.user) {
      actorId = input.req.user.sub;
      actorRole = input.req.user.role;
      const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { name: true, email: true } });
      if (actor) {
        actorName = actor.name;
        actorEmail = actor.email;
      }
    }

    await prisma.auditLog.create({
      data: {
        action: input.action,
        actorId,
        actorName,
        actorEmail,
        actorRole,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        details: input.details ?? null,
      },
    });
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}

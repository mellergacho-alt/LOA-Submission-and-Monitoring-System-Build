import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma";
import { logAudit, AUDIT_ACTIONS } from "../utils/auditLog";

// ADMIN-only CRUD for Division Admin accounts, from Administration → Division
// Admin Account. Unlike School/Chairman/Supervisor accounts, the caller here
// can be managing their OWN row (any admin can see every admin, including
// themselves) — every mutating handler below explicitly blocks acting on
// req.user!.sub, pointing back to Admin Profile instead, so this table can't
// be used to lock yourself out or drift from Admin Profile's own validation.

const adminSelect = { id: true, name: true, email: true };

export async function listAdmins(req: Request, res: Response) {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: adminSelect,
    orderBy: { name: "asc" },
  });
  res.json(admins);
}

export async function createAdminAccount(req: Request, res: Response) {
  const { name, email, password } = req.body as { name?: string; email?: string; password?: string };

  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ message: "Name, email, and password are required" });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters" });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return res.status(409).json({ message: `An account with email "${normalizedEmail}" already exists` });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const created = await prisma.user.create({
    data: {
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: "ADMIN",
    },
    select: adminSelect,
  });

  await logAudit({
    req,
    action: AUDIT_ACTIONS.ADMIN_CREATE,
    targetType: "User",
    targetId: created.id,
    details: `Created admin "${created.name}" (${created.email})`,
  });

  res.status(201).json(created);
}

async function assertOtherAdmin(req: Request, id: number) {
  if (id === req.user!.sub) return "SELF" as const;
  const admin = await prisma.user.findUnique({ where: { id } });
  if (!admin || admin.role !== "ADMIN") return null;
  return admin;
}

export async function updateAdmin(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { name, email } = req.body as { name?: string; email?: string };

  const admin = await assertOtherAdmin(req, id);
  if (admin === "SELF") {
    return res.status(400).json({ message: "Use Admin Profile to edit your own account" });
  }
  if (!admin) return res.status(404).json({ message: "Admin account not found" });

  const data: { name?: string; email?: string } = {};

  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ message: "Name is required" });
    data.name = name.trim();
  }

  if (email !== undefined) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return res.status(400).json({ message: "Email is required" });
    const conflict = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (conflict && conflict.id !== id) {
      return res.status(409).json({ message: "That email is already used by another account" });
    }
    data.email = normalizedEmail;
  }

  const updated = await prisma.user.update({ where: { id }, data, select: adminSelect });

  await logAudit({
    req,
    action: AUDIT_ACTIONS.ADMIN_UPDATE,
    targetType: "User",
    targetId: id,
    details: `Updated admin "${updated.name}" (fields: ${Object.keys(data).join(", ")})`,
  });

  res.json(updated);
}

export async function deleteAdmin(req: Request, res: Response) {
  const id = Number(req.params.id);

  const admin = await assertOtherAdmin(req, id);
  if (admin === "SELF") {
    return res.status(400).json({ message: "You cannot delete your own account" });
  }
  if (!admin) return res.status(404).json({ message: "Admin account not found" });

  const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
  if (adminCount <= 1) {
    return res.status(400).json({ message: "Cannot delete the last remaining Division Admin account" });
  }

  await prisma.user.delete({ where: { id } });

  await logAudit({
    req,
    action: AUDIT_ACTIONS.ADMIN_DELETE,
    targetType: "User",
    targetId: id,
    details: `Deleted admin "${admin.name}" (${admin.email})`,
  });

  res.status(204).send();
}

// Same "no current-password check" pattern as every other admin-driven
// reset — but here the admin acting is also the same role as the target, so
// self-reset is explicitly blocked (would otherwise let an admin change
// their own password without the current-password check ChangePasswordForm
// enforces, via Admin Profile).
export async function resetAdminPassword(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { newPassword } = req.body as { newPassword?: string };

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ message: "New password must be at least 6 characters" });
  }

  const admin = await assertOtherAdmin(req, id);
  if (admin === "SELF") {
    return res.status(400).json({ message: "Use Admin Profile to change your own password" });
  }
  if (!admin) return res.status(404).json({ message: "Admin account not found" });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id }, data: { passwordHash } });

  await logAudit({
    req,
    action: AUDIT_ACTIONS.ADMIN_PASSWORD_RESET,
    targetType: "User",
    targetId: id,
    details: `Password reset for admin ${admin.email}`,
  });

  res.json({ message: "Password reset successfully" });
}

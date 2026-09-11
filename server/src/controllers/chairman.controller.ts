import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma";
import { sortGradeNames } from "../utils/grades";
import { logAudit, AUDIT_ACTIONS } from "../utils/auditLog";

// Self-service CRUD for a SCHOOL's own Grade Level Chairman accounts —
// created/managed by the SCHOOL account itself, never by ADMIN. Every
// handler here is mounted behind requireRole("SCHOOL") and scopes to
// req.user!.schoolId, so a school can only ever touch its own chairmen.

const chairmanSelect = {
  id: true,
  name: true,
  email: true,
  gradeLevelIds: true,
  multigrade: true,
};

type RawChairman = { id: number; name: string; email: string; gradeLevelIds: number[]; multigrade: boolean };

// gradeLevelIds is a plain scalar array (see User.gradeLevelIds in
// schema.prisma), not a Prisma relation, so display names have to be
// resolved separately -- one query for every grade level in the caller's
// school, then an in-memory map, rather than a fetch per chairman.
async function attachGradeLevels(schoolId: number, chairmen: RawChairman[]) {
  const gradeLevels = await prisma.gradeLevel.findMany({ where: { schoolId }, select: { id: true, gradeName: true } });
  const nameById = new Map(gradeLevels.map((g) => [g.id, g.gradeName]));
  return chairmen.map((c) => ({
    ...c,
    gradeLevels: sortGradeNames(c.gradeLevelIds.map((id) => nameById.get(id)).filter((n): n is string => !!n)).map(
      (gradeName) => ({ gradeName })
    ),
  }));
}

export async function listChairmen(req: Request, res: Response) {
  const chairmen = await prisma.user.findMany({
    where: { schoolId: req.user!.schoolId!, role: "GRADE_CHAIRMAN" },
    select: chairmanSelect,
    orderBy: { name: "asc" },
  });
  res.json(await attachGradeLevels(req.user!.schoolId!, chairmen));
}

// Validates and normalizes a requested grade-level assignment for the
// caller's own school: dedupes ids, enforces "exactly 1 unless multigrade,"
// enforces multigrade is only ever true for an ES school, and enforces every
// id actually belongs to this school. Shared by create and update so the two
// can't drift apart.
async function assertValidGradeAssignment(
  schoolId: number,
  gradeLevelIdsInput: number[],
  multigrade: boolean
): Promise<{ gradeLevelIds: number[] } | { error: string }> {
  const gradeLevelIds = [...new Set(gradeLevelIdsInput.map(Number))];

  if (gradeLevelIds.length === 0) {
    return { error: "At least one grade level is required" };
  }
  if (!multigrade && gradeLevelIds.length > 1) {
    return { error: "Only a multigrade chairman may be assigned more than one grade level" };
  }

  if (multigrade) {
    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school || school.schoolLevel !== "ES") {
      return { error: "Multigrade is only available for Elementary (ES) schools" };
    }
  }

  const owned = await prisma.gradeLevel.findMany({ where: { id: { in: gradeLevelIds }, schoolId } });
  if (owned.length !== gradeLevelIds.length) {
    return { error: "One or more grade levels do not belong to your school" };
  }

  return { gradeLevelIds };
}

export async function createChairman(req: Request, res: Response) {
  const { name, email, password, gradeLevelIds, multigrade } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    gradeLevelIds?: number[];
    multigrade?: boolean;
  };

  if (!name?.trim() || !email?.trim() || !password || !Array.isArray(gradeLevelIds) || gradeLevelIds.length === 0) {
    return res.status(400).json({ message: "Name, email, password, and at least one grade level are required" });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters" });
  }

  const assignment = await assertValidGradeAssignment(req.user!.schoolId!, gradeLevelIds, Boolean(multigrade));
  if ("error" in assignment) {
    return res.status(400).json({ message: assignment.error });
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
      role: "GRADE_CHAIRMAN",
      schoolId: req.user!.schoolId!,
      gradeLevelIds: assignment.gradeLevelIds,
      multigrade: Boolean(multigrade),
    },
    select: chairmanSelect,
  });

  const [withGrades] = await attachGradeLevels(req.user!.schoolId!, [created]);

  await logAudit({
    req,
    action: AUDIT_ACTIONS.CHAIRMAN_CREATE,
    targetType: "User",
    targetId: created.id,
    details: `Created chairman "${created.name}" (${created.email}) for ${withGrades.gradeLevels
      .map((g) => g.gradeName)
      .join(", ")}`,
  });

  res.status(201).json(withGrades);
}

async function assertOwnChairman(req: Request, id: number) {
  const chairman = await prisma.user.findUnique({ where: { id } });
  if (!chairman || chairman.role !== "GRADE_CHAIRMAN" || chairman.schoolId !== req.user!.schoolId) {
    return null;
  }
  return chairman;
}

export async function updateChairman(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { name, email, gradeLevelIds, multigrade } = req.body as {
    name?: string;
    email?: string;
    gradeLevelIds?: number[];
    multigrade?: boolean;
  };

  const chairman = await assertOwnChairman(req, id);
  if (!chairman) return res.status(404).json({ message: "Grade Level Chairman not found" });

  const data: { name?: string; email?: string; gradeLevelIds?: number[]; multigrade?: boolean } = {};

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

  // Validated together, against the *effective* resulting state -- not just
  // whichever of the two fields this particular request happened to send --
  // so e.g. toggling multigrade off alone (without resending gradeLevelIds)
  // still gets rejected if the chairman currently has more than one grade.
  if (gradeLevelIds !== undefined || multigrade !== undefined) {
    const effectiveGradeLevelIds = gradeLevelIds !== undefined ? gradeLevelIds : chairman.gradeLevelIds;
    const effectiveMultigrade = multigrade !== undefined ? multigrade : chairman.multigrade;
    const assignment = await assertValidGradeAssignment(req.user!.schoolId!, effectiveGradeLevelIds, effectiveMultigrade);
    if ("error" in assignment) {
      return res.status(400).json({ message: assignment.error });
    }
    data.gradeLevelIds = assignment.gradeLevelIds;
    data.multigrade = effectiveMultigrade;
  }

  const updated = await prisma.user.update({ where: { id }, data, select: chairmanSelect });
  const [withGrades] = await attachGradeLevels(req.user!.schoolId!, [updated]);

  await logAudit({
    req,
    action: AUDIT_ACTIONS.CHAIRMAN_UPDATE,
    targetType: "User",
    targetId: id,
    details: `Updated chairman "${updated.name}" (fields: ${Object.keys(data).join(", ")})`,
  });

  res.json(withGrades);
}

export async function deleteChairman(req: Request, res: Response) {
  const id = Number(req.params.id);
  const chairman = await assertOwnChairman(req, id);
  if (!chairman) return res.status(404).json({ message: "Grade Level Chairman not found" });

  await prisma.user.delete({ where: { id } });

  await logAudit({
    req,
    action: AUDIT_ACTIONS.CHAIRMAN_DELETE,
    targetType: "User",
    targetId: id,
    details: `Deleted chairman "${chairman.name}" (${chairman.email})`,
  });

  res.status(204).send();
}

// Same "no current-password check" pattern as school.controller.ts's
// resetSchoolPassword — the school is acting on its own chairman's behalf.
export async function resetChairmanPassword(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { newPassword } = req.body as { newPassword?: string };

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ message: "New password must be at least 6 characters" });
  }

  const chairman = await assertOwnChairman(req, id);
  if (!chairman) return res.status(404).json({ message: "Grade Level Chairman not found" });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id }, data: { passwordHash } });

  await logAudit({
    req,
    action: AUDIT_ACTIONS.CHAIRMAN_PASSWORD_RESET,
    targetType: "User",
    targetId: id,
    details: `Password reset for chairman ${chairman.email}`,
  });

  res.json({ message: "Password reset successfully" });
}

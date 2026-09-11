import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { parse } from "csv-parse/sync";
import { prisma } from "../prisma";
import { logAudit, AUDIT_ACTIONS } from "../utils/auditLog";

class SupervisorAccountError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// ADMIN-only CRUD for Division Supervisor accounts — division-wide (not tied
// to any one School, unlike Grade Level Chairman), read-only viewers of LOA
// Result files scoped by Learning Area name (see submission.controller.ts's
// getSupervisorSubmissions). Every handler here is mounted behind
// requireRole("ADMIN") at the router level.

const supervisorSelect = {
  id: true,
  name: true,
  email: true,
  assignedLearningAreas: true,
};

export async function listSupervisors(req: Request, res: Response) {
  const supervisors = await prisma.user.findMany({
    where: { role: "SUPERVISOR" },
    select: supervisorSelect,
    orderBy: { name: "asc" },
  });
  res.json(supervisors);
}

// The "Assigned Learning Area" dropdown's options: every unique Learning
// Area *name* across all grades (Grade 1-12), including the Grade 11/12
// Cluster of Electives names — deduped, since the same subject name recurs
// once per grade (see LearningArea's @@unique([name, grade])).
export async function listLearningAreaNames(_req: Request, res: Response) {
  const areas = await prisma.learningArea.findMany({
    select: { name: true },
    distinct: ["name"],
    orderBy: { name: "asc" },
  });
  res.json(areas.map((a) => a.name));
}

interface SupervisorAccountInput {
  name: string;
  email: string;
  password: string;
  assignedLearningAreas: string[];
}

// Shared by the single-account create form and the CSV bulk importer, same
// "one core, two entry points" pattern as createOneSchoolAccount in
// school.controller.ts.
async function createOneSupervisorAccount(input: SupervisorAccountInput) {
  const { name, email, password, assignedLearningAreas } = input;

  if (!name?.trim() || !email?.trim() || !password) {
    throw new SupervisorAccountError("Name, DepEd Email, and password are required");
  }
  if (password.length < 6) {
    throw new SupervisorAccountError("Password must be at least 6 characters");
  }
  if (!Array.isArray(assignedLearningAreas) || assignedLearningAreas.length === 0) {
    throw new SupervisorAccountError("At least one Assigned Learning Area is required");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    throw new SupervisorAccountError(`An account with email "${normalizedEmail}" already exists`, 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.create({
    data: {
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: "SUPERVISOR",
      assignedLearningAreas,
    },
    select: supervisorSelect,
  });
}

export async function createSupervisor(req: Request, res: Response) {
  try {
    const created = await createOneSupervisorAccount({
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      assignedLearningAreas: req.body.assignedLearningAreas,
    });

    await logAudit({
      req,
      action: AUDIT_ACTIONS.SUPERVISOR_CREATE,
      targetType: "User",
      targetId: created.id,
      details: `Created supervisor "${created.name}" (${created.email})`,
    });

    res.status(201).json(created);
  } catch (err) {
    if (err instanceof SupervisorAccountError) {
      return res.status(err.status).json({ message: err.message });
    }
    throw err;
  }
}

interface BulkRowResult {
  row: number;
  email?: string;
  status: "created" | "error";
  message?: string;
}

// Bulk-creates Supervisor accounts from an uploaded CSV. Expected header row:
// name,email,password,assignedLearningAreas
// assignedLearningAreas is a semicolon-separated list of Learning Area names
// (e.g. "English;Science;STEM") -- commas are already the CSV's own field
// delimiter, so a multi-value cell needs a second delimiter, same as every
// other multi-value CSV convention. Processes every row independently — one
// bad row doesn't block the rest — and reports a per-row result, same
// "don't fail the whole batch" pattern as bulkCreateSchools in
// school.controller.ts.
export async function bulkCreateSupervisors(req: Request, res: Response) {
  if (!req.file) {
    return res.status(400).json({ message: "A CSV file is required" });
  }

  let records: Record<string, string>[];
  try {
    records = parse(req.file.buffer, {
      columns: (header: string[]) => header.map((h) => h.trim()),
      skip_empty_lines: true,
      trim: true,
    });
  } catch (err: any) {
    return res.status(400).json({ message: `Could not parse CSV: ${err.message}` });
  }

  if (records.length === 0) {
    return res.status(400).json({ message: "The CSV file has no data rows" });
  }

  const results: BulkRowResult[] = [];

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const rowNumber = i + 2; // account for the header row + 1-indexing

    try {
      const assignedLearningAreas = (row.assignedLearningAreas || "")
        .split(";")
        .map((a) => a.trim())
        .filter(Boolean);

      const created = await createOneSupervisorAccount({
        name: row.name,
        email: row.email,
        password: row.password,
        assignedLearningAreas,
      });
      await logAudit({
        req,
        action: AUDIT_ACTIONS.SUPERVISOR_CREATE,
        targetType: "User",
        targetId: created.id,
        details: `Created supervisor "${created.name}" (${created.email}) via bulk CSV import`,
      });
      results.push({ row: rowNumber, email: row.email, status: "created" });
    } catch (err) {
      results.push({
        row: rowNumber,
        email: row.email,
        status: "error",
        message: err instanceof SupervisorAccountError ? err.message : "Unexpected error creating this row",
      });
    }
  }

  const created = results.filter((r) => r.status === "created").length;
  res.status(207).json({ created, failed: results.length - created, results });
}

async function assertSupervisor(id: number) {
  const supervisor = await prisma.user.findUnique({ where: { id } });
  if (!supervisor || supervisor.role !== "SUPERVISOR") return null;
  return supervisor;
}

export async function updateSupervisor(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { name, email, assignedLearningAreas } = req.body as {
    name?: string;
    email?: string;
    assignedLearningAreas?: string[];
  };

  const supervisor = await assertSupervisor(id);
  if (!supervisor) return res.status(404).json({ message: "Supervisor account not found" });

  const data: { name?: string; email?: string; assignedLearningAreas?: string[] } = {};

  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ message: "Name is required" });
    data.name = name.trim();
  }

  if (email !== undefined) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return res.status(400).json({ message: "DepEd Email is required" });
    const conflict = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (conflict && conflict.id !== id) {
      return res.status(409).json({ message: "That email is already used by another account" });
    }
    data.email = normalizedEmail;
  }

  if (assignedLearningAreas !== undefined) {
    if (!Array.isArray(assignedLearningAreas) || assignedLearningAreas.length === 0) {
      return res.status(400).json({ message: "At least one Assigned Learning Area is required" });
    }
    data.assignedLearningAreas = assignedLearningAreas;
  }

  const updated = await prisma.user.update({ where: { id }, data, select: supervisorSelect });

  await logAudit({
    req,
    action: AUDIT_ACTIONS.SUPERVISOR_UPDATE,
    targetType: "User",
    targetId: id,
    details: `Updated supervisor "${updated.name}" (fields: ${Object.keys(data).join(", ")})`,
  });

  res.json(updated);
}

export async function deleteSupervisor(req: Request, res: Response) {
  const id = Number(req.params.id);
  const supervisor = await assertSupervisor(id);
  if (!supervisor) return res.status(404).json({ message: "Supervisor account not found" });

  await prisma.user.delete({ where: { id } });

  await logAudit({
    req,
    action: AUDIT_ACTIONS.SUPERVISOR_DELETE,
    targetType: "User",
    targetId: id,
    details: `Deleted supervisor "${supervisor.name}" (${supervisor.email})`,
  });

  res.status(204).send();
}

// Same "no current-password check" pattern as school.controller.ts's
// resetSchoolPassword / chairman.controller.ts's resetChairmanPassword — the
// admin is acting on the supervisor's behalf, not proving they are that user.
export async function resetSupervisorPassword(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { newPassword } = req.body as { newPassword?: string };

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ message: "New password must be at least 6 characters" });
  }

  const supervisor = await assertSupervisor(id);
  if (!supervisor) return res.status(404).json({ message: "Supervisor account not found" });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id }, data: { passwordHash } });

  await logAudit({
    req,
    action: AUDIT_ACTIONS.SUPERVISOR_PASSWORD_RESET,
    targetType: "User",
    targetId: id,
    details: `Password reset for supervisor ${supervisor.email}`,
  });

  res.json({ message: "Password reset successfully" });
}

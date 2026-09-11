import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import fs from "fs/promises";
import { parse } from "csv-parse/sync";
import { prisma } from "../prisma";
import { SchoolLevel } from "@prisma/client";
import { GRADES_BY_LEVEL, filterGradeLevelsForSchoolLevel } from "../utils/grades";
import { logAudit, AUDIT_ACTIONS } from "../utils/auditLog";

// A School can have multiple Users now (its SCHOOL login plus any
// GRADE_CHAIRMAN logins it's created) — this still only surfaces the
// SCHOOL-role one under `user`, matching the old 1:1 API shape School
// Account Management expects. Chairman accounts are managed separately via
// /api/chairmen, not shown here.
const schoolInclude = {
  cluster: true,
  // classSections ordered by id (= creation order) explicitly — without it,
  // Postgres doesn't guarantee row order, and an UPDATE (e.g. toggling
  // hasElectives) can shift where a row lands in an unordered scan, making
  // the class list appear to reorder itself after tagging a class.
  gradeLevels: { include: { classSections: { orderBy: { id: "asc" as const } } } },
  users: {
    where: { role: "SCHOOL" as const },
    take: 1,
    select: { id: true, email: true, name: true, forceGoogleSignIn: true },
  },
};


class SchoolAccountError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// Grade levels can include ones left over from a previous schoolLevel (kept
// on purpose to avoid destroying class sections/submissions on a level
// change) — trim the response down to what's applicable to the current level.
// Also collapses `users` (a School can have several now — see schema.prisma)
// back down to a single `user` field, matching the old 1:1 API shape School
// Account Management expects; the SCHOOL-role row is the only one included
// (schoolInclude), so `users[0]` is always that one.
function withVisibleGradeLevels<
  T extends {
    schoolLevel: SchoolLevel;
    gradeLevels: { gradeName: string }[];
    users: { id: number; email: string; name: string; forceGoogleSignIn: boolean }[];
  }
>(
  school: T
): Omit<T, "users"> & { user: { id: number; email: string; name: string; forceGoogleSignIn: boolean } | null } {
  const { users, ...rest } = school;
  return {
    ...rest,
    gradeLevels: filterGradeLevelsForSchoolLevel(school.gradeLevels, school.schoolLevel),
    user: users[0] ?? null,
  };
}

export async function listSchools(_req: Request, res: Response) {
  const schools = await prisma.school.findMany({ include: schoolInclude, orderBy: { schoolName: "asc" } });
  res.json(schools.map(withVisibleGradeLevels));
}

export async function getMySchool(req: Request, res: Response) {
  if (!req.user!.schoolId) {
    return res.status(404).json({ message: "This account is not linked to a school" });
  }
  const school = await prisma.school.findUnique({
    where: { id: req.user!.schoolId },
    include: schoolInclude,
  });
  if (!school) return res.status(404).json({ message: "School not found" });
  res.json(withVisibleGradeLevels(school));
}

interface UpdateSchoolInput {
  schoolIdNumber?: string;
  schoolName?: string;
  schoolHeadName?: string;
  schoolEmail?: string;
  schoolLevel?: SchoolLevel;
  clusterId?: number;
  forceGoogleSignIn?: boolean;
  forceChairmenGoogleSignIn?: boolean;
}

// Shared by the school's own self-edit (updateMySchool) and the admin's
// per-school edit (updateSchoolById). If schoolLevel changes, any grade
// levels newly required by the level are added — existing grade levels (and
// their class sections/submissions) are never removed, to avoid destroying
// data. School Email doubles as the login username — keeps the linked
// User.email in sync whenever it's changed.
async function updateSchoolRecord(schoolId: number, input: UpdateSchoolInput) {
  const {
    schoolIdNumber,
    schoolName,
    schoolHeadName,
    schoolEmail,
    schoolLevel,
    clusterId,
    forceGoogleSignIn,
    forceChairmenGoogleSignIn,
  } = input;

  if (schoolLevel && !GRADES_BY_LEVEL[schoolLevel]) {
    throw new SchoolAccountError("Invalid schoolLevel");
  }

  if (schoolIdNumber) {
    const conflict = await prisma.school.findUnique({ where: { schoolIdNumber } });
    if (conflict && conflict.id !== schoolId) {
      throw new SchoolAccountError("That School ID Number is already in use", 409);
    }
  }

  const linkedUser = await prisma.user.findFirst({ where: { schoolId, role: "SCHOOL" } });
  const normalizedSchoolEmail = schoolEmail?.trim().toLowerCase();
  if (normalizedSchoolEmail) {
    const conflict = await prisma.user.findUnique({ where: { email: normalizedSchoolEmail } });
    if (conflict && conflict.id !== linkedUser?.id) {
      throw new SchoolAccountError("That email is already used by another account", 409);
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.school.update({
      where: { id: schoolId },
      data: {
        ...(schoolIdNumber && { schoolIdNumber }),
        ...(schoolName && { schoolName }),
        ...(schoolHeadName !== undefined && { schoolHeadName }),
        ...(schoolEmail !== undefined && { schoolEmail }),
        ...(schoolLevel && { schoolLevel }),
        ...(clusterId && { clusterId: Number(clusterId) }),
        ...(forceChairmenGoogleSignIn !== undefined && { forceChairmenGoogleSignIn }),
      },
    });

    if (linkedUser && (normalizedSchoolEmail || forceGoogleSignIn !== undefined)) {
      await tx.user.update({
        where: { id: linkedUser.id },
        data: {
          ...(normalizedSchoolEmail && { email: normalizedSchoolEmail }),
          ...(forceGoogleSignIn !== undefined && { forceGoogleSignIn }),
        },
      });
    }

    if (schoolLevel) {
      const existingGrades = await tx.gradeLevel.findMany({
        where: { schoolId: updated.id },
        select: { gradeName: true },
      });
      const existingNames = new Set(existingGrades.map((g) => g.gradeName));
      const missing = GRADES_BY_LEVEL[schoolLevel].filter((g) => !existingNames.has(g));
      if (missing.length > 0) {
        await tx.gradeLevel.createMany({
          data: missing.map((gradeName) => ({ schoolId: updated.id, gradeName })),
        });
      }
    }

    return tx.school.findUniqueOrThrow({ where: { id: updated.id }, include: schoolInclude });
  });
}

// SCHOOL accounts editing their own Basic Information (School Profile page).
export async function updateMySchool(req: Request, res: Response) {
  if (!req.user!.schoolId) {
    return res.status(404).json({ message: "This account is not linked to a school" });
  }
  try {
    // forceGoogleSignIn and forceChairmenGoogleSignIn are admin-only policy
    // controls (School Admins card) -- deliberately stripped here even if a
    // self-edit request sent them, so a school can never lift (or set) its
    // own login restriction, or its chairmen's, via its own self-edit
    // endpoint. Only updateSchoolById (ADMIN route) is allowed to pass them
    // through.
    const { forceGoogleSignIn: _ignored, forceChairmenGoogleSignIn: _ignored2, ...selfEditableFields } = req.body ?? {};
    const school = await updateSchoolRecord(req.user!.schoolId, selfEditableFields);
    await logAudit({
      req,
      action: AUDIT_ACTIONS.SCHOOL_ACCOUNT_UPDATE,
      targetType: "School",
      targetId: school.id,
      details: `Self-edited school profile (fields: ${Object.keys(selfEditableFields).join(", ")})`,
    });
    res.json(withVisibleGradeLevels(school));
  } catch (err) {
    if (err instanceof SchoolAccountError) return res.status(err.status).json({ message: err.message });
    throw err;
  }
}

// ADMIN editing any school inline from the School Accounts table.
export async function updateSchoolById(req: Request, res: Response) {
  const id = Number(req.params.id);
  try {
    const school = await updateSchoolRecord(id, req.body);
    await logAudit({
      req,
      action: AUDIT_ACTIONS.SCHOOL_ACCOUNT_UPDATE,
      targetType: "School",
      targetId: school.id,
      details: `Admin-edited school "${school.schoolName}" (fields: ${Object.keys(req.body).join(", ")})`,
    });
    res.json(withVisibleGradeLevels(school));
  } catch (err) {
    if (err instanceof SchoolAccountError) return res.status(err.status).json({ message: err.message });
    throw err;
  }
}

// Deletes a school and everything under it (grade levels, class sections,
// submissions, and its linked login account) via cascading FKs — then cleans
// up the now-orphaned uploaded files from disk, which cascade deletes can't
// touch themselves. ADMIN only.
export async function deleteSchool(req: Request, res: Response) {
  const id = Number(req.params.id);

  const school = await prisma.school.findUnique({ where: { id } });
  if (!school) return res.status(404).json({ message: "School not found" });

  const submissions = await prisma.submission.findMany({
    where: { classSection: { gradeLevel: { schoolId: id } } },
    select: { filePath: true },
  });

  await prisma.school.delete({ where: { id } });

  await Promise.all(submissions.filter((s) => s.filePath).map((s) => fs.unlink(s.filePath!).catch(() => {})));

  await logAudit({
    req,
    action: AUDIT_ACTIONS.SCHOOL_ACCOUNT_DELETE,
    targetType: "School",
    targetId: id,
    details: `Deleted school "${school.schoolName}" (${school.schoolIdNumber})`,
  });

  res.status(204).send();
}

// Admin-initiated password reset for a school's login account — unlike the
// self-service change-password flow, this doesn't require the current
// password (the admin is acting on the school's behalf, e.g. a lockout).
export async function resetSchoolPassword(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { newPassword } = req.body as { newPassword?: string };

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ message: "New password must be at least 6 characters" });
  }

  const user = await prisma.user.findFirst({ where: { schoolId: id, role: "SCHOOL" } });
  if (!user) return res.status(404).json({ message: "This school has no linked account" });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  await logAudit({
    req,
    action: AUDIT_ACTIONS.SCHOOL_ACCOUNT_PASSWORD_RESET,
    targetType: "School",
    targetId: id,
    details: `Password reset for school login ${user.email}`,
  });

  res.json({ message: "Password reset successfully" });
}

interface SchoolAccountInput {
  schoolIdNumber: string;
  schoolName: string;
  schoolHeadName?: string;
  schoolEmail: string;
  schoolLevel: string;
  clusterId: number;
  contactName: string;
  accountPassword: string;
  forceGoogleSignIn?: boolean;
  forceChairmenGoogleSignIn?: boolean;
}

// Creates a School Account: the School Profile plus its linked login (User, role SCHOOL),
// in one transaction. GradeLevel rows auto-populate based on schoolLevel.
// School Email doubles as the login username, so there's a single email to
// manage instead of a separate "account email" the school never sees again.
// Shared by both the single-account form and the CSV bulk importer.
async function createOneSchoolAccount(input: SchoolAccountInput) {
  const {
    schoolIdNumber,
    schoolName,
    schoolHeadName,
    schoolEmail,
    schoolLevel,
    clusterId,
    contactName,
    accountPassword,
    forceGoogleSignIn,
    forceChairmenGoogleSignIn,
  } = input;

  if (!schoolIdNumber || !schoolName) {
    throw new SchoolAccountError("School ID Number and School Name are required");
  }
  if (!contactName || !schoolEmail || !accountPassword) {
    throw new SchoolAccountError("Contact name, school email, and password are required");
  }
  if (accountPassword.length < 6) {
    throw new SchoolAccountError("Password must be at least 6 characters");
  }
  if (!clusterId || Number.isNaN(clusterId)) {
    throw new SchoolAccountError("A valid cluster (1-10) is required");
  }

  const grades = GRADES_BY_LEVEL[schoolLevel as SchoolLevel];
  if (!grades) {
    throw new SchoolAccountError(`Invalid School Level "${schoolLevel}" (must be ES, JHS, JHS_SHS, or SHS)`);
  }

  const normalizedEmail = schoolEmail.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existingUser) {
    throw new SchoolAccountError(`An account with email "${normalizedEmail}" already exists`, 409);
  }
  const existingSchool = await prisma.school.findUnique({ where: { schoolIdNumber } });
  if (existingSchool) {
    throw new SchoolAccountError(`A school with ID Number "${schoolIdNumber}" already exists`, 409);
  }
  const cluster = await prisma.cluster.findUnique({ where: { id: clusterId } });
  if (!cluster) {
    throw new SchoolAccountError(`Cluster "${clusterId}" does not exist`);
  }

  const passwordHash = await bcrypt.hash(accountPassword, 10);

  return prisma.$transaction(async (tx) => {
    const created = await tx.school.create({
      data: {
        schoolIdNumber,
        schoolName,
        schoolHeadName: schoolHeadName || null,
        schoolEmail: normalizedEmail,
        schoolLevel: schoolLevel as SchoolLevel,
        clusterId,
        forceChairmenGoogleSignIn: Boolean(forceChairmenGoogleSignIn),
        gradeLevels: {
          create: grades.map((gradeName) => ({ gradeName })),
        },
      },
    });

    await tx.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: contactName,
        role: "SCHOOL",
        schoolId: created.id,
        forceGoogleSignIn: Boolean(forceGoogleSignIn),
      },
    });

    return tx.school.findUniqueOrThrow({ where: { id: created.id }, include: schoolInclude });
  });
}

export async function createSchool(req: Request, res: Response) {
  try {
    const school = await createOneSchoolAccount({
      schoolIdNumber: req.body.schoolIdNumber,
      schoolName: req.body.schoolName,
      schoolHeadName: req.body.schoolHeadName,
      schoolEmail: req.body.schoolEmail,
      schoolLevel: req.body.schoolLevel,
      clusterId: Number(req.body.clusterId),
      contactName: req.body.contactName,
      accountPassword: req.body.accountPassword,
      forceGoogleSignIn: Boolean(req.body.forceGoogleSignIn),
      forceChairmenGoogleSignIn: Boolean(req.body.forceChairmenGoogleSignIn),
    });
    await logAudit({
      req,
      action: AUDIT_ACTIONS.SCHOOL_ACCOUNT_CREATE,
      targetType: "School",
      targetId: school.id,
      details: `Created school "${school.schoolName}" (${school.schoolIdNumber})`,
    });
    res.status(201).json(withVisibleGradeLevels(school));
  } catch (err) {
    if (err instanceof SchoolAccountError) {
      return res.status(err.status).json({ message: err.message });
    }
    throw err;
  }
}

interface BulkRowResult {
  row: number;
  schoolIdNumber?: string;
  status: "created" | "error";
  message?: string;
}

// A blank/missing cell means false -- forceGoogleSignIn is opt-in, so a CSV
// exported before this column existed (or a row that just leaves it out)
// must not accidentally force every imported school onto Google Sign-In.
function parseCsvBoolean(value: string | undefined): boolean {
  return ["true", "yes", "1"].includes((value ?? "").trim().toLowerCase());
}

// Bulk-creates School Accounts from an uploaded CSV. Expected header row:
// schoolIdNumber,schoolName,schoolLevel,cluster,contactName,schoolHeadName,schoolEmail,accountPassword,forceGoogleSignIn,forceChairmenGoogleSignIn
// (schoolHeadName, forceGoogleSignIn, and forceChairmenGoogleSignIn may be
// left blank -- both force* columns accept true/yes/1, case-insensitive;
// anything else, including blank, is false). Processes every row
// independently — one bad row doesn't block the rest — and reports a
// per-row result.
export async function bulkCreateSchools(req: Request, res: Response) {
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
      const created = await createOneSchoolAccount({
        schoolIdNumber: row.schoolIdNumber,
        schoolName: row.schoolName,
        schoolHeadName: row.schoolHeadName,
        schoolEmail: row.schoolEmail,
        schoolLevel: (row.schoolLevel || "").toUpperCase(),
        clusterId: Number(row.cluster),
        contactName: row.contactName,
        accountPassword: row.accountPassword,
        forceGoogleSignIn: parseCsvBoolean(row.forceGoogleSignIn),
        forceChairmenGoogleSignIn: parseCsvBoolean(row.forceChairmenGoogleSignIn),
      });
      await logAudit({
        req,
        action: AUDIT_ACTIONS.SCHOOL_ACCOUNT_CREATE,
        targetType: "School",
        targetId: created.id,
        details: `Created school "${created.schoolName}" (${created.schoolIdNumber}) via bulk CSV import`,
      });
      results.push({ row: rowNumber, schoolIdNumber: row.schoolIdNumber, status: "created" });
    } catch (err) {
      results.push({
        row: rowNumber,
        schoolIdNumber: row.schoolIdNumber,
        status: "error",
        message: err instanceof SchoolAccountError ? err.message : "Unexpected error creating this row",
      });
    }
  }

  const created = results.filter((r) => r.status === "created").length;
  res.status(207).json({ created, failed: results.length - created, results });
}

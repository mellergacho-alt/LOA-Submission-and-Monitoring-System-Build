import { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import { ExamType, DocumentType } from "@prisma/client";
import { prisma } from "../prisma";
import {
  filterGradeLevelsForSchoolLevel,
  ELECTIVE_LEARNING_AREAS,
  CLUSTER_OF_ELECTIVES_LEARNING_AREAS,
  getClusterElectiveTarget,
} from "../utils/grades";
import { isValidExamType } from "../utils/examTypes";
import { isValidDocumentType, documentTypeLabel } from "../utils/documentTypes";
import { isFileTypeAllowed } from "../utils/fileTypes";
import { logAudit, AUDIT_ACTIONS } from "../utils/auditLog";

// ADMIN can access any grade level; SCHOOL is scoped to its own school (any
// grade); GRADE_CHAIRMAN is scoped to its own school *and* its one assigned
// grade level — a Chairman can never reach another grade, even within the
// same school.
function hasGradeLevelAccess(req: Request, gradeLevel: { id: number; schoolId: number }): boolean {
  if (req.user!.role === "ADMIN") return true;
  if (req.user!.role === "SCHOOL") return req.user!.schoolId === gradeLevel.schoolId;
  if (req.user!.role === "GRADE_CHAIRMAN") {
    return req.user!.schoolId === gradeLevel.schoolId && req.user!.gradeLevelIds.includes(gradeLevel.id);
  }
  return false;
}

async function assertGradeLevelAccess(req: Request, gradeLevelId: number) {
  const gradeLevel = await prisma.gradeLevel.findUnique({ where: { id: gradeLevelId } });
  if (!gradeLevel) return null;
  if (!hasGradeLevelAccess(req, gradeLevel)) {
    return "FORBIDDEN" as const;
  }
  return gradeLevel;
}

// SCHOOL and GRADE_CHAIRMAN accounts can only upload/remove against the
// currently active School Year + Term (server-side enforced, not just a
// disabled UI) — every other term is view/download-only. ADMIN never
// uploads at all (see architecture note), so this check only exempts ADMIN.
async function assertTermIsActiveForWrite(req: Request, termId: number) {
  if (req.user!.role === "ADMIN") return null;
  const term = await prisma.term.findUnique({ where: { id: termId } });
  if (!term || !term.isActive) {
    return "TERM_NOT_ACTIVE" as const;
  }
  return null;
}

// SCHOOL and GRADE_CHAIRMAN accounts can only upload for an (ExamType,
// DocumentType) pair that's marked required for this Term and, if the admin
// set dates, within its [startDate, deadline] window — same "trusted, exempt
// from write gates" treatment ADMIN gets from assertTermIsActiveForWrite
// above. A missing ExamSchedule row behaves like required: false (blocked), same as a
// Cluster of Electives target of 0. fileName is checked against the
// schedule's allowedFileTypes last, only once every other gate has passed —
// an empty allowedFileTypes list means no restriction (see fileTypes.ts).
// A deadline with allowLateSubmission on doesn't block the upload any more --
// it returns "LATE_ALLOWED" instead of null so uploadSubmission knows to
// write the resulting row with status: LATE instead of SUBMITTED, rather
// than silently accepting it as an on-time SUBMITTED. None of the existing
// `scheduleGate?.code === "EXAM_..."` checks at the call site match this new
// code, so it falls through exactly like `null` (OK) always did there.
async function assertExamScheduleOpenForWrite(
  req: Request,
  termId: number,
  examType: ExamType,
  documentType: DocumentType,
  fileName: string
) {
  if (req.user!.role === "ADMIN") return null;
  const schedule = await prisma.examSchedule.findUnique({
    where: { termId_examType_documentType: { termId, examType, documentType } },
  });
  if (!schedule || !schedule.required) return { code: "EXAM_NOT_REQUIRED" } as const;
  const now = new Date();
  if (schedule.startDate && now < schedule.startDate) return { code: "EXAM_NOT_OPEN_YET" } as const;
  let isLate = false;
  if (schedule.deadline && now > schedule.deadline) {
    if (!schedule.allowLateSubmission) return { code: "EXAM_DEADLINE_PASSED" } as const;
    isLate = true;
  }
  if (!isFileTypeAllowed(fileName, schedule.allowedFileTypes)) {
    return { code: "FILE_TYPE_NOT_ALLOWED", allowedFileTypes: schedule.allowedFileTypes } as const;
  }
  return isLate ? ({ code: "LATE_ALLOWED" } as const) : null;
}

// Grid data for the LOA Submission tab: rows = learning areas (scoped to this grade),
// columns = class sections, for a given grade level + term.
export async function getSubmissionGrid(req: Request, res: Response) {
  const gradeLevelId = Number(req.query.gradeLevelId);
  const termId = Number(req.query.termId);
  const examType = req.query.examType;
  const documentType = req.query.documentType;
  if (!gradeLevelId) {
    return res.status(400).json({ message: "gradeLevelId is required" });
  }
  if (!termId) {
    return res.status(400).json({ message: "termId is required" });
  }
  if (!isValidExamType(examType)) {
    return res.status(400).json({ message: "A valid examType is required" });
  }
  if (!isValidDocumentType(documentType)) {
    return res.status(400).json({ message: "A valid documentType is required" });
  }

  const gradeLevel = await assertGradeLevelAccess(req, gradeLevelId);
  if (gradeLevel === null) return res.status(404).json({ message: "Grade level not found" });
  if (gradeLevel === "FORBIDDEN") {
    return res.status(403).json({ message: "You can only access your own school's submissions" });
  }

  // orderBy id (= creation order) — see schoolInclude comment in
  // school.controller.ts for why this can't be left implicit.
  const classSections = await prisma.classSection.findMany({ where: { gradeLevelId }, orderBy: { id: "asc" } });
  const learningAreas = await prisma.learningArea.findMany({ where: { grade: gradeLevel.gradeName } });
  const [submissions, examSchedule] = await Promise.all([
    prisma.submission.findMany({
      where: { classSectionId: { in: classSections.map((c) => c.id) }, termId, examType, documentType },
    }),
    prisma.examSchedule.findUnique({ where: { termId_examType_documentType: { termId, examType, documentType } } }),
  ]);

  res.json({ classSections, learningAreas, submissions, examSchedule });
}

// Upload/replace the file for one grid cell (classSection x learningArea x term).
export async function uploadSubmission(req: Request, res: Response) {
  const { classSectionId, learningAreaId, termId, examType, documentType } = req.body;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: "File is required" });
  }
  if (!termId) {
    return res.status(400).json({ message: "termId is required" });
  }
  if (!isValidExamType(examType)) {
    return res.status(400).json({ message: "A valid examType is required" });
  }
  if (!isValidDocumentType(documentType)) {
    return res.status(400).json({ message: "A valid documentType is required" });
  }

  const classSection = await prisma.classSection.findUnique({
    where: { id: Number(classSectionId) },
    include: { gradeLevel: true },
  });
  if (!classSection) return res.status(404).json({ message: "Class section not found" });

  if (!hasGradeLevelAccess(req, classSection.gradeLevel)) {
    return res.status(403).json({ message: "You can only upload to your own school's submissions" });
  }

  if ((await assertTermIsActiveForWrite(req, Number(termId))) === "TERM_NOT_ACTIVE") {
    return res.status(403).json({ message: "You can only upload to the active School Year and Term" });
  }

  const docLabel = documentTypeLabel(documentType);
  const scheduleGate = await assertExamScheduleOpenForWrite(
    req,
    Number(termId),
    examType,
    documentType,
    file.originalname
  );
  if (scheduleGate?.code === "EXAM_NOT_REQUIRED") {
    return res.status(403).json({ message: `This ${docLabel} is not required for this Term` });
  }
  if (scheduleGate?.code === "EXAM_NOT_OPEN_YET") {
    return res.status(403).json({ message: `Submission for this ${docLabel} has not opened yet` });
  }
  if (scheduleGate?.code === "EXAM_DEADLINE_PASSED") {
    return res.status(403).json({ message: `The deadline for this ${docLabel} has passed` });
  }
  if (scheduleGate?.code === "FILE_TYPE_NOT_ALLOWED") {
    // multer's disk storage already wrote the file before this handler ran —
    // clean it up rather than leaving an orphaned upload behind.
    await fs.unlink(file.path).catch(() => {});
    const accepted = scheduleGate.allowedFileTypes.map((t) => t.toUpperCase()).join(", ");
    return res.status(400).json({ message: `This ${docLabel} only accepts: ${accepted}` });
  }
  const submissionStatus = scheduleGate?.code === "LATE_ALLOWED" ? "LATE" : "SUBMITTED";

  const learningArea = await prisma.learningArea.findUnique({ where: { id: Number(learningAreaId) } });
  if (!learningArea) return res.status(404).json({ message: "Learning area not found" });

  if (ELECTIVE_LEARNING_AREAS.includes(learningArea.name) && !classSection.hasElectives) {
    return res
      .status(403)
      .json({ message: `${classSection.className} does not have electives enabled for this learning area` });
  }

  // Cluster of Electives areas allow multiple files per cell, up to a
  // school-configured target — always insert a new row instead of the
  // upsert-in-place used by every other (single-file) learning area.
  if (CLUSTER_OF_ELECTIVES_LEARNING_AREAS.includes(learningArea.name)) {
    const target = getClusterElectiveTarget(classSection, learningArea.name);
    if (target <= 0) {
      return res.status(400).json({
        message: `Set a file limit for ${learningArea.name} in School Profile before uploading`,
      });
    }
    const existingCount = await prisma.submission.count({
      where: {
        classSectionId: Number(classSectionId),
        learningAreaId: Number(learningAreaId),
        termId: Number(termId),
        examType,
        documentType,
      },
    });
    if (existingCount >= target) {
      return res.status(400).json({ message: `File limit reached (${target}) for ${learningArea.name}` });
    }

    const created = await prisma.submission.create({
      data: {
        classSectionId: Number(classSectionId),
        learningAreaId: Number(learningAreaId),
        termId: Number(termId),
        examType,
        documentType,
        fileName: file.originalname,
        filePath: file.path,
        status: submissionStatus,
        submittedAt: new Date(),
      },
    });
    await logAudit({
      req,
      action: AUDIT_ACTIONS.SUBMISSION_UPLOAD,
      targetType: "Submission",
      targetId: created.id,
      details: `Uploaded "${file.originalname}" for ${learningArea.name} / ${classSection.className}`,
    });
    return res.status(201).json(created);
  }

  // No DB-level unique constraint any more (Cluster of Electives areas need
  // multiple rows per key), so the "one row per cell" behavior for every
  // other learning area is enforced here: find-then-update-or-create instead
  // of a compound-key upsert.
  const existing = await prisma.submission.findFirst({
    where: {
      classSectionId: Number(classSectionId),
      learningAreaId: Number(learningAreaId),
      termId: Number(termId),
      examType,
      documentType,
    },
  });

  const submission = existing
    ? await prisma.submission.update({
        where: { id: existing.id },
        data: { fileName: file.originalname, filePath: file.path, status: submissionStatus, submittedAt: new Date() },
      })
    : await prisma.submission.create({
        data: {
          classSectionId: Number(classSectionId),
          learningAreaId: Number(learningAreaId),
          termId: Number(termId),
          examType,
          documentType,
          fileName: file.originalname,
          filePath: file.path,
          status: submissionStatus,
          submittedAt: new Date(),
        },
      });

  await logAudit({
    req,
    action: AUDIT_ACTIONS.SUBMISSION_UPLOAD,
    targetType: "Submission",
    targetId: submission.id,
    details: `Uploaded "${file.originalname}" for ${learningArea.name} / ${classSection.className}`,
  });

  res.status(201).json(submission);
}

// Streams an uploaded file back with the original filename (not the random
// stored one) via Content-Disposition, so the browser downloads it with a
// sensible name. SCHOOL accounts are restricted to their own school's files.
export async function downloadSubmission(req: Request, res: Response) {
  const id = Number(req.params.id);

  const submission = await prisma.submission.findUnique({
    where: { id },
    include: { classSection: { include: { gradeLevel: true } }, learningArea: true },
  });
  if (!submission || !submission.filePath) {
    return res.status(404).json({ message: "File not found" });
  }

  if (req.user!.role === "SUPERVISOR") {
    const supervisor = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!supervisor?.assignedLearningAreas.includes(submission.learningArea.name)) {
      return res.status(403).json({ message: "You can only download files for your assigned learning areas" });
    }
  } else if (!hasGradeLevelAccess(req, submission.classSection.gradeLevel)) {
    return res.status(403).json({ message: "You can only download your own school's files" });
  }

  // Covers both "View" (FileViewerPage.tsx) and "Download" — both route
  // through this same endpoint, so one log entry captures either kind of
  // file access.
  await logAudit({
    req,
    action: AUDIT_ACTIONS.SUBMISSION_ACCESS,
    targetType: "Submission",
    targetId: id,
    details: `Accessed file "${submission.fileName}" (${submission.learningArea.name})`,
  });

  const absolutePath = path.resolve(submission.filePath);
  res.download(absolutePath, submission.fileName ?? "download", (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ message: "File not found on disk" });
    }
  });
}

// Removes an uploaded submission (reverts the grid cell back to "not
// submitted") and deletes the file from disk. SCHOOL accounts are restricted
// to their own school's submissions.
export async function deleteSubmission(req: Request, res: Response) {
  const id = Number(req.params.id);

  const submission = await prisma.submission.findUnique({
    where: { id },
    include: { classSection: { include: { gradeLevel: true } } },
  });
  if (!submission) return res.status(404).json({ message: "Submission not found" });

  if (!hasGradeLevelAccess(req, submission.classSection.gradeLevel)) {
    return res.status(403).json({ message: "You can only remove your own school's submissions" });
  }

  if ((await assertTermIsActiveForWrite(req, submission.termId)) === "TERM_NOT_ACTIVE") {
    return res.status(403).json({ message: "You can only remove files from the active School Year and Term" });
  }

  if (submission.filePath) {
    await fs.unlink(submission.filePath).catch(() => {});
  }

  await prisma.submission.delete({ where: { id } });

  await logAudit({
    req,
    action: AUDIT_ACTIONS.SUBMISSION_DELETE,
    targetType: "Submission",
    targetId: id,
    details: `Removed file "${submission.fileName}"`,
  });

  res.status(204).send();
}

// Status matrix for one school: every grade level, each with its learning areas
// (rows) x class sections (columns) x submission status per cell, for a given
// term. This is the doc's "status per grade level, learning area, and
// class/section" view. SCHOOL is locked to its own school; GRADE_CHAIRMAN is
// further locked down to just its one assigned grade level within that school.
export async function getStatusGrid(req: Request, res: Response) {
  // SUPERVISOR is scoped by Learning Area name only (see getSupervisorSubmissions)
  // and has no per-school/per-grade view at all — without this explicit check,
  // the ternary below would treat it like ADMIN and trust a caller-supplied
  // ?schoolId= for *any* school, the same "not SCHOOL = trusted like ADMIN"
  // trap already fixed once for GRADE_CHAIRMAN elsewhere in this file.
  if (req.user!.role === "SUPERVISOR") {
    return res.status(403).json({ message: "You do not have access to this resource" });
  }

  const termId = Number(req.query.termId);
  const examType = req.query.examType;
  const documentType = req.query.documentType;
  const schoolId =
    req.user!.role === "SCHOOL" || req.user!.role === "GRADE_CHAIRMAN" ? req.user!.schoolId! : Number(req.query.schoolId);

  if (!schoolId) {
    return res.status(400).json({ message: "schoolId is required" });
  }
  if (!termId) {
    return res.status(400).json({ message: "termId is required" });
  }
  if (!isValidExamType(examType)) {
    return res.status(400).json({ message: "A valid examType is required" });
  }
  if (!isValidDocumentType(documentType)) {
    return res.status(400).json({ message: "A valid documentType is required" });
  }
  if ((req.user!.role === "SCHOOL" || req.user!.role === "GRADE_CHAIRMAN") && req.user!.schoolId !== schoolId) {
    return res.status(403).json({ message: "You can only access your own school's status" });
  }

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    include: { gradeLevels: { include: { classSections: { orderBy: { id: "asc" } } } } },
  });
  if (!school) return res.status(404).json({ message: "School not found" });

  let visibleGradeLevels = filterGradeLevelsForSchoolLevel(school.gradeLevels, school.schoolLevel);
  if (req.user!.role === "GRADE_CHAIRMAN") {
    visibleGradeLevels = visibleGradeLevels.filter((g) => req.user!.gradeLevelIds.includes(g.id));
  }
  const gradeNames = visibleGradeLevels.map((g) => g.gradeName);
  const allClassSectionIds = visibleGradeLevels.flatMap((g) => g.classSections.map((cs) => cs.id));

  const [learningAreas, submissions, examSchedule] = await Promise.all([
    prisma.learningArea.findMany({ where: { grade: { in: gradeNames } } }),
    prisma.submission.findMany({ where: { classSectionId: { in: allClassSectionIds }, termId, examType, documentType } }),
    prisma.examSchedule.findUnique({ where: { termId_examType_documentType: { termId, examType, documentType } } }),
  ]);

  const learningAreasByGrade = new Map<string, typeof learningAreas>();
  for (const la of learningAreas) {
    if (!learningAreasByGrade.has(la.grade)) learningAreasByGrade.set(la.grade, []);
    learningAreasByGrade.get(la.grade)!.push(la);
  }

  const gradeLevels = visibleGradeLevels.map((grade) => ({
    id: grade.id,
    gradeName: grade.gradeName,
    classSections: grade.classSections.map((cs) => ({
      id: cs.id,
      className: cs.className,
      hasElectives: cs.hasElectives,
      electiveFileTargets: cs.electiveFileTargets as Record<string, number>,
    })),
    learningAreas: (learningAreasByGrade.get(grade.gradeName) ?? []).map((la) => ({ id: la.id, name: la.name })),
    submissions: submissions
      .filter((s) => grade.classSections.some((cs) => cs.id === s.classSectionId))
      .map((s) => ({
        id: s.id,
        classSectionId: s.classSectionId,
        learningAreaId: s.learningAreaId,
        status: s.status,
        fileName: s.fileName,
        filePath: s.filePath,
        submittedAt: s.submittedAt,
      })),
  }));

  res.json({ school: { id: school.id, schoolName: school.schoolName }, gradeLevels, examSchedule });
}

const TERM_COUNT = 3; // First, Second, Third

// Shared cell-level accounting for the Status of Submission stat cards.
//
// A "Not Submitted" cell has no Submission row at all for most learning
// areas (rows are only ever created on upload, as SUBMITTED, or manually as
// LATE) — so it can't be counted with a status filter, it has to be derived
// as (possible cells) - (filled cells). For Cluster of Electives learning
// areas a "cell" can hold multiple rows (up to a school-configured target),
// so "filled" there means the row count for that (class section, learning
// area, term) has reached its target, not "a row exists".
async function getSubmissionCellCounts(
  classSectionIds: number[],
  gradeNames: string[],
  termId: number | undefined,
  examType: ExamType | undefined,
  documentType: DocumentType | undefined
) {
  if (classSectionIds.length === 0) return { submitted: 0, late: 0, notSubmitted: 0 };

  const classSections = await prisma.classSection.findMany({
    where: { id: { in: classSectionIds } },
    include: { gradeLevel: true },
  });
  const learningAreas = await prisma.learningArea.findMany({ where: { grade: { in: gradeNames } } });
  const areasByGrade = new Map<string, typeof learningAreas>();
  for (const la of learningAreas) {
    if (!areasByGrade.has(la.grade)) areasByGrade.set(la.grade, []);
    areasByGrade.get(la.grade)!.push(la);
  }
  const learningAreaById = new Map(learningAreas.map((la) => [la.id, la]));
  const classSectionById = new Map(classSections.map((cs) => [cs.id, cs]));

  const allSubmissions = await prisma.submission.findMany({
    where: { classSectionId: { in: classSectionIds }, termId, examType, documentType },
    select: { classSectionId: true, learningAreaId: true, termId: true, status: true },
  });

  let submitted = 0;
  let late = 0;

  // Non-cluster rows: one row is one cell (still enforced in application
  // code by uploadSubmission), so its own status decides the tally.
  for (const s of allSubmissions) {
    const area = learningAreaById.get(s.learningAreaId);
    if (!area || CLUSTER_OF_ELECTIVES_LEARNING_AREAS.includes(area.name)) continue;
    if (s.status === "LATE") late += 1;
    else submitted += 1;
  }

  // Cluster-elective rows: group by (class section, area, term) and compare
  // the group's row count against that class/section's configured target.
  const clusterGroups = new Map<string, { count: number; hasLate: boolean }>();
  for (const s of allSubmissions) {
    const area = learningAreaById.get(s.learningAreaId);
    if (!area || !CLUSTER_OF_ELECTIVES_LEARNING_AREAS.includes(area.name)) continue;
    const key = `${s.classSectionId}|${s.learningAreaId}|${s.termId}`;
    const entry = clusterGroups.get(key) ?? { count: 0, hasLate: false };
    entry.count += 1;
    if (s.status === "LATE") entry.hasLate = true;
    clusterGroups.set(key, entry);
  }
  for (const [key, { count, hasLate }] of clusterGroups) {
    const [csId, areaId] = key.split("|").map(Number);
    const cs = classSectionById.get(csId);
    const area = learningAreaById.get(areaId);
    if (!cs || !area) continue;
    const target = getClusterElectiveTarget(cs, area.name);
    if (target > 0 && count >= target) {
      if (hasLate) late += 1;
      else submitted += 1;
    }
  }

  // A class/section without electives enabled can never fill the JHS
  // elective learning areas; a Cluster of Electives area with no configured
  // target (0) can never be filled either — neither is a "possible" cell.
  const termMultiplier = termId ? 1 : TERM_COUNT;
  let possible = 0;
  for (const cs of classSections) {
    const areas = areasByGrade.get(cs.gradeLevel.gradeName) ?? [];
    for (const area of areas) {
      if (ELECTIVE_LEARNING_AREAS.includes(area.name) && !cs.hasElectives) continue;
      if (CLUSTER_OF_ELECTIVES_LEARNING_AREAS.includes(area.name) && getClusterElectiveTarget(cs, area.name) <= 0) {
        continue;
      }
      possible += termMultiplier;
    }
  }

  const notSubmitted = Math.max(0, possible - submitted - late);
  return { submitted, late, notSubmitted };
}

// Aggregate counts for the Status of Submission stat cards. ADMIN sees counts
// across all schools (or one, via ?schoolId=, or narrowed to one cluster via
// ?clusterId=); SCHOOL is always scoped to its own school; GRADE_CHAIRMAN is
// further scoped to just its one assigned grade level. ?termId= narrows to a
// single term.
export async function getAdminStats(req: Request, res: Response) {
  // Same trap as getStatusGrid above: SUPERVISOR must not fall into the
  // "not SCHOOL/GRADE_CHAIRMAN, so trust ?schoolId=/?clusterId=" branch below,
  // which was written back when ADMIN was the only other caller.
  if (req.user!.role === "SUPERVISOR") {
    return res.status(403).json({ message: "You do not have access to this resource" });
  }

  const termId = req.query.termId ? Number(req.query.termId) : undefined;
  const examType = isValidExamType(req.query.examType) ? req.query.examType : undefined;
  const documentType = isValidDocumentType(req.query.documentType) ? req.query.documentType : undefined;
  const filterSchoolId =
    req.user!.role === "SCHOOL" || req.user!.role === "GRADE_CHAIRMAN"
      ? req.user!.schoolId!
      : req.query.schoolId
      ? Number(req.query.schoolId)
      : undefined;
  const filterClusterId = req.query.clusterId ? Number(req.query.clusterId) : undefined;

  if (filterSchoolId) {
    const classSections = await prisma.classSection.findMany({
      where: {
        gradeLevel: {
          schoolId: filterSchoolId,
          ...(req.user!.role === "GRADE_CHAIRMAN" ? { id: { in: req.user!.gradeLevelIds } } : {}),
        },
      },
      include: { gradeLevel: true },
    });
    const classSectionIds = classSections.map((cs) => cs.id);
    const gradeNames = [...new Set(classSections.map((cs) => cs.gradeLevel.gradeName))];

    const { submitted, late, notSubmitted } = await getSubmissionCellCounts(
      classSectionIds,
      gradeNames,
      termId,
      examType,
      documentType
    );

    return res.json({ totalSchools: 1, notSubmitted, late, submitted });
  }

  const schoolWhere = filterClusterId ? { clusterId: filterClusterId } : {};
  const classSections = await prisma.classSection.findMany({
    where: { gradeLevel: { school: schoolWhere } },
    include: { gradeLevel: true },
  });
  const classSectionIds = classSections.map((cs) => cs.id);
  const gradeNames = [...new Set(classSections.map((cs) => cs.gradeLevel.gradeName))];

  const [totalSchools, { submitted, late, notSubmitted }] = await Promise.all([
    prisma.school.count({ where: schoolWhere }),
    getSubmissionCellCounts(classSectionIds, gradeNames, termId, examType, documentType),
  ]);

  res.json({ totalSchools, notSubmitted, late, submitted });
}

// Roster report for the Admin's "Status of Submission from Schools" view when
// more than one school is in scope (All Schools, or a whole Cluster): one row
// per school with its curriculum shape (grade levels + their learning areas)
// and a "Records" count of actually-submitted files for the selected term.
// When narrowed to exactly one school, the frontend uses the detailed
// per-class status-grid instead — this endpoint is only for the multi-school
// case, so it doesn't need per-class-section granularity.
export async function getSchoolsRoster(req: Request, res: Response) {
  const termId = Number(req.query.termId);
  if (!termId) {
    return res.status(400).json({ message: "termId is required" });
  }
  const clusterId = req.query.clusterId ? Number(req.query.clusterId) : undefined;
  const examType = isValidExamType(req.query.examType) ? req.query.examType : undefined;
  const documentType = isValidDocumentType(req.query.documentType) ? req.query.documentType : undefined;

  const schools = await prisma.school.findMany({
    where: clusterId ? { clusterId } : {},
    include: { cluster: true, gradeLevels: { include: { classSections: { orderBy: { id: "asc" } } } } },
    orderBy: { schoolName: "asc" },
  });

  const allLearningAreas = await prisma.learningArea.findMany();
  const learningAreasByGrade = new Map<string, { id: number; name: string }[]>();
  for (const la of allLearningAreas) {
    if (!learningAreasByGrade.has(la.grade)) learningAreasByGrade.set(la.grade, []);
    learningAreasByGrade.get(la.grade)!.push({ id: la.id, name: la.name });
  }

  const allClassSectionIds = schools.flatMap((s) => s.gradeLevels.flatMap((g) => g.classSections.map((cs) => cs.id)));
  const submissions = await prisma.submission.findMany({
    where: {
      classSectionId: { in: allClassSectionIds },
      termId,
      examType,
      documentType,
      status: { in: ["SUBMITTED", "LATE"] },
    },
    select: { classSectionId: true, learningAreaId: true, status: true },
  });
  const classSectionInfo = new Map<number, { schoolId: number; gradeName: string }>();
  for (const s of schools) {
    for (const g of s.gradeLevels) {
      for (const cs of g.classSections) classSectionInfo.set(cs.id, { schoolId: s.id, gradeName: g.gradeName });
    }
  }
  const recordsBySchool = new Map<number, number>();
  const submissionCountsByGradeLA = new Map<string, number>();
  const hasLateBySchool = new Map<number, boolean>();
  // Per-cell tallies (classSectionId|learningAreaId -> count/hasLate), needed
  // below to decide isComplete the same way isCellComplete() does on the
  // single-school drill-down: a Cluster of Electives cell needs its *count*
  // compared against a per-class target, every other area just needs any row
  // to exist at all.
  const cellTallies = new Map<string, { count: number; hasLate: boolean }>();
  for (const sub of submissions) {
    const info = classSectionInfo.get(sub.classSectionId);
    if (!info) continue;
    recordsBySchool.set(info.schoolId, (recordsBySchool.get(info.schoolId) ?? 0) + 1);
    const gradeLAKey = `${info.schoolId}|${info.gradeName}|${sub.learningAreaId}`;
    submissionCountsByGradeLA.set(gradeLAKey, (submissionCountsByGradeLA.get(gradeLAKey) ?? 0) + 1);
    if (sub.status === "LATE") hasLateBySchool.set(info.schoolId, true);
    const cellKey = `${sub.classSectionId}|${sub.learningAreaId}`;
    const entry = cellTallies.get(cellKey) ?? { count: 0, hasLate: false };
    entry.count += 1;
    if (sub.status === "LATE") entry.hasLate = true;
    cellTallies.set(cellKey, entry);
  }

  const roster = schools.map((school) => {
    const visibleGradeLevels = filterGradeLevelsForSchoolLevel(school.gradeLevels, school.schoolLevel).sort(
      (a, b) => a.gradeName.localeCompare(b.gradeName, undefined, { numeric: true })
    );

    // isComplete: every *applicable* (class section, learning area) cell for
    // this school has a filled submission -- same applicability rules as
    // uploadSubmission/getStatusGrid (a JHS elective area only counts for a
    // class with hasElectives on; a Cluster of Electives area only counts
    // once its per-class target is set, and "filled" there means count >=
    // target rather than "any row exists").
    let totalApplicable = 0;
    let filledApplicable = 0;
    for (const g of visibleGradeLevels) {
      const areas = learningAreasByGrade.get(g.gradeName) ?? [];
      for (const cs of g.classSections) {
        for (const area of areas) {
          const isElective = ELECTIVE_LEARNING_AREAS.includes(area.name);
          const isCluster = CLUSTER_OF_ELECTIVES_LEARNING_AREAS.includes(area.name);
          if (isElective && !cs.hasElectives) continue;
          const target = isCluster ? getClusterElectiveTarget(cs, area.name) : 0;
          if (isCluster && target <= 0) continue;

          totalApplicable += 1;
          const tally = cellTallies.get(`${cs.id}|${area.id}`);
          const filled = isCluster ? (tally?.count ?? 0) >= target : (tally?.count ?? 0) > 0;
          if (filled) filledApplicable += 1;
        }
      }
    }

    return {
      schoolId: school.id,
      schoolName: school.schoolName,
      schoolHeadName: school.schoolHeadName,
      clusterId: school.clusterId,
      clusterName: school.cluster.name,
      gradeLevels: visibleGradeLevels.map((g) => g.gradeName),
      gradeLevelLearningAreas: visibleGradeLevels.map((g) => {
        const areasWithSubmissions = (learningAreasByGrade.get(g.gradeName) ?? [])
          .map((la) => ({
            name: la.name,
            count: submissionCountsByGradeLA.get(`${school.id}|${g.gradeName}|${la.id}`) ?? 0,
          }))
          .filter((la) => la.count > 0);
        return {
          gradeName: g.gradeName,
          learningAreas: areasWithSubmissions.map((la) => `${la.name} (${la.count})`),
        };
      }),
      records: recordsBySchool.get(school.id) ?? 0,
      hasLateSubmission: hasLateBySchool.get(school.id) ?? false,
      isComplete: totalApplicable > 0 && filledApplicable === totalApplicable,
    };
  });

  res.json(roster);
}

// Read-only, division-wide flat listing of submitted files (LOA Result /
// Test Questionnaire / Table of Specifications) for a SUPERVISOR account's
// "Submissions" page — scoped by Learning Area *name*
// (User.assignedLearningAreas), not by school/grade, since a supervisor's
// remit is a subject, not an org unit. ?termId=/?examType=/?documentType=
// narrow further (all optional, like getSchoolsRoster/getAdminStats); ?learningAreaName=
// narrows to one of the supervisor's own assigned areas specifically (a name
// outside their assignment is silently treated as "none match" rather than
// erroring, since the dropdown that drives it is itself built from their own
// assignedLearningAreas — this can only happen via a hand-crafted request).
// Backs the Cluster/School filter dropdowns on the Supervisor's Submissions
// page — a Supervisor has no access to GET /schools (ADMIN-only, and returns
// far more than a filter dropdown needs: gradeLevels, classSections, the
// linked User's email). This returns just enough for that: id/schoolName/
// clusterId, ordered by name, same "purpose-built lighter endpoint" pattern
// as GET /supervisors/learning-areas.
export async function getSupervisorSchools(_req: Request, res: Response) {
  const schools = await prisma.school.findMany({
    select: { id: true, schoolName: true, clusterId: true },
    orderBy: { schoolName: "asc" },
  });
  res.json(schools);
}

export async function getSupervisorSubmissions(req: Request, res: Response) {
  const termId = req.query.termId ? Number(req.query.termId) : undefined;
  const examType = isValidExamType(req.query.examType) ? req.query.examType : undefined;
  const documentType = isValidDocumentType(req.query.documentType) ? req.query.documentType : undefined;
  const learningAreaNameFilter = typeof req.query.learningAreaName === "string" ? req.query.learningAreaName : undefined;
  const clusterId = req.query.clusterId ? Number(req.query.clusterId) : undefined;
  const schoolId = req.query.schoolId ? Number(req.query.schoolId) : undefined;

  const supervisor = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  const assignedAreas = supervisor?.assignedLearningAreas ?? [];

  const areaNames = learningAreaNameFilter
    ? assignedAreas.filter((name) => name === learningAreaNameFilter)
    : assignedAreas;

  if (areaNames.length === 0) {
    return res.json([]);
  }

  // schoolId narrows to one school; clusterId (when schoolId isn't set)
  // narrows to every school in that cluster — same mutually-exclusive
  // relationship as the ADMIN roster's Cluster/School filters on Status of
  // Submission (picking a School always wins over a Cluster selection).
  const gradeLevelWhere: Record<string, unknown> = {};
  if (schoolId) gradeLevelWhere.schoolId = schoolId;
  else if (clusterId) gradeLevelWhere.school = { clusterId };

  const submissions = await prisma.submission.findMany({
    where: {
      termId,
      examType,
      documentType,
      status: { in: ["SUBMITTED", "LATE"] },
      learningArea: { name: { in: areaNames } },
      ...(Object.keys(gradeLevelWhere).length > 0 && { classSection: { gradeLevel: gradeLevelWhere } }),
    },
    include: {
      learningArea: true,
      classSection: { include: { gradeLevel: { include: { school: true } } } },
    },
    orderBy: { id: "desc" },
  });

  res.json(
    submissions.map((s) => ({
      id: s.id,
      fileName: s.fileName,
      filePath: s.filePath,
      status: s.status,
      submittedAt: s.submittedAt,
      learningAreaName: s.learningArea.name,
      gradeName: s.classSection.gradeLevel.gradeName,
      className: s.classSection.className,
      schoolId: s.classSection.gradeLevel.schoolId,
      schoolName: s.classSection.gradeLevel.school.schoolName,
    }))
  );
}

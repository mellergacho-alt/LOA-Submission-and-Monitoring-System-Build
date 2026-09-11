import { Request, Response } from "express";
import { ExamType, DocumentType } from "@prisma/client";
import { prisma } from "../prisma";
import { isValidExamType } from "../utils/examTypes";
import { isValidDocumentType } from "../utils/documentTypes";
import { isValidFileTypeValue } from "../utils/fileTypes";

const TERM_NAMES = ["First", "Second", "Third"];

function getSchoolYearsWithTerms() {
  return prisma.schoolYear.findMany({
    include: { terms: { orderBy: { id: "asc" }, include: { examSchedules: true } } },
    orderBy: { label: "asc" },
  });
}

export async function listSchoolYears(_req: Request, res: Response) {
  res.json(await getSchoolYearsWithTerms());
}

// Adds a new School Year with its 3 terms (First/Second/Third) auto-created,
// all inactive by default — admin must explicitly activate it (or one of its
// terms) once ready, so adding a future year never disrupts the current one.
export async function createSchoolYear(req: Request, res: Response) {
  const { label } = req.body as { label?: string };
  if (!label || !label.trim()) {
    return res.status(400).json({ message: "School Year is required" });
  }

  const existing = await prisma.schoolYear.findUnique({ where: { label: label.trim() } });
  if (existing) {
    return res.status(400).json({ message: "This School Year already exists" });
  }

  await prisma.schoolYear.create({
    data: { label: label.trim(), terms: { create: TERM_NAMES.map((name) => ({ name })) } },
  });

  res.status(201).json(await getSchoolYearsWithTerms());
}

// Makes this School Year the active one (deactivating every other year) and,
// if it doesn't already have an active term of its own, defaults to First
// Term — a School Year can never be active with no active term, since that
// would leave schools with no writable period at all.
export async function activateSchoolYear(req: Request, res: Response) {
  const id = Number(req.params.id);
  const schoolYear = await prisma.schoolYear.findUnique({ where: { id }, include: { terms: true } });
  if (!schoolYear) return res.status(404).json({ message: "School Year not found" });

  const termToActivate =
    schoolYear.terms.find((t) => t.isActive) ??
    schoolYear.terms.find((t) => t.name === "First") ??
    schoolYear.terms[0];

  await prisma.$transaction([
    prisma.schoolYear.updateMany({ data: { isActive: false } }),
    prisma.schoolYear.update({ where: { id }, data: { isActive: true } }),
    prisma.term.updateMany({ data: { isActive: false } }),
    ...(termToActivate ? [prisma.term.update({ where: { id: termToActivate.id }, data: { isActive: true } })] : []),
  ]);

  res.json(await getSchoolYearsWithTerms());
}

// Makes this Term the active one and cascades its parent School Year to
// active too (deactivating every other year/term) — a Term can never be
// active while its own School Year isn't.
export async function activateTerm(req: Request, res: Response) {
  const id = Number(req.params.id);
  const term = await prisma.term.findUnique({ where: { id } });
  if (!term) return res.status(404).json({ message: "Term not found" });

  await prisma.$transaction([
    prisma.term.updateMany({ data: { isActive: false } }),
    prisma.term.update({ where: { id }, data: { isActive: true } }),
    prisma.schoolYear.updateMany({ data: { isActive: false } }),
    prisma.schoolYear.update({ where: { id: term.schoolYearId }, data: { isActive: true } }),
  ]);

  res.json(await getSchoolYearsWithTerms());
}

interface ExamScheduleInput {
  examType: string;
  documentType: string;
  required?: boolean;
  startDate?: string | null;
  deadline?: string | null;
  allowedFileTypes?: string[];
  allowLateSubmission?: boolean;
  enforceOrder?: boolean;
}

// Sets which of the 4 LOA Result types x 3 document types are required for
// this Term and their submission windows — global (applies to every school,
// not per-school). Body is the full set of rows to upsert; any (examType,
// documentType) pair omitted from the body is left untouched (so the
// frontend can send just the ones edited).
export async function updateExamSchedules(req: Request, res: Response) {
  const termId = Number(req.params.id);
  const { schedules } = req.body as { schedules?: ExamScheduleInput[] };

  const term = await prisma.term.findUnique({ where: { id: termId } });
  if (!term) return res.status(404).json({ message: "Term not found" });

  if (!Array.isArray(schedules)) {
    return res.status(400).json({ message: "schedules must be an array" });
  }

  for (const s of schedules) {
    if (!isValidExamType(s.examType)) {
      return res.status(400).json({ message: `Invalid exam type: ${s.examType}` });
    }
    if (!isValidDocumentType(s.documentType)) {
      return res.status(400).json({ message: `Invalid document type: ${s.documentType}` });
    }
    if (s.startDate && Number.isNaN(Date.parse(s.startDate))) {
      return res.status(400).json({ message: `Invalid start date for ${s.examType}` });
    }
    if (s.deadline && Number.isNaN(Date.parse(s.deadline))) {
      return res.status(400).json({ message: `Invalid deadline for ${s.examType}` });
    }
    if (s.allowedFileTypes !== undefined) {
      if (!Array.isArray(s.allowedFileTypes) || !s.allowedFileTypes.every(isValidFileTypeValue)) {
        return res.status(400).json({ message: `Invalid allowedFileTypes for ${s.examType}` });
      }
    }
  }

  await prisma.$transaction(
    schedules.map((s) =>
      prisma.examSchedule.upsert({
        where: {
          termId_examType_documentType: {
            termId,
            examType: s.examType as ExamType,
            documentType: s.documentType as DocumentType,
          },
        },
        update: {
          required: Boolean(s.required),
          startDate: s.startDate ? new Date(s.startDate) : null,
          deadline: s.deadline ? new Date(s.deadline) : null,
          allowedFileTypes: s.allowedFileTypes ?? [],
          allowLateSubmission: Boolean(s.allowLateSubmission),
          // Default true (not false) when omitted -- matches the column's own
          // default, which is the "ordering enforced" behavior every row had
          // before this field existed.
          enforceOrder: Boolean(s.enforceOrder ?? true),
        },
        create: {
          termId,
          examType: s.examType as ExamType,
          documentType: s.documentType as DocumentType,
          required: Boolean(s.required),
          startDate: s.startDate ? new Date(s.startDate) : null,
          deadline: s.deadline ? new Date(s.deadline) : null,
          allowedFileTypes: s.allowedFileTypes ?? [],
          allowLateSubmission: Boolean(s.allowLateSubmission),
          enforceOrder: Boolean(s.enforceOrder ?? true),
        },
      })
    )
  );

  res.json(await getSchoolYearsWithTerms());
}

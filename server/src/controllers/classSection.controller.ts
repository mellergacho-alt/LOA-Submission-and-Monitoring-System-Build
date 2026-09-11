import { Request, Response } from "express";
import { prisma } from "../prisma";
import { CLUSTER_OF_ELECTIVES_LEARNING_AREAS } from "../utils/grades";

// Keeps only known elective names with valid non-negative integer targets —
// silently drops anything else rather than erroring, since this is a plain
// object the client rebuilds and resends whole on every edit.
function sanitizeElectiveFileTargets(input: unknown): Record<string, number> {
  if (!input || typeof input !== "object") return {};
  const result: Record<string, number> = {};
  for (const [name, value] of Object.entries(input as Record<string, unknown>)) {
    if (!CLUSTER_OF_ELECTIVES_LEARNING_AREAS.includes(name)) continue;
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) result[name] = Math.floor(n);
  }
  return result;
}

// Accepts either a single className or a comma-separated list, per the
// Information Sheet ("separate each class name with a comma"). ADMIN can add
// classes to any school; SCHOOL accounts are restricted to their own school.
export async function createClassSections(req: Request, res: Response) {
  const { gradeLevelId, classNames } = req.body as {
    gradeLevelId: number;
    classNames: string;
  };

  const gradeLevel = await prisma.gradeLevel.findUnique({ where: { id: Number(gradeLevelId) } });
  if (!gradeLevel) {
    return res.status(404).json({ message: "Grade level not found" });
  }
  if (req.user!.role === "SCHOOL" && req.user!.schoolId !== gradeLevel.schoolId) {
    return res.status(403).json({ message: "You can only manage your own school's classes" });
  }

  const names = classNames
    .split(",")
    .map((n: string) => n.trim())
    .filter(Boolean);

  const created = await prisma.$transaction(
    names.map((className: string) =>
      prisma.classSection.create({
        data: { gradeLevelId: Number(gradeLevelId), className },
      })
    )
  );

  res.status(201).json(created);
}

// Updates a class/section's "With Electives" flag (Grade 7-10, see
// ELECTIVE_LEARNING_AREAS) and/or its Cluster of Electives file targets
// (Grade 11-12, see CLUSTER_OF_ELECTIVES_LEARNING_AREAS) — each field is
// only sent/applied when the caller includes it, so the two concerns can be
// edited independently from School Profile. ADMIN can update any school's
// classes; SCHOOL accounts are restricted to their own.
export async function updateClassSection(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { hasElectives, electiveFileTargets } = req.body as {
    hasElectives?: boolean;
    electiveFileTargets?: Record<string, number>;
  };

  const classSection = await prisma.classSection.findUnique({
    where: { id },
    include: { gradeLevel: true },
  });
  if (!classSection) {
    return res.status(404).json({ message: "Class section not found" });
  }
  if (req.user!.role === "SCHOOL" && req.user!.schoolId !== classSection.gradeLevel.schoolId) {
    return res.status(403).json({ message: "You can only manage your own school's classes" });
  }

  const data: { hasElectives?: boolean; electiveFileTargets?: Record<string, number> } = {};
  if (hasElectives !== undefined) data.hasElectives = Boolean(hasElectives);
  if (electiveFileTargets !== undefined) data.electiveFileTargets = sanitizeElectiveFileTargets(electiveFileTargets);

  const updated = await prisma.classSection.update({ where: { id }, data });
  res.json(updated);
}

// Deletes one class/section (and, via cascade, any of its submissions).
// ADMIN can delete from any school; SCHOOL accounts are restricted to their
// own school's classes.
export async function deleteClassSection(req: Request, res: Response) {
  const id = Number(req.params.id);

  const classSection = await prisma.classSection.findUnique({
    where: { id },
    include: { gradeLevel: true },
  });
  if (!classSection) {
    return res.status(404).json({ message: "Class section not found" });
  }
  if (req.user!.role === "SCHOOL" && req.user!.schoolId !== classSection.gradeLevel.schoolId) {
    return res.status(403).json({ message: "You can only manage your own school's classes" });
  }

  await prisma.classSection.delete({ where: { id } });
  res.status(204).send();
}

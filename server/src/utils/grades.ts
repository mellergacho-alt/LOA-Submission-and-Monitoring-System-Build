import { SchoolLevel } from "@prisma/client";
import { prisma } from "../prisma";

// Grade levels applicable per School Level, per the Information Sheet.
export const GRADES_BY_LEVEL: Record<SchoolLevel, string[]> = {
  ES: ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"],
  JHS: ["Grade 7", "Grade 8", "Grade 9", "Grade 10"],
  JHS_SHS: ["Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"],
  SHS: ["Grade 11", "Grade 12"],
};

// Learning areas gated behind a ClassSection's "With Electives" flag.
// Only meaningful for Grade 7-10 — those grades' learning-area lists always
// include these two names (see prisma/seed.ts), other grades never do.
export const ELECTIVE_LEARNING_AREAS = ["Creative Tech (Elective)", "Research (Elective)"];

// SHS "Cluster of Electives" learning areas (Grade 11-12 only, see
// prisma/seed.ts). Unlike ELECTIVE_LEARNING_AREAS these are not gated by a
// per-class toggle — every Grade 11/12 class/section gets all four — but
// each one accepts multiple files, capped by a per-class/section target the
// school configures in ClassSection.electiveFileTargets (School Profile).
// A target of 0 (unset) means uploads are blocked until the school sets one.
export const CLUSTER_OF_ELECTIVES_LEARNING_AREAS = ["Academic Cluster", "Business and Entrep", "STEM", "TechPro"];

export function getClusterElectiveTarget(classSection: { electiveFileTargets: unknown }, areaName: string): number {
  const targets = (classSection.electiveFileTargets ?? {}) as Record<string, number>;
  const value = Number(targets[areaName] ?? 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

// A school can carry GradeLevel rows left over from a previous schoolLevel
// (kept on purpose when the level changes, so class sections/submissions are
// never silently deleted). Displayed grade levels should still only show the
// ones applicable to the school's *current* level.
export function filterGradeLevelsForSchoolLevel<T extends { gradeName: string }>(
  gradeLevels: T[],
  schoolLevel: SchoolLevel
): T[] {
  const applicable = new Set(GRADES_BY_LEVEL[schoolLevel]);
  return gradeLevels.filter((g) => applicable.has(g.gradeName));
}

// Natural-sort by grade number ("Grade 2" before "Grade 10"), not a plain
// alphabetical sort -- same numeric localeCompare technique already used ad
// hoc elsewhere for grade ordering (e.g. getSchoolsRoster).
export function sortGradeNames(names: string[]): string[] {
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

// Resolves a GRADE_CHAIRMAN's gradeLevelIds (a plain scalar array, not a
// Prisma relation -- see User.gradeLevelIds in schema.prisma) to display
// names, sorted by grade number. Returns [] without a DB round-trip for an
// empty/no input.
export async function resolveGradeNames(gradeLevelIds: number[]): Promise<string[]> {
  if (gradeLevelIds.length === 0) return [];
  const rows = await prisma.gradeLevel.findMany({ where: { id: { in: gradeLevelIds } }, select: { gradeName: true } });
  return sortGradeNames(rows.map((r) => r.gradeName));
}

import path from "path";

// The fixed set of extensions an admin can restrict a submission window to
// -- see ExamSchedule.allowedFileTypes in schema.prisma. No "others"/catch-
// all value (removed 2026-08-28, explicit user request) -- the list is
// exhaustive; a file must match one of these exactly once a schedule has
// any restriction configured at all.
export const FILE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "pdf", label: "PDF" },
  { value: "doc", label: "DOC" },
  { value: "docx", label: "DOCX" },
  { value: "xls", label: "XLS" },
  { value: "xlsx", label: "XLSX" },
];

const FILE_TYPE_VALUES = new Set(FILE_TYPE_OPTIONS.map((o) => o.value));

export function isValidFileTypeValue(value: unknown): value is string {
  return typeof value === "string" && FILE_TYPE_VALUES.has(value);
}

// Empty allowedFileTypes means "no restriction configured" -- every
// pre-existing ExamSchedule row defaults to this, so this is purely an
// opt-in extra validation layer, not retroactively enforced.
export function isFileTypeAllowed(fileName: string, allowedFileTypes: string[]): boolean {
  if (allowedFileTypes.length === 0) return true;
  const ext = path.extname(fileName).slice(1).toLowerCase();
  return allowedFileTypes.includes(ext);
}

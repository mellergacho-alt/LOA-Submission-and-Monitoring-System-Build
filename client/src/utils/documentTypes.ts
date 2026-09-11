import type { DocumentType } from "../types/api";

// The 3 fixed document types, in display order. A school submits each of
// these separately per Learning Area / Class-Section / Term / ExamType.
// Single shared source so every page's Document Type picker stays in sync --
// avoids repeating the copy-paste-per-page pattern EXAM_TYPES already has.
// `slug` is also the single source of truth for each type's route segment
// under /loa-submission/* and /status/* (see App.tsx and Sidebar.tsx).
export const DOCUMENT_TYPES: { value: DocumentType; label: string; slug: string }[] = [
  { value: "TABLE_OF_SPECIFICATIONS", label: "Table of Specifications", slug: "table-of-specifications" },
  { value: "TEST_QUESTIONNAIRE", label: "Test Questionnaire", slug: "test-questionnaire" },
  { value: "LOA_RESULT", label: "LOA Result", slug: "loa-result" },
];

export function documentTypeLabel(value: DocumentType): string {
  return DOCUMENT_TYPES.find((d) => d.value === value)!.label;
}

import { DocumentType } from "@prisma/client";

// The 3 fixed document types, in display order. A school submits each of
// these separately per Learning Area / Class-Section / Term / ExamType — see
// the DocumentType enum and ExamSchedule model in schema.prisma.
export const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: "TABLE_OF_SPECIFICATIONS", label: "Table of Specifications" },
  { value: "TEST_QUESTIONNAIRE", label: "Test Questionnaire" },
  { value: "LOA_RESULT", label: "LOA Result" },
];

const DOCUMENT_TYPE_VALUES = new Set(DOCUMENT_TYPES.map((d) => d.value));

export function isValidDocumentType(value: unknown): value is DocumentType {
  return typeof value === "string" && DOCUMENT_TYPE_VALUES.has(value as DocumentType);
}

export function documentTypeLabel(value: DocumentType): string {
  return DOCUMENT_TYPES.find((d) => d.value === value)!.label;
}

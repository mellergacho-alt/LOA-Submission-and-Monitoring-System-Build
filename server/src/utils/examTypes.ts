import { ExamType } from "@prisma/client";

// The 4 fixed LOA Result types, in display order. A school submits each of
// these separately per Learning Area / Class-Section / Term — see the
// ExamType enum and ExamSchedule model in schema.prisma.
export const EXAM_TYPES: { value: ExamType; label: string }[] = [
  { value: "DIAGNOSTIC_TEST", label: "Diagnostic Test" },
  { value: "SUMMATIVE_TEST_1", label: "Summative Test 1" },
  { value: "SUMMATIVE_TEST_2", label: "Summative Test 2" },
  { value: "END_OF_TERM_EXAM", label: "End of Term Exam" },
];

const EXAM_TYPE_VALUES = new Set(EXAM_TYPES.map((e) => e.value));

export function isValidExamType(value: unknown): value is ExamType {
  return typeof value === "string" && EXAM_TYPE_VALUES.has(value as ExamType);
}

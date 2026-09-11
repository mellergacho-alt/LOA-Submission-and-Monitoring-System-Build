import type { SubmissionStatus } from "../types/api";

const STATUS_CONFIG: Record<SubmissionStatus, { label: string; tone: "green" | "amber" | "red" }> = {
  SUBMITTED: { label: "Submitted", tone: "green" },
  LATE: { label: "Late", tone: "red" },
  NOT_SUBMITTED: { label: "Not Submitted", tone: "amber" },
};

export default function StatusPill({ status }: { status: SubmissionStatus }) {
  const { label, tone } = STATUS_CONFIG[status];
  return <span className={`pill pill--${tone}`}>{label}</span>;
}

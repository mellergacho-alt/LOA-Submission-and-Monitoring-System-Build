import { Fragment, useEffect, useRef, useState } from "react";
import AppLayout, { PageHeader } from "../layouts/AppLayout";
import Modal from "../components/Modal";
import { SkeletonTable } from "../components/Skeleton";
import { api } from "../api/client";
import type { DocumentType, ExamType, SchoolYear, Term } from "../types/api";
import { DOCUMENT_TYPES, documentTypeLabel } from "../utils/documentTypes";
import { CalendarIcon, ChevronDownIcon } from "../icons/Icons";
import { showSuccess } from "../utils/alerts";
import "../styles/forms.css";

const EXAM_TYPES: { value: ExamType; label: string }[] = [
  { value: "DIAGNOSTIC_TEST", label: "Diagnostic Test" },
  { value: "SUMMATIVE_TEST_1", label: "Summative Test 1" },
  { value: "SUMMATIVE_TEST_2", label: "Summative Test 2" },
  { value: "END_OF_TERM_EXAM", label: "End of Term Exam" },
];

// Kept in sync by hand with server/src/utils/fileTypes.ts's FILE_TYPE_OPTIONS
// — same "independent constants in two files" convention used throughout
// this codebase (e.g. Supervisor's Assigned Learning Area groupings vs.
// LOASubmissionPage's own elective lists). No "others" catch-all (removed
// 2026-08-28, explicit user request) — the list is exhaustive.
const FILE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "pdf", label: "PDF" },
  { value: "doc", label: "DOC" },
  { value: "docx", label: "DOCX" },
  { value: "xls", label: "XLS" },
  { value: "xlsx", label: "XLSX" },
];

// Purely visual, per explicit request -- lets an admin tell the 3 document
// types apart at a glance (tab + its content panel share the same tint)
// rather than by label text alone. Reuses the app's existing accent/status
// palette (the same purple/blue/green already used by .btn--primary/--blue/
// --green and the pill--blue/pill--green variants) rather than introducing
// new one-off hues, per explicit follow-up request to stay "consistent to
// the color scheme of this system" -- the first attempt (pink/sky-blue/
// yellow) didn't match anything else in the app.
const DOCUMENT_TYPE_THEME: Record<DocumentType, { bg: string; color: string }> = {
  TABLE_OF_SPECIFICATIONS: { bg: "var(--accent-purple-light)", color: "var(--accent-purple-dark)" },
  TEST_QUESTIONNAIRE: { bg: "var(--accent-blue-light)", color: "var(--accent-blue)" },
  LOA_RESULT: { bg: "var(--status-green-bg)", color: "var(--status-green)" },
};

type ExamDraft = Record<
  DocumentType,
  Record<
    ExamType,
    { required: boolean; startDate: string; deadline: string; allowedFileTypes: string[]; allowLateSubmission: boolean }
  >
>;

function emptyExamDraft(): ExamDraft {
  return Object.fromEntries(
    DOCUMENT_TYPES.map((d) => [
      d.value,
      Object.fromEntries(
        EXAM_TYPES.map((e) => [
          e.value,
          { required: false, startDate: "", deadline: "", allowedFileTypes: [] as string[], allowLateSubmission: false },
        ])
      ),
    ])
  ) as unknown as ExamDraft;
}

// One value per document type, not per (document type, exam type) -- true
// (matching ExamSchedule.enforceOrder's own column default) means the 4 Exam
// Types can only be marked Required in order for that document type; false
// lifts that restriction entirely for it. Written identically onto all 4 of
// that document type's rows on save (see saveExamSchedule).
type EnforceOrderDraft = Record<DocumentType, boolean>;

function emptyEnforceOrderDraft(): EnforceOrderDraft {
  return Object.fromEntries(DOCUMENT_TYPES.map((d) => [d.value, true])) as EnforceOrderDraft;
}

// The "Required" unlock order (Diagnostic Test -> Summative Test 1 ->
// Summative Test 2 -> End of Term Exam) is independent per document type
// (changed 2026-09-11, explicit admin request -- previously shared/coupled
// across all 3 document types, e.g. Test Questionnaire's Summative Test 1
// used to unlock as soon as *any* document type had Diagnostic Test
// required; now each document type's own EnforceOrder toggle and its own
// previously-required exam type govern it, checked in isolation from the
// other 2 document types). When that document type's `enforceOrder` is off,
// there is no restriction at all -- every exam type is always unlocked.
function isExamTypeUnlocked(
  draft: ExamDraft,
  documentType: DocumentType,
  examTypeIndex: number,
  enforceOrder: boolean
): boolean {
  if (!enforceOrder) return true;
  if (examTypeIndex === 0) return true;
  const previous = EXAM_TYPES[examTypeIndex - 1].value;
  return draft[documentType][previous].required;
}

// Both Start of Submission and Deadline carry a specific time of day (added
// 2026-09-01, explicit admin request -- Deadline first, then Start of
// Submission the same day for consistency between the two), so both use
// <input type="datetime-local">, which wants YYYY-MM-DDTHH:mm in the
// *viewer's local time*. That can't be read off the ISO string with naive
// slicing (which would read UTC components straight off the string) -- it
// has to go through a real Date object's local getters, or an admin in a
// timezone behind/ahead of UTC would see the wrong day, not just the wrong
// time.
function toDateTimeInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// The reverse: a datetime-local value has no timezone of its own, so the
// browser parses it as the *local* wall-clock time of whoever is filling in
// the form -- exactly what's wanted here (the admin picks a time meaningful
// to them). .toISOString() then converts that to an absolute UTC instant
// before it goes over the wire, so the backend's own new Date(...) parse
// (schoolYear.controller.ts's updateExamSchedules) lands on the same real
// moment in time regardless of which timezone the server process happens to
// run in -- sending the naive local string as-is would only work by
// coincidence if client and server share a timezone.
function fromDateTimeInputValue(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

// Shared summary display for both halves of the collapsed table row's
// "Submission Window" column -- showing either as a bare date would
// silently hide the exact time an admin just went out of their way to set.
function formatDateTimeDisplay(iso: string | null): string {
  if (!iso) return "any";
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// A "drill-down" multi-select for Accepted File Types — a compact trigger
// button (summarizing the current selection) that expands a checkbox menu,
// instead of always-visible checkboxes taking up permanent space in the
// card. Self-contained (owns its own open/close state + outside-click-to-
// close), same interaction pattern as Sidebar.tsx's SidebarAccountMenu.
function FileTypeDropdown({
  selected,
  onToggle,
  disabled,
}: {
  selected: string[];
  onToggle: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // A disabled trigger should never leave a stale menu open behind it (e.g.
  // if its card's Required checkbox gets unchecked while the menu is open).
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const summary =
    selected.length === 0
      ? "No restriction (any type)"
      : FILE_TYPE_OPTIONS.filter((o) => selected.includes(o.value))
          .map((o) => o.label)
          .join(", ");

  return (
    <div className="filetype-dropdown" ref={containerRef}>
      <button
        type="button"
        className="filetype-dropdown__trigger"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="filetype-dropdown__summary">{summary}</span>
        <ChevronDownIcon
          className={open ? "filetype-dropdown__chevron filetype-dropdown__chevron--open" : "filetype-dropdown__chevron"}
        />
      </button>
      {open && (
        <div className="filetype-dropdown__menu">
          {FILE_TYPE_OPTIONS.map((opt) => (
            <label key={opt.value} className="filetype-dropdown__item">
              <input type="checkbox" checked={selected.includes(opt.value)} onChange={() => onToggle(opt.value)} />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SchoolYearTermPage() {
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [newYearLabel, setNewYearLabel] = useState("");
  const [addingYear, setAddingYear] = useState(false);
  const [yearError, setYearError] = useState<string | null>(null);
  const [yearActionBusyKey, setYearActionBusyKey] = useState<string | null>(null);

  const [examEditTermId, setExamEditTermId] = useState<number | null>(null);
  const [examDraft, setExamDraft] = useState<ExamDraft>(emptyExamDraft());
  const [enforceOrderDraft, setEnforceOrderDraft] = useState<EnforceOrderDraft>(emptyEnforceOrderDraft());
  const [activeDocTab, setActiveDocTab] = useState<DocumentType>(DOCUMENT_TYPES[0].value);
  const [examSaving, setExamSaving] = useState(false);
  const [examError, setExamError] = useState<string | null>(null);

  function reloadSchoolYears() {
    return api.get<SchoolYear[]>("/school-years").then((res) => setSchoolYears(res.data));
  }

  useEffect(() => {
    reloadSchoolYears().finally(() => setLoading(false));
  }, []);

  async function handleAddYear(e: React.FormEvent) {
    e.preventDefault();
    setYearError(null);
    setAddingYear(true);
    try {
      const res = await api.post<SchoolYear[]>("/school-years", { label: newYearLabel });
      setSchoolYears(res.data);
      setNewYearLabel("");
      showSuccess("School Year added");
    } catch (err: any) {
      setYearError(err?.response?.data?.message ?? "Failed to add School Year");
    } finally {
      setAddingYear(false);
    }
  }

  async function handleActivateYear(id: number) {
    setYearError(null);
    setYearActionBusyKey(`year-${id}`);
    try {
      const res = await api.patch<SchoolYear[]>(`/school-years/${id}/activate`);
      setSchoolYears(res.data);
      showSuccess("Active School Year updated");
    } catch (err: any) {
      setYearError(err?.response?.data?.message ?? "Failed to set active School Year");
    } finally {
      setYearActionBusyKey(null);
    }
  }

  async function handleActivateTerm(id: number) {
    setYearError(null);
    setYearActionBusyKey(`term-${id}`);
    try {
      const res = await api.patch<SchoolYear[]>(`/school-years/terms/${id}/activate`);
      setSchoolYears(res.data);
      showSuccess("Active Term updated");
    } catch (err: any) {
      setYearError(err?.response?.data?.message ?? "Failed to set active Term");
    } finally {
      setYearActionBusyKey(null);
    }
  }

  function openExamEditor(term: Term) {
    const draft = emptyExamDraft();
    const enforceOrder = emptyEnforceOrderDraft();
    for (const schedule of term.examSchedules) {
      draft[schedule.documentType][schedule.examType] = {
        required: schedule.required,
        startDate: toDateTimeInputValue(schedule.startDate),
        deadline: toDateTimeInputValue(schedule.deadline),
        allowedFileTypes: schedule.allowedFileTypes ?? [],
        allowLateSubmission: schedule.allowLateSubmission ?? false,
      };
      // All 4 of a document type's rows are always saved with the same
      // enforceOrder value (see saveExamSchedule), so whichever row is seen
      // last here wins -- harmless either way.
      enforceOrder[schedule.documentType] = schedule.enforceOrder ?? true;
    }
    setExamDraft(draft);
    setEnforceOrderDraft(enforceOrder);
    setActiveDocTab(DOCUMENT_TYPES[0].value);
    setExamEditTermId(term.id);
    setExamError(null);
  }

  function closeExamEditor() {
    setExamEditTermId(null);
    setExamError(null);
  }

  function toggleAllowedFileType(documentType: DocumentType, examType: ExamType, value: string) {
    setExamDraft((prev) => {
      const current = prev[documentType][examType].allowedFileTypes;
      return {
        ...prev,
        [documentType]: {
          ...prev[documentType],
          [examType]: {
            ...prev[documentType][examType],
            allowedFileTypes: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
          },
        },
      };
    });
  }

  async function saveExamSchedule(termId: number) {
    setExamSaving(true);
    setExamError(null);
    try {
      const schedules = DOCUMENT_TYPES.flatMap((d) =>
        EXAM_TYPES.map((e) => ({
          examType: e.value,
          documentType: d.value,
          required: examDraft[d.value][e.value].required,
          startDate: fromDateTimeInputValue(examDraft[d.value][e.value].startDate),
          deadline: fromDateTimeInputValue(examDraft[d.value][e.value].deadline),
          allowedFileTypes: examDraft[d.value][e.value].allowedFileTypes,
          allowLateSubmission: examDraft[d.value][e.value].allowLateSubmission,
          // Same value on all 4 of this document type's rows -- see
          // EnforceOrderDraft's own comment for why this isn't a dedicated
          // per-(document type) table instead.
          enforceOrder: enforceOrderDraft[d.value],
        }))
      );
      const res = await api.patch<SchoolYear[]>(`/school-years/terms/${termId}/exam-schedules`, { schedules });
      setSchoolYears(res.data);
      setExamEditTermId(null);
      showSuccess("Submission schedule saved");
    } catch (err: any) {
      setExamError(err?.response?.data?.message ?? "Failed to save submission schedule");
    } finally {
      setExamSaving(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Department of Education, Division of Guihulngan City"
        title="School Year & Term"
        subtitle="ADD SCHOOL YEARS, TERMS, AND SUBMISSION WINDOWS"
      />

      <div className="card-stack">
        <div className="card">
          <h2 className="heading section-title">School Year &amp; Term</h2>
          <div className="section-subtitle">
            Add each School Year once; three terms (First, Second, Third) are created for it automatically. Set
            one School Year and one Term as active — that's the only period schools can upload or edit against
            on Submission Form; every other year/term is view-only for them.
          </div>

          <form onSubmit={handleAddYear}>
            <div style={{ padding: "0 26px", display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
              <div className="form-field" style={{ flex: "0 0 220px" }}>
                <label>Add School Year</label>
                <input
                  value={newYearLabel}
                  onChange={(e) => setNewYearLabel(e.target.value)}
                  placeholder="e.g. 2027-2028"
                  required
                />
              </div>
              <button className="btn btn--primary" type="submit" disabled={addingYear} style={{ marginBottom: 1 }}>
                <CalendarIcon /> {addingYear ? "Adding..." : "Add School Year"}
              </button>
            </div>

            {yearError && (
              <div style={{ padding: "16px 26px 0", color: "var(--status-red)", fontSize: 13, fontWeight: 600 }}>
                {yearError}
              </div>
            )}
          </form>

          <div style={{ padding: "20px 26px 26px", overflowX: "auto" }}>
            {loading ? (
              <SkeletonTable columns={6} />
            ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>School Year</th>
                  <th>Term</th>
                  <th>Status</th>
                  <th>Submissions Required</th>
                  <th>Submission Window</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {schoolYears.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ color: "var(--text-secondary)" }}>
                      No School Year added yet.
                    </td>
                  </tr>
                )}
                {schoolYears.map((sy) => (
                  <Fragment key={sy.id}>
                    <tr>
                      <td colSpan={2}>
                        <strong>{sy.label}</strong>
                      </td>
                      <td>{sy.isActive && <span className="pill pill--green">Active Year</span>}</td>
                      <td />
                      <td />
                      <td>
                        {!sy.isActive && (
                          <button
                            type="button"
                            className="btn btn--ghost"
                            style={{ padding: "6px 12px", fontSize: 11.5 }}
                            disabled={yearActionBusyKey === `year-${sy.id}`}
                            onClick={() => handleActivateYear(sy.id)}
                          >
                            Set as Active Year
                          </button>
                        )}
                      </td>
                    </tr>
                    {sy.terms.map((t) => {
                      // Sorted by DOCUMENT_TYPES' declared order (then EXAM_TYPES') rather than
                      // left in whatever order the DB happens to return -- Prisma/Postgres give no
                      // ordering guarantee on a plain `include`, so without this the pills could
                      // appear in a different order per page load/reload.
                      const requiredSchedules = t.examSchedules
                        .filter((s) => s.required)
                        .slice()
                        .sort((a, b) => {
                          const docDiff =
                            DOCUMENT_TYPES.findIndex((d) => d.value === a.documentType) -
                            DOCUMENT_TYPES.findIndex((d) => d.value === b.documentType);
                          if (docDiff !== 0) return docDiff;
                          return (
                            EXAM_TYPES.findIndex((e) => e.value === a.examType) -
                            EXAM_TYPES.findIndex((e) => e.value === b.examType)
                          );
                        });
                      return (
                        <Fragment key={t.id}>
                          <tr>
                            <td />
                            <td>{t.name} Term</td>
                            <td>{t.isActive && <span className="pill pill--green">Active</span>}</td>
                            <td>
                              {requiredSchedules.length === 0 ? (
                                <span style={{ color: "var(--text-muted)" }}>None set</span>
                              ) : (
                                <div className="class-chip-list">
                                  {requiredSchedules.map((s) => (
                                    <span key={`${s.documentType}-${s.examType}`} className="pill pill--slate">
                                      {documentTypeLabel(s.documentType)} · {EXAM_TYPES.find((e) => e.value === s.examType)?.label}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td>
                              {requiredSchedules.length === 0 ? (
                                "—"
                              ) : (
                                requiredSchedules.map((s) => (
                                  <div key={`${s.documentType}-${s.examType}`} style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
                                    {formatDateTimeDisplay(s.startDate)} → {formatDateTimeDisplay(s.deadline)}
                                  </div>
                                ))
                              )}
                            </td>
                            <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {!t.isActive && (
                                <button
                                  type="button"
                                  className="btn btn--ghost"
                                  style={{ padding: "6px 12px", fontSize: 11.5 }}
                                  disabled={yearActionBusyKey === `term-${t.id}`}
                                  onClick={() => handleActivateTerm(t.id)}
                                >
                                  Set as Active Term
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn btn--ghost"
                                style={{ padding: "6px 12px", fontSize: 11.5 }}
                                onClick={() => openExamEditor(t)}
                              >
                                Edit Submission Schedules
                              </button>
                            </td>
                          </tr>
                          {examEditTermId === t.id && (
                            <Modal title={`Edit Submission Schedules — ${sy.label}, ${t.name} Term`} onClose={closeExamEditor} size="lg">
                              <div className="section-subtitle">
                                For each document type and LOA Result period, set whether it's required this Term,
                                its optional submission window, and which file types schools may upload for it.
                                Leaving Accepted File Types blank means no restriction — any file type is accepted.
                              </div>

                              <div style={{ display: "flex", justifyContent: "center", gap: 8, margin: "0 26px" }}>
                                {DOCUMENT_TYPES.map((d) => {
                                  const theme = DOCUMENT_TYPE_THEME[d.value];
                                  const isActive = activeDocTab === d.value;
                                  return (
                                    <button
                                      key={d.value}
                                      type="button"
                                      style={{
                                        flex: "1 1 0",
                                        maxWidth: 260,
                                        padding: "7px 14px",
                                        fontSize: 12.5,
                                        fontWeight: 700,
                                        fontFamily: "var(--font-display)",
                                        letterSpacing: "0.03em",
                                        textTransform: "uppercase",
                                        borderRadius: "8px 8px 0 0",
                                        border: `1px solid ${theme.color}`,
                                        background: isActive ? theme.color : theme.bg,
                                        color: isActive ? "#fff" : theme.color,
                                      }}
                                      onClick={() => setActiveDocTab(d.value)}
                                    >
                                      {d.label}
                                    </button>
                                  );
                                })}
                              </div>

                              <div
                                style={{
                                  background: DOCUMENT_TYPE_THEME[activeDocTab].bg,
                                  border: `1px solid ${DOCUMENT_TYPE_THEME[activeDocTab].color}`,
                                  borderRadius: "0 8px 8px 8px",
                                  padding: 10,
                                  margin: "0 26px 12px",
                                }}
                              >
                              <label className="toggle-switch" style={{ marginBottom: 10 }}>
                                <input
                                  type="checkbox"
                                  checked={enforceOrderDraft[activeDocTab]}
                                  onChange={(ev) =>
                                    setEnforceOrderDraft((prev) => ({ ...prev, [activeDocTab]: ev.target.checked }))
                                  }
                                />
                                <span className="toggle-switch__track">
                                  <span className="toggle-switch__thumb" />
                                </span>
                                Enforce Sequential Order for {documentTypeLabel(activeDocTab)}
                              </label>
                              <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginBottom: 10 }}>
                                {enforceOrderDraft[activeDocTab]
                                  ? "On: the 4 Exam Types below can only be marked Required in order (Diagnostic Test → Summative Test 1 → Summative Test 2 → End of Term Exam)."
                                  : "Off: any of the 4 Exam Types below can be marked Required in any combination or order."}
                              </div>
                              <div className="examresult-grid">
                                {EXAM_TYPES.map((e, index) => {
                                  const isRequired = examDraft[activeDocTab][e.value].required;
                                  // Required can only be turned ON in order (Diagnostic Test ->
                                  // Summative Test 1 -> Summative Test 2 -> End of Term Exam), and only
                                  // while this document type's own "Enforce Sequential Order" toggle
                                  // (above) is on -- explicit admin request, 2026-09-01 (order rule),
                                  // 2026-09-04 (shared across document types), 2026-09-11 (made
                                  // per-document-type and given an on/off toggle, no longer shared) --
                                  // see isExamTypeUnlocked() above. This only ever blocks *checking* the
                                  // box: once checked, unchecking is
                                  // always free (no cascade to the ones after it) -- so the checkbox
                                  // is only disabled while it's currently unchecked and no document
                                  // type has its predecessor required yet; an already-required card
                                  // (even one loaded from data set outside this order, e.g. directly
                                  // via the API) never gets locked out of being unchecked.
                                  const previousRequired = isExamTypeUnlocked(
                                    examDraft,
                                    activeDocTab,
                                    index,
                                    enforceOrderDraft[activeDocTab]
                                  );
                                  const checkboxDisabled = !isRequired && !previousRequired;
                                  return (
                                    <div key={e.value} className="examresult-card">
                                      <div className="examresult-card__header">
                                        <span className="examresult-card__title">{e.label}</span>
                                        <label className="examresult-card__required">
                                          <input
                                            type="checkbox"
                                            checked={isRequired}
                                            disabled={checkboxDisabled}
                                            title={
                                              checkboxDisabled
                                                ? `${EXAM_TYPES[index - 1].label} must be required first`
                                                : undefined
                                            }
                                            onChange={(ev) =>
                                              setExamDraft((prev) => ({
                                                ...prev,
                                                [activeDocTab]: {
                                                  ...prev[activeDocTab],
                                                  [e.value]: { ...prev[activeDocTab][e.value], required: ev.target.checked },
                                                },
                                              }))
                                            }
                                          />
                                          Required
                                        </label>
                                      </div>

                                      <div className="examresult-card__dates">
                                        <div className="form-field">
                                          <label>Start of Submission</label>
                                          <input
                                            type="datetime-local"
                                            value={examDraft[activeDocTab][e.value].startDate}
                                            disabled={!isRequired}
                                            onChange={(ev) =>
                                              setExamDraft((prev) => ({
                                                ...prev,
                                                [activeDocTab]: {
                                                  ...prev[activeDocTab],
                                                  [e.value]: { ...prev[activeDocTab][e.value], startDate: ev.target.value },
                                                },
                                              }))
                                            }
                                          />
                                        </div>
                                        <div className="form-field">
                                          <label>Deadline</label>
                                          <input
                                            type="datetime-local"
                                            value={examDraft[activeDocTab][e.value].deadline}
                                            disabled={!isRequired}
                                            onChange={(ev) =>
                                              setExamDraft((prev) => ({
                                                ...prev,
                                                [activeDocTab]: {
                                                  ...prev[activeDocTab],
                                                  [e.value]: { ...prev[activeDocTab][e.value], deadline: ev.target.value },
                                                },
                                              }))
                                            }
                                          />
                                        </div>
                                      </div>

                                      <div className="form-field">
                                        <label>Accepted File Types</label>
                                        <FileTypeDropdown
                                          selected={examDraft[activeDocTab][e.value].allowedFileTypes}
                                          onToggle={(value) => toggleAllowedFileType(activeDocTab, e.value, value)}
                                          disabled={!isRequired}
                                        />
                                      </div>

                                      <label className="toggle-switch">
                                        <input
                                          type="checkbox"
                                          checked={examDraft[activeDocTab][e.value].allowLateSubmission}
                                          disabled={!isRequired}
                                          onChange={(ev) =>
                                            setExamDraft((prev) => ({
                                              ...prev,
                                              [activeDocTab]: {
                                                ...prev[activeDocTab],
                                                [e.value]: { ...prev[activeDocTab][e.value], allowLateSubmission: ev.target.checked },
                                              },
                                            }))
                                          }
                                        />
                                        <span className="toggle-switch__track">
                                          <span className="toggle-switch__thumb" />
                                        </span>
                                        Allow Late Submission
                                      </label>
                                    </div>
                                  );
                                })}
                              </div>
                              </div>

                              {examError && (
                                <div style={{ color: "var(--status-red)", fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>
                                  {examError}
                                </div>
                              )}

                              <div className="form-actions">
                                <button type="button" className="btn btn--ghost" onClick={closeExamEditor}>
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  className="btn btn--primary"
                                  style={{ marginLeft: 10 }}
                                  disabled={examSaving}
                                  onClick={() => saveExamSchedule(t.id)}
                                >
                                  {examSaving ? "Saving..." : "Save Submission Schedules"}
                                </button>
                              </div>
                            </Modal>
                          )}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

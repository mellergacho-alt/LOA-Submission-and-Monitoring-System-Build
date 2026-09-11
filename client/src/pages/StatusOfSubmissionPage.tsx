import { useEffect, useState } from "react";
import AppLayout, { PageHeader } from "../layouts/AppLayout";
import StatCard from "../components/StatCard";
import StatusPill from "../components/StatusPill";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type {
  AdminStats,
  Cluster,
  DocumentType,
  ExamType,
  School,
  SchoolRosterRow,
  SchoolYear,
  StatusGridResponse,
} from "../types/api";
import { documentTypeLabel } from "../utils/documentTypes";
import { AlertIcon, ClockIcon, ChecklistIcon, PaperclipIcon, ChevronDownIcon, EyeIcon, DownloadIcon } from "../icons/Icons";
import FileViewerModal from "../components/FileViewerModal";
import { SkeletonGrid, SkeletonTable } from "../components/Skeleton";
import "./SubmissionGrid.css";
import "./StatusGrid.css";

const ELECTIVE_LEARNING_AREAS = ["Creative Tech (Elective)", "Research (Elective)"];
const CLUSTER_OF_ELECTIVES = ["Academic Cluster", "Business and Entrep", "STEM", "TechPro"];

const EXAM_TYPES: { value: ExamType; label: string }[] = [
  { value: "DIAGNOSTIC_TEST", label: "Diagnostic Test" },
  { value: "SUMMATIVE_TEST_1", label: "Summative Test 1" },
  { value: "SUMMATIVE_TEST_2", label: "Summative Test 2" },
  { value: "END_OF_TERM_EXAM", label: "End of Term Exam" },
];

function getClusterTarget(cs: { electiveFileTargets: Record<string, number> }, areaName: string): number {
  return cs.electiveFileTargets?.[areaName] ?? 0;
}

function formatTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface StatusOfSubmissionPageProps {
  documentType: DocumentType;
}

export default function StatusOfSubmissionPage({ documentType }: StatusOfSubmissionPageProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [schools, setSchools] = useState<School[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [clusterId, setClusterId] = useState<number | "">("");
  const [schoolId, setSchoolId] = useState<number | "">("");
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<number | "">("");
  const [selectedTermId, setSelectedTermId] = useState<number | "">("");
  const [examType, setExamType] = useState<ExamType>("DIAGNOSTIC_TEST");
  const docLabel = documentTypeLabel(documentType);
  // Admin-only ("Status of Submission from Schools") -- filter rows/schools
  // by timeliness (does the row/school have a Late submission) and by
  // completeness (is every applicable cell filled). Client-side only: the
  // single-school drill-down already has everything it needs in `grid`, and
  // the roster now carries hasLateSubmission/isComplete per school from the
  // backend, so neither view needs its own fetch to support this.
  const [timelinessFilter, setTimelinessFilter] = useState<"ALL" | "ON_TIME" | "LATE">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "COMPLETE" | "INCOMPLETE">("ALL");

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [grid, setGrid] = useState<StatusGridResponse | null>(null);
  const [roster, setRoster] = useState<SchoolRosterRow[]>([]);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Accordion: at most one grade level expanded at a time; null = all
  // collapsed, which is also the default on load.
  const [expandedGradeId, setExpandedGradeId] = useState<number | null>(null);

  function toggleGrade(id: number) {
    setExpandedGradeId((prev) => (prev === id ? null : id));
  }

  async function handleDownloadFile(submissionId: number, fileName: string | null) {
    const res = await api.get(`/submissions/${submissionId}/download`, { responseType: "blob" });
    const url = window.URL.createObjectURL(res.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName ?? "download";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  // "View" opens FileViewerModal (an in-page Modal) instead of a new tab —
  // see LOASubmissionPage.tsx's identical helper for the full reasoning.
  const [viewingFile, setViewingFile] = useState<{ id: number; fileName: string | null } | null>(null);
  function handleViewFile(submissionId: number, fileName: string | null) {
    setViewingFile({ id: submissionId, fileName });
  }

  useEffect(() => {
    if (isAdmin) {
      api.get<School[]>("/schools").then((res) => setSchools(res.data));
      api.get<Cluster[]>("/clusters").then((res) => setClusters(res.data));
    }
    api.get<SchoolYear[]>("/school-years").then((res) => {
      setSchoolYears(res.data);
      const activeYear = res.data.find((y) => y.isActive) ?? res.data[0];
      if (activeYear) {
        setSelectedYearId(activeYear.id);
        const activeTerm = activeYear.terms.find((t) => t.isActive) ?? activeYear.terms[0];
        if (activeTerm) setSelectedTermId(activeTerm.id);
      }
    });
  }, [isAdmin]);

  const selectedYear = schoolYears.find((y) => y.id === selectedYearId) ?? null;
  const selectedTerm = selectedYear?.terms.find((t) => t.id === selectedTermId) ?? null;
  const isActivePeriod = selectedTerm?.isActive ?? false;
  const schoolsInCluster = clusterId ? schools.filter((s) => s.clusterId === clusterId) : schools;

  function handleYearChange(yearId: number) {
    setSelectedYearId(yearId);
    const year = schoolYears.find((y) => y.id === yearId);
    const nextTerm = year?.terms.find((t) => t.isActive) ?? year?.terms[0];
    setSelectedTermId(nextTerm?.id ?? "");
  }

  function handleClusterChange(value: number | "") {
    setClusterId(value);
    setSchoolId(""); // narrowing/widening the cluster resets the School filter back to "All Schools"
  }

  // Exactly one school in scope -> the detailed per-class status-grid (old
  // behavior). Otherwise (All Schools, or a whole Cluster) -> the roster
  // table. SCHOOL accounts are always effectively a single school.
  const singleSchoolMode = !isAdmin || schoolId !== "";
  const effectiveSchoolId = isAdmin ? schoolId : "self";
  const effectiveScopeKey = isAdmin ? `${schoolId}|${clusterId}` : "self";

  // "On Time Submission" means the school has actually submitted something
  // and none of it is late -- a school with zero records is neither on time
  // nor late, so it matches neither specific filter (only "All").
  const filteredRoster =
    !isAdmin || (timelinessFilter === "ALL" && statusFilter === "ALL")
      ? roster
      : roster.filter((row) => {
          if (timelinessFilter === "LATE" && !row.hasLateSubmission) return false;
          if (timelinessFilter === "ON_TIME" && (row.records === 0 || row.hasLateSubmission)) return false;
          if (statusFilter === "COMPLETE" && !row.isComplete) return false;
          if (statusFilter === "INCOMPLETE" && row.isComplete) return false;
          return true;
        });

  // School Portal only (not the admin "Status of Submission from Schools"
  // view) — identical banner logic to LOA Submission's (LOASubmissionPage.tsx):
  // the two banners are mutually exclusive, term-inactive takes precedence,
  // and the exam-window message is only evaluated once the term is active.
  const examSchedule = grid?.examSchedule ?? null;
  const now = new Date();
  let examWindowMessage: string | null = null;
  // Same allowLateSubmission handling as LOASubmissionPage.tsx -- deadline
  // passed but late submissions still accepted isn't a "disabled" state, so
  // it gets the same separate, non-blocking note instead of reusing the
  // upload-is-disabled banner's wording, which would be inaccurate here.
  let lateAllowedMessage: string | null = null;
  if (!isAdmin && isActivePeriod) {
    if (!examSchedule || !examSchedule.required) {
      examWindowMessage = `This ${docLabel} is not required for this Term.`;
    } else if (examSchedule.startDate && now < new Date(examSchedule.startDate)) {
      examWindowMessage = `Submission for this ${docLabel} opens on ${new Date(examSchedule.startDate).toLocaleString("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}.`;
    } else if (examSchedule.deadline && now > new Date(examSchedule.deadline)) {
      if (examSchedule.allowLateSubmission) {
        lateAllowedMessage = `The deadline for this ${docLabel} was ${new Date(examSchedule.deadline).toLocaleString("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}, but late submissions are still being accepted.`;
      } else {
        examWindowMessage = `The deadline for this ${docLabel} was ${new Date(examSchedule.deadline).toLocaleString("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}.`;
      }
    }
  }

  useEffect(() => {
    if (!selectedTermId) return;

    const statsParams: Record<string, string> = { termId: String(selectedTermId), examType, documentType };
    if (isAdmin && schoolId) statsParams.schoolId = String(schoolId);
    if (isAdmin && !schoolId && clusterId) statsParams.clusterId = String(clusterId);
    api.get<AdminStats>("/submissions/stats", { params: statsParams }).then((res) => setStats(res.data));

    setLoadingGrid(true);
    setError(null);

    if (singleSchoolMode) {
      const params: Record<string, string> = { termId: String(selectedTermId), examType, documentType };
      if (isAdmin && schoolId) params.schoolId = String(schoolId);
      api
        .get<StatusGridResponse>("/submissions/status-grid", { params })
        .then((res) => setGrid(res.data))
        .catch((err) => setError(err?.response?.data?.message ?? "Failed to load status"))
        .finally(() => setLoadingGrid(false));
    } else {
      const params: Record<string, string> = { termId: String(selectedTermId), examType, documentType };
      if (clusterId) params.clusterId = String(clusterId);
      api
        .get<SchoolRosterRow[]>("/submissions/roster", { params })
        .then((res) => setRoster(res.data))
        .catch((err) => setError(err?.response?.data?.message ?? "Failed to load school roster"))
        .finally(() => setLoadingGrid(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSchoolId, effectiveScopeKey, selectedTermId, examType, documentType]);

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Department of Education, Division of Guihulngan City"
        title={isAdmin ? "Status of Submission from Schools" : "Status of Submission"}
        subtitle="STATUS PER GRADE LEVEL, LEARNING AREA, AND CLASS/SECTION"
      />

      <div className="stat-row" style={{ margin: "20px 0" }}>
        <StatCard icon={ChecklistIcon} tone="green" label="Submitted" value={stats?.submitted ?? "—"} />
        <StatCard icon={ClockIcon} tone="red" label="Late" value={stats?.late ?? "—"} />
        <StatCard icon={AlertIcon} tone="amber" label="Not Submitted" value={stats?.notSubmitted ?? "—"} />
      </div>

      <div className="card">
        <div className="filter-bar filter-row--single-line">
          {isAdmin && (
            <div className="filter-field filter-row__field">
              <label>Cluster</label>
              <select
                value={clusterId}
                onChange={(e) => handleClusterChange(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">All Clusters</option>
                {clusters.map((c) => (
                  <option key={c.id} value={c.id}>
                    Cluster {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {isAdmin && (
            <div className="filter-field filter-row__field">
              <label>School</label>
              <select value={schoolId} onChange={(e) => setSchoolId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">All Schools</option>
                {schoolsInCluster.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.schoolName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="filter-field filter-row__field">
            <label>School Year</label>
            <select value={selectedYearId} onChange={(e) => handleYearChange(Number(e.target.value))}>
              {schoolYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-field filter-row__field">
            <label>Term</label>
            <select value={selectedTermId} onChange={(e) => setSelectedTermId(Number(e.target.value))}>
              {selectedYear?.terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} Term
                </option>
              ))}
            </select>
          </div>
          <div className="filter-field filter-row__field">
            <label>Exam Type</label>
            <select value={examType} onChange={(e) => setExamType(e.target.value as ExamType)}>
              {EXAM_TYPES.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>
          {isAdmin && (
            <div className="filter-field filter-row__field">
              <label>Timeliness</label>
              <select value={timelinessFilter} onChange={(e) => setTimelinessFilter(e.target.value as typeof timelinessFilter)}>
                <option value="ALL">All</option>
                <option value="ON_TIME">On Time Submission</option>
                <option value="LATE">Late Submission</option>
              </select>
            </div>
          )}
          {isAdmin && (
            <div className="filter-field filter-row__field">
              <label>Status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
                <option value="ALL">All</option>
                <option value="COMPLETE">Complete Submission</option>
                <option value="INCOMPLETE">Incomplete Submission</option>
              </select>
            </div>
          )}
        </div>

        {!isAdmin && singleSchoolMode && !isActivePeriod && selectedTerm && !loadingGrid && !error && grid && grid.gradeLevels.length > 0 && (
          <div
            style={{
              margin: "0 26px 16px",
              padding: "10px 14px",
              borderRadius: "var(--radius-sm)",
              background: "var(--status-amber-bg)",
              color: "var(--status-amber)",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Viewing {selectedYear?.label} — {selectedTerm.name} Term, which is not the active period. You can view
            and download files here, but uploading and removing are disabled.
          </div>
        )}

        {!isAdmin && singleSchoolMode && examWindowMessage && !loadingGrid && !error && grid && grid.gradeLevels.length > 0 && (
          <div
            style={{
              margin: "0 26px 16px",
              padding: "10px 14px",
              borderRadius: "var(--radius-sm)",
              background: "var(--status-amber-bg)",
              color: "var(--status-amber)",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {examWindowMessage} You can view and download files here, but uploading is disabled.
          </div>
        )}

        {!isAdmin && singleSchoolMode && lateAllowedMessage && !loadingGrid && !error && grid && grid.gradeLevels.length > 0 && (
          <div
            style={{
              margin: "0 26px 16px",
              padding: "10px 14px",
              borderRadius: "var(--radius-sm)",
              background: "var(--status-amber-bg)",
              color: "var(--status-amber)",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {lateAllowedMessage}
          </div>
        )}

        {loadingGrid ? (
          singleSchoolMode ? <SkeletonGrid columns={4} /> : <SkeletonTable columns={6} />
        ) : error ? (
          <p className="status-grid-empty" style={{ color: "var(--status-red)" }}>
            {error}
          </p>
        ) : !singleSchoolMode ? (
          filteredRoster.length === 0 ? (
            <p className="status-grid-empty">
              {roster.length === 0 ? "No schools found for this cluster." : "No schools match the selected filters."}
            </p>
          ) : (
            <div className="status-grid-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Cluster</th>
                    <th>School</th>
                    <th>School Head</th>
                    <th>Grade Levels</th>
                    <th>Grade-Level Learning Area Submissions</th>
                    <th>Records</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoster.map((row) => (
                    <tr key={row.schoolId}>
                      <td>{row.clusterName}</td>
                      <td style={{ fontWeight: 700 }}>{row.schoolName}</td>
                      <td>{row.schoolHeadName ?? "—"}</td>
                      <td>{row.gradeLevels.join(", ") || "—"}</td>
                      <td>
                        {row.gradeLevelLearningAreas.length === 0
                          ? "—"
                          : row.gradeLevelLearningAreas.map((g) => (
                              <div key={g.gradeName}>
                                <strong>{g.gradeName}:</strong> {g.learningAreas.join(", ") || "—"}
                              </div>
                            ))}
                      </td>
                      <td style={{ fontWeight: 700 }}>{row.records}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : !grid || grid.gradeLevels.length === 0 ? (
          <p className="status-grid-empty">No grade levels found for this school.</p>
        ) : (
          grid.gradeLevels.map((gradeLevel) => {
            if (gradeLevel.classSections.length === 0 || gradeLevel.learningAreas.length === 0) return null;

            const totalCells = gradeLevel.learningAreas.reduce((sum, area) => {
              const applicable = ELECTIVE_LEARNING_AREAS.includes(area.name)
                ? gradeLevel.classSections.filter((cs) => cs.hasElectives).length
                : CLUSTER_OF_ELECTIVES.includes(area.name)
                ? gradeLevel.classSections.filter((cs) => getClusterTarget(cs, area.name) > 0).length
                : gradeLevel.classSections.length;
              return sum + applicable;
            }, 0);
            const submittedCells = gradeLevel.learningAreas.reduce((sum, area) => {
              if (!CLUSTER_OF_ELECTIVES.includes(area.name)) {
                return (
                  sum +
                  gradeLevel.submissions.filter(
                    (s) => s.learningAreaId === area.id && (s.status === "SUBMITTED" || s.status === "LATE")
                  ).length
                );
              }
              const complete = gradeLevel.classSections.filter((cs) => {
                const target = getClusterTarget(cs, area.name);
                if (target <= 0) return false;
                const count = gradeLevel.submissions.filter(
                  (s) => s.classSectionId === cs.id && s.learningAreaId === area.id
                ).length;
                return count >= target;
              }).length;
              return sum + complete;
            }, 0);
            const isCollapsed = expandedGradeId !== gradeLevel.id;
            const clusterAreas = gradeLevel.learningAreas.filter((a) => CLUSTER_OF_ELECTIVES.includes(a.name));
            const coreAreas = gradeLevel.learningAreas.filter((a) => !CLUSTER_OF_ELECTIVES.includes(a.name));

            // Transposed: Learning Areas across the top (columns), one row
            // per Class/Section — the inverse of the old rows-are-areas
            // layout. "Remarks" is recomputed along the new axis too: a
            // class/section's row is "Complete Submission" once every
            // *applicable* Learning Area for it is filled, not (as before)
            // one Learning Area complete across every class.
            function renderAreaTable(areas: typeof gradeLevel.learningAreas) {
              function renderCell(cs: (typeof gradeLevel.classSections)[number], area: (typeof areas)[number]) {
                const isElectiveArea = ELECTIVE_LEARNING_AREAS.includes(area.name);
                const isClusterArea = CLUSTER_OF_ELECTIVES.includes(area.name);

                if (isElectiveArea && !cs.hasElectives) {
                  return (
                    <div className="status-cell">
                      <span className="status-cell__no-electives">No Electives</span>
                    </div>
                  );
                }

                if (isClusterArea) {
                  const target = getClusterTarget(cs, area.name);
                  if (target <= 0) {
                    return (
                      <div className="status-cell">
                        <span className="status-cell__no-electives">No Limit Set</span>
                      </div>
                    );
                  }
                  const files = gradeLevel.submissions.filter(
                    (s) => s.classSectionId === cs.id && s.learningAreaId === area.id
                  );
                  const complete = files.length >= target;
                  return (
                    <div className="status-cell">
                      <StatusPill status={complete ? "SUBMITTED" : "NOT_SUBMITTED"} />
                      <span className="status-cell__file">
                        {files.length} / {target} files
                      </span>
                      {files.map((f) => (
                        <div key={f.id} className="status-cell__file-row">
                          {f.filePath ? (
                            <button
                              type="button"
                              className="status-cell__file status-cell__file--clickable"
                              title="View file"
                              onClick={() => handleViewFile(f.id, f.fileName)}
                            >
                              <PaperclipIcon style={{ width: 11, height: 11, verticalAlign: "-1px" }} /> {f.fileName}
                            </button>
                          ) : (
                            <span className="status-cell__file">
                              <PaperclipIcon style={{ width: 11, height: 11, verticalAlign: "-1px" }} /> {f.fileName}
                            </span>
                          )}
                          {formatTimestamp(f.submittedAt) && (
                            <span
                              className={
                                "upload-cell__timestamp" + (f.status === "LATE" ? " upload-cell__timestamp--late" : "")
                              }
                            >
                              {formatTimestamp(f.submittedAt)}
                            </span>
                          )}
                          <div className="upload-cell__actions">
                            {f.filePath && (
                              <button
                                type="button"
                                className="upload-cell__action"
                                title="View file"
                                onClick={() => handleViewFile(f.id, f.fileName)}
                              >
                                <EyeIcon />
                              </button>
                            )}
                            <button
                              type="button"
                              className="upload-cell__action"
                              title="Download file"
                              onClick={() => handleDownloadFile(f.id, f.fileName)}
                            >
                              <DownloadIcon />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                }

                const submission = gradeLevel.submissions.find(
                  (s) => s.classSectionId === cs.id && s.learningAreaId === area.id
                );
                const status = submission?.status ?? "NOT_SUBMITTED";
                return (
                  <div className="status-cell">
                    <StatusPill status={status} />
                    {submission?.fileName && (
                      <>
                        {submission.filePath ? (
                          <button
                            type="button"
                            className="status-cell__file status-cell__file--clickable"
                            title="View file"
                            onClick={() => handleViewFile(submission.id, submission.fileName)}
                          >
                            <PaperclipIcon style={{ width: 11, height: 11, verticalAlign: "-1px" }} />{" "}
                            {submission.fileName}
                          </button>
                        ) : (
                          <span className="status-cell__file">
                            <PaperclipIcon style={{ width: 11, height: 11, verticalAlign: "-1px" }} />{" "}
                            {submission.fileName}
                          </span>
                        )}
                        {formatTimestamp(submission.submittedAt) && (
                          <span
                            className={
                              "upload-cell__timestamp" +
                              (submission.status === "LATE" ? " upload-cell__timestamp--late" : "")
                            }
                          >
                            {formatTimestamp(submission.submittedAt)}
                          </span>
                        )}
                        <div className="upload-cell__actions">
                          {submission.filePath && (
                            <button
                              type="button"
                              className="upload-cell__action"
                              title="View file"
                              onClick={() => handleViewFile(submission.id, submission.fileName)}
                            >
                              <EyeIcon />
                            </button>
                          )}
                          <button
                            type="button"
                            className="upload-cell__action"
                            title="Download file"
                            onClick={() => handleDownloadFile(submission.id, submission.fileName)}
                          >
                            <DownloadIcon />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              }

              function isCellApplicable(cs: (typeof gradeLevel.classSections)[number], area: (typeof areas)[number]) {
                if (ELECTIVE_LEARNING_AREAS.includes(area.name)) return cs.hasElectives;
                if (CLUSTER_OF_ELECTIVES.includes(area.name)) return getClusterTarget(cs, area.name) > 0;
                return true;
              }

              function isCellComplete(cs: (typeof gradeLevel.classSections)[number], area: (typeof areas)[number]) {
                if (CLUSTER_OF_ELECTIVES.includes(area.name)) {
                  const target = getClusterTarget(cs, area.name);
                  const count = gradeLevel.submissions.filter(
                    (s) => s.classSectionId === cs.id && s.learningAreaId === area.id
                  ).length;
                  return count >= target;
                }
                const submission = gradeLevel.submissions.find(
                  (s) => s.classSectionId === cs.id && s.learningAreaId === area.id
                );
                return submission?.status === "SUBMITTED" || submission?.status === "LATE";
              }

              // Admin-only Timeliness filter (see the isAdmin-gated dropdown
              // above) -- whether any applicable cell in this row was
              // submitted late. A Cluster of Electives cell can hold several
              // files at once, so it counts as "late" if *any* of them is,
              // same as how a single row's Remarks already treats the whole
              // cell as one unit.
              function isCellLate(cs: (typeof gradeLevel.classSections)[number], area: (typeof areas)[number]) {
                if (CLUSTER_OF_ELECTIVES.includes(area.name)) {
                  return gradeLevel.submissions.some(
                    (s) => s.classSectionId === cs.id && s.learningAreaId === area.id && s.status === "LATE"
                  );
                }
                const submission = gradeLevel.submissions.find(
                  (s) => s.classSectionId === cs.id && s.learningAreaId === area.id
                );
                return submission?.status === "LATE";
              }

              return (
                <table className="status-grid">
                  <thead>
                    <tr>
                      <th>Class/Section</th>
                      {areas.map((area) => (
                        <th key={area.id}>{area.name}</th>
                      ))}
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gradeLevel.classSections.map((cs) => {
                      const applicableAreas = areas.filter((area) => isCellApplicable(cs, area));
                      const isComplete = applicableAreas.length > 0 && applicableAreas.every((area) => isCellComplete(cs, area));

                      if (isAdmin) {
                        if (statusFilter === "COMPLETE" && !isComplete) return null;
                        if (statusFilter === "INCOMPLETE" && (applicableAreas.length === 0 || isComplete)) return null;
                        const hasLateCell = applicableAreas.some((area) => isCellLate(cs, area));
                        const hasOnTimeCell = applicableAreas.some(
                          (area) => isCellComplete(cs, area) && !isCellLate(cs, area)
                        );
                        if (timelinessFilter === "LATE" && !hasLateCell) return null;
                        if (timelinessFilter === "ON_TIME" && !(hasOnTimeCell && !hasLateCell)) return null;
                      }

                      return (
                        <tr key={cs.id}>
                          <td className="status-grid__area">{cs.className}</td>
                          {areas.map((area) => (
                            <td key={area.id}>{renderCell(cs, area)}</td>
                          ))}
                          <td className="status-grid__remarks">
                            {applicableAreas.length === 0 ? (
                              "No Electives"
                            ) : isComplete ? (
                              <span className="pill pill--green">Complete Submission</span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              );
            }

            return (
              <div className="status-grade-section" key={gradeLevel.id}>
                <button
                  type="button"
                  className="status-grade-section__header"
                  onClick={() => toggleGrade(gradeLevel.id)}
                  aria-expanded={!isCollapsed}
                >
                  <ChevronDownIcon
                    className={"status-grade-section__chevron" + (isCollapsed ? " collapsed" : "")}
                  />
                  <h3 className="heading status-grade-section__title">{gradeLevel.gradeName}</h3>
                  <span className="pill pill--slate" style={{ marginLeft: "auto" }}>
                    {submittedCells} / {totalCells} Submitted
                  </span>
                </button>

                {!isCollapsed && (
                  <>
                    {coreAreas.length > 0 && (
                      <div className="status-grid-scroll">
                        {clusterAreas.length > 0 && (
                          <h4 className="heading status-subsection-title">Core Subjects</h4>
                        )}
                        <div className="status-grid-scroll--sticky">{renderAreaTable(coreAreas)}</div>
                      </div>
                    )}
                    {clusterAreas.length > 0 && (
                      <div className="status-grid-scroll">
                        <h4 className="heading status-subsection-title">Cluster of Electives</h4>
                        <div className="status-grid-scroll--sticky">{renderAreaTable(clusterAreas)}</div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {viewingFile && (
        <FileViewerModal
          submissionId={viewingFile.id}
          fileName={viewingFile.fileName}
          onClose={() => setViewingFile(null)}
        />
      )}
    </AppLayout>
  );
}

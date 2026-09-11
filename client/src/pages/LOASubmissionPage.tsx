import { useEffect, useMemo, useState } from "react";
import AppLayout, { PageHeader } from "../layouts/AppLayout";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { confirmDelete, showError, showSuccess } from "../utils/alerts";
import { documentTypeLabel } from "../utils/documentTypes";
import type { DocumentType, ExamType, School, SchoolYear, SubmissionGridResponse } from "../types/api";
import { DownloadIcon, EyeIcon, PaperclipIcon, TrashIcon, UploadIcon } from "../icons/Icons";
import FileViewerModal from "../components/FileViewerModal";
import { SkeletonGrid } from "../components/Skeleton";
import "../styles/forms.css";
import "./SubmissionGrid.css";

const CORE_SUBJECTS_GRADES = ["Grade 11", "Grade 12"];

const ELECTIVE_LEARNING_AREAS = ["Creative Tech (Elective)", "Research (Elective)"];
const CLUSTER_OF_ELECTIVES = ["Academic Cluster", "Business and Entrep", "STEM", "TechPro"];

const EXAM_TYPES: { value: ExamType; label: string }[] = [
  { value: "DIAGNOSTIC_TEST", label: "Diagnostic Test" },
  { value: "SUMMATIVE_TEST_1", label: "Summative Test 1" },
  { value: "SUMMATIVE_TEST_2", label: "Summative Test 2" },
  { value: "END_OF_TERM_EXAM", label: "End of Term Exam" },
];

function formatTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface LOASubmissionPageProps {
  documentType: DocumentType;
}

export default function LOASubmissionPage({ documentType }: LOASubmissionPageProps) {
  const { user } = useAuth();
  const isChairman = user?.role === "GRADE_CHAIRMAN";

  const [school, setSchool] = useState<School | null>(null);
  const [grade, setGrade] = useState<string>("");
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<number | "">("");
  const [selectedTermId, setSelectedTermId] = useState<number | "">("");
  const [examType, setExamType] = useState<ExamType>("DIAGNOSTIC_TEST");
  const docLabel = documentTypeLabel(documentType);
  const [grid, setGrid] = useState<SubmissionGridResponse | null>(null);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<School>("/schools/me").then((res) => {
      setSchool(res.data);
      // A Grade Level Chairman is locked to their own assigned grade(s) —
      // never defaults to (or lets them pick) any other grade in the school.
      // A multigrade chairman still only works in one grade at a time here,
      // just picked from their own assigned set instead of the whole school's.
      setGrade(isChairman ? user?.gradeNames?.[0] ?? "" : res.data.gradeLevels?.[0]?.gradeName ?? "");
    });
    api.get<SchoolYear[]>("/school-years").then((res) => {
      setSchoolYears(res.data);
      const activeYear = res.data.find((y) => y.isActive) ?? res.data[0];
      if (activeYear) {
        setSelectedYearId(activeYear.id);
        const activeTerm = activeYear.terms.find((t) => t.isActive) ?? activeYear.terms[0];
        if (activeTerm) setSelectedTermId(activeTerm.id);
      }
    });
  }, []);

  const selectedYear = schoolYears.find((y) => y.id === selectedYearId) ?? null;
  const selectedTerm = selectedYear?.terms.find((t) => t.id === selectedTermId) ?? null;
  const isActivePeriod = selectedTerm?.isActive ?? false;

  const examSchedule = grid?.examSchedule ?? null;
  const now = new Date();
  let examWindowMessage: string | null = null;
  // Deadline passed + allowLateSubmission on -> not blocked (see
  // assertExamScheduleOpenForWrite/uploadSubmission, which accepts the
  // upload and records it as status: LATE). A separate, non-blocking note
  // still tells the school it'll be recorded as late instead of staying
  // silent about it -- matches this page's existing instinct to always
  // explain the write-eligibility state rather than let it be a surprise.
  let lateAllowedMessage: string | null = null;
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
  const canUpload = isActivePeriod && examWindowMessage === null;

  function handleYearChange(yearId: number) {
    setSelectedYearId(yearId);
    const year = schoolYears.find((y) => y.id === yearId);
    const nextTerm = year?.terms.find((t) => t.isActive) ?? year?.terms[0];
    setSelectedTermId(nextTerm?.id ?? "");
  }

  const gradeLevel = school?.gradeLevels?.find((g) => g.gradeName === grade) ?? null;

  useEffect(() => {
    if (!gradeLevel || !selectedTermId) {
      setGrid(null);
      return;
    }
    setLoadingGrid(true);
    setError(null);
    api
      .get<SubmissionGridResponse>("/submissions/grid", {
        params: { gradeLevelId: gradeLevel.id, termId: selectedTermId, examType, documentType },
      })
      .then((res) => setGrid(res.data))
      .catch((err) => setError(err?.response?.data?.message ?? "Failed to load submissions"))
      .finally(() => setLoadingGrid(false));
  }, [gradeLevel, selectedTermId, examType, documentType]);

  const classSections = grid?.classSections ?? [];
  const learningAreas = useMemo(() => grid?.learningAreas ?? [], [grid]);
  const coreAreas = useMemo(() => learningAreas.filter((a) => !CLUSTER_OF_ELECTIVES.includes(a.name)), [learningAreas]);
  const clusterAreas = useMemo(() => learningAreas.filter((a) => CLUSTER_OF_ELECTIVES.includes(a.name)), [learningAreas]);

  function findSubmission(classSectionId: number, learningAreaId: number) {
    return grid?.submissions.find((s) => s.classSectionId === classSectionId && s.learningAreaId === learningAreaId);
  }

  function findSubmissions(classSectionId: number, learningAreaId: number) {
    return grid?.submissions.filter((s) => s.classSectionId === classSectionId && s.learningAreaId === learningAreaId) ?? [];
  }

  async function refreshGrid() {
    if (!gradeLevel || !selectedTermId) return;
    const res = await api.get<SubmissionGridResponse>("/submissions/grid", {
      params: { gradeLevelId: gradeLevel.id, termId: selectedTermId, examType, documentType },
    });
    setGrid(res.data);
  }

  async function handleFileChange(classSectionId: number, learningAreaId: number, file: File | undefined) {
    if (!file || !selectedTermId) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("classSectionId", String(classSectionId));
    formData.append("learningAreaId", String(learningAreaId));
    formData.append("termId", String(selectedTermId));
    formData.append("examType", examType);
    formData.append("documentType", documentType);

    try {
      await api.post("/submissions/upload", formData);
      await refreshGrid();
      showSuccess("File uploaded");
    } catch (err: any) {
      showError(err?.response?.data?.message ?? "Failed to upload file");
    }
  }

  async function handleRemoveFile(submissionId: number, fileName: string | null) {
    const confirmed = await confirmDelete(`Remove "${fileName ?? "this file"}"?`, "This cannot be undone.");
    if (!confirmed) return;

    try {
      await api.delete(`/submissions/${submissionId}`);
      await refreshGrid();
      showSuccess("File removed");
    } catch (err: any) {
      showError(err?.response?.data?.message ?? "Failed to remove file");
    }
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
  // the file is still only ever reachable via the authenticated download
  // endpoint, so the file is never served to an unauthenticated request.
  const [viewingFile, setViewingFile] = useState<{ id: number; fileName: string | null } | null>(null);
  function handleViewFile(submissionId: number, fileName: string | null) {
    setViewingFile({ id: submissionId, fileName });
  }

  return (
    <AppLayout>
      <PageHeader
        eyebrow={`${docLabel.toUpperCase()} SUBMISSION`}
        title="Learning Outcome Assessment Upload"
        subtitle="UPLOAD FILES PER LEARNING AREA AND CLASS/SECTION"
      />

      <div className="card" style={{ marginTop: 20 }}>
        <div className="filter-bar filter-row--single-line">
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
            <label>Grade Level</label>
            {isChairman ? (
              (user?.gradeNames?.length ?? 0) > 1 ? (
                <select value={grade} onChange={(e) => setGrade(e.target.value)} title="You are assigned to these grade levels only">
                  {user!.gradeNames.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              ) : (
                <select value={grade} disabled title="You are assigned to this grade level only">
                  <option>{grade}</option>
                </select>
              )
            ) : (
              <select value={grade} onChange={(e) => setGrade(e.target.value)}>
                {school?.gradeLevels?.map((g) => (
                  <option key={g.id} value={g.gradeName}>
                    {g.gradeName}
                  </option>
                ))}
              </select>
            )}
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
        </div>

        {!isActivePeriod && selectedTerm && (
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

        {isActivePeriod && examWindowMessage && !loadingGrid && classSections.length > 0 && (
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

        {isActivePeriod && lateAllowedMessage && !loadingGrid && classSections.length > 0 && (
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

        {CORE_SUBJECTS_GRADES.includes(grade) && <h2 className="heading section-title">Core Subjects</h2>}

        <div className="upload-grid-scroll">
          {loadingGrid ? (
            <SkeletonGrid columns={4} />
          ) : error ? (
            <p style={{ color: "var(--status-red)", fontSize: 13.5 }}>{error}</p>
          ) : classSections.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", fontSize: 13.5 }}>
              No class/section is set up yet for {grade}. Add one in School Profile first.
            </p>
          ) : (
            <div className="upload-grid-scroll--sticky">
              <table className="upload-grid">
                <thead>
                  <tr>
                    <th>Class/Section</th>
                    {coreAreas.map((area) => (
                      <th key={area.id}>{area.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {classSections.map((cs) => (
                    <tr key={cs.id}>
                      <td className="upload-grid__area">{cs.className}</td>
                      {coreAreas.map((area) => {
                        const submission = findSubmission(cs.id, area.id);
                        const isElectiveArea = ELECTIVE_LEARNING_AREAS.includes(area.name);
                        const disabled = isElectiveArea && !cs.hasElectives;

                        return (
                          <td key={area.id}>
                            {disabled ? (
                              <div className="upload-cell upload-cell--disabled" title="This class has no electives enabled">
                                <span className="upload-cell__label">No Electives</span>
                              </div>
                            ) : (
                              <div className="upload-cell-wrap">
                                {submission?.fileName ? (
                                  // Clicking a filled cell views the file instead of re-opening the
                                  // file picker to replace it — replacing now goes through Remove
                                  // then a fresh upload, which is also safer against an accidental
                                  // overwrite of a real submitted file than one-click replace was.
                                  <button
                                    type="button"
                                    className="upload-cell upload-cell--filled"
                                    title="View file"
                                    onClick={() => handleViewFile(submission.id, submission.fileName)}
                                  >
                                    <PaperclipIcon />
                                    <span className="upload-cell__label" title={submission.fileName ?? undefined}>
                                      {submission.fileName}
                                    </span>
                                  </button>
                                ) : (
                                  <label
                                    className={"upload-cell" + (!canUpload ? " upload-cell--disabled" : "")}
                                    title={!canUpload ? `Uploading is disabled for this Term/${docLabel}` : undefined}
                                  >
                                    <UploadIcon />
                                    <span className="upload-cell__label">Upload file here</span>
                                    <input
                                      type="file"
                                      disabled={!canUpload}
                                      onChange={(e) => handleFileChange(cs.id, area.id, e.target.files?.[0])}
                                    />
                                  </label>
                                )}
                                {submission?.fileName && (
                                  <>
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
                                      {isActivePeriod && (
                                        <button
                                          type="button"
                                          className="upload-cell__action upload-cell__action--danger"
                                          title="Remove file"
                                          onClick={() => handleRemoveFile(submission.id, submission.fileName)}
                                        >
                                          <TrashIcon />
                                        </button>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!loadingGrid && !error && classSections.length > 0 && clusterAreas.length > 0 && (
          <>
            <h2 className="heading section-title">Cluster of Electives</h2>
            <div className="upload-grid-scroll">
              <div className="upload-grid-scroll--sticky">
                <table className="upload-grid">
                  <thead>
                    <tr>
                      <th>Class/Section</th>
                      {clusterAreas.map((area) => (
                        <th key={area.id}>{area.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {classSections.map((cs) => (
                      <tr key={cs.id}>
                        <td className="upload-grid__area">{cs.className}</td>
                        {clusterAreas.map((area) => {
                          const target = cs.electiveFileTargets?.[area.name] ?? 0;

                          if (target <= 0) {
                            return (
                              <td key={area.id}>
                                <div
                                  className="upload-cell upload-cell--disabled"
                                  title="Set a file limit for this elective in School Profile first"
                                >
                                  <span className="upload-cell__label">No Limit Set</span>
                                </div>
                              </td>
                            );
                          }

                          const files = findSubmissions(cs.id, area.id);
                          const canAddMore = files.length < target;
                          return (
                            <td key={area.id}>
                              <div className="upload-cell-list">
                                <div className="upload-cell-list__count">
                                  {files.length} / {target} files
                                </div>
                                {files.map((submission) => (
                                  <div className="upload-cell-wrap" key={submission.id}>
                                    <button
                                      type="button"
                                      className="upload-cell upload-cell--filled"
                                      title="View file"
                                      onClick={() => handleViewFile(submission.id, submission.fileName)}
                                    >
                                      <PaperclipIcon />
                                      <span className="upload-cell__label" title={submission.fileName ?? undefined}>
                                        {submission.fileName}
                                      </span>
                                    </button>
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
                                      {isActivePeriod && (
                                        <button
                                          type="button"
                                          className="upload-cell__action upload-cell__action--danger"
                                          title="Remove file"
                                          onClick={() => handleRemoveFile(submission.id, submission.fileName)}
                                        >
                                          <TrashIcon />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                                {canAddMore && (
                                  <label
                                    className={`upload-cell${!canUpload ? " upload-cell--disabled" : ""}`}
                                    title={!canUpload ? `Uploading is disabled for this Term/${docLabel}` : undefined}
                                  >
                                    <UploadIcon />
                                    <span className="upload-cell__label">
                                      Add file ({files.length}/{target})
                                    </span>
                                    <input
                                      type="file"
                                      disabled={!canUpload}
                                      onChange={(e) => handleFileChange(cs.id, area.id, e.target.files?.[0])}
                                    />
                                  </label>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
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

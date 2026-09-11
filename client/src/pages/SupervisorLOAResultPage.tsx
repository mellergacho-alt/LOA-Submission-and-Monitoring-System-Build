import { useEffect, useState } from "react";
import AppLayout, { PageHeader } from "../layouts/AppLayout";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type {
  Cluster,
  DocumentType,
  ExamType,
  SchoolYear,
  SupervisorSchoolOption,
  SupervisorSubmissionRow,
} from "../types/api";
import { documentTypeLabel } from "../utils/documentTypes";
import { EyeIcon, DownloadIcon, PaperclipIcon } from "../icons/Icons";
import FileViewerModal from "../components/FileViewerModal";
import { SkeletonTable } from "../components/Skeleton";
import "../styles/forms.css";
import "./SubmissionGrid.css";

const EXAM_TYPES: { value: ExamType; label: string }[] = [
  { value: "DIAGNOSTIC_TEST", label: "Diagnostic Test" },
  { value: "SUMMATIVE_TEST_1", label: "Summative Test 1" },
  { value: "SUMMATIVE_TEST_2", label: "Summative Test 2" },
  { value: "END_OF_TERM_EXAM", label: "End of Term Exam" },
];

interface SupervisorLOAResultPageProps {
  documentType: DocumentType;
}

export default function SupervisorLOAResultPage({ documentType }: SupervisorLOAResultPageProps) {
  const { user } = useAuth();
  const assignedAreas = user?.assignedLearningAreas ?? [];

  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<number | "">("");
  const [selectedTermId, setSelectedTermId] = useState<number | "">("");
  const [examType, setExamType] = useState<ExamType>("DIAGNOSTIC_TEST");
  const docLabel = documentTypeLabel(documentType);
  const [learningAreaName, setLearningAreaName] = useState<string>("");

  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [schools, setSchools] = useState<SupervisorSchoolOption[]>([]);
  const [clusterId, setClusterId] = useState<number | "">("");
  const [schoolId, setSchoolId] = useState<number | "">("");
  const schoolsInCluster = clusterId ? schools.filter((s) => s.clusterId === clusterId) : schools;

  function handleClusterChange(value: number | "") {
    setClusterId(value);
    setSchoolId(""); // narrowing/widening the cluster resets the School filter back to "All Schools"
  }

  const [rows, setRows] = useState<SupervisorSubmissionRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<SchoolYear[]>("/school-years").then((res) => {
      setSchoolYears(res.data);
      const activeYear = res.data.find((y) => y.isActive) ?? res.data[0];
      if (activeYear) {
        setSelectedYearId(activeYear.id);
        const activeTerm = activeYear.terms.find((t) => t.isActive) ?? activeYear.terms[0];
        if (activeTerm) setSelectedTermId(activeTerm.id);
      }
    });
    api.get<Cluster[]>("/clusters").then((res) => setClusters(res.data));
    api.get<SupervisorSchoolOption[]>("/submissions/supervisor-schools").then((res) => setSchools(res.data));
  }, []);

  const selectedYear = schoolYears.find((y) => y.id === selectedYearId) ?? null;

  function handleYearChange(yearId: number) {
    setSelectedYearId(yearId);
    const year = schoolYears.find((y) => y.id === yearId);
    const nextTerm = year?.terms.find((t) => t.isActive) ?? year?.terms[0];
    setSelectedTermId(nextTerm?.id ?? "");
  }

  useEffect(() => {
    if (!selectedTermId) return;
    setLoading(true);
    const params: Record<string, string> = { termId: String(selectedTermId), examType, documentType };
    if (learningAreaName) params.learningAreaName = learningAreaName;
    // Picking a specific School always wins over a Cluster selection — same
    // mutually-exclusive relationship as the ADMIN roster's filters.
    if (schoolId) params.schoolId = String(schoolId);
    else if (clusterId) params.clusterId = String(clusterId);
    api
      .get<SupervisorSubmissionRow[]>("/submissions/supervisor-view", { params })
      .then((res) => setRows(res.data))
      .finally(() => setLoading(false));
  }, [selectedTermId, examType, documentType, learningAreaName, clusterId, schoolId]);

  async function handleDownload(id: number, fileName: string | null) {
    const res = await api.get(`/submissions/${id}/download`, { responseType: "blob" });
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
  function handleView(id: number, fileName: string | null) {
    setViewingFile({ id, fileName });
  }

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Department of Education, Division of Guihulngan City"
        title="Status of Submission from Schools"
        subtitle={`VIEW SUBMITTED ${docLabel.toUpperCase()} FILES FOR YOUR ASSIGNED LEARNING AREA(S)`}
      />

      <div className="card-stack">
        <div className="card">
          <div className="filter-row--single-line" style={{ padding: "20px 26px 0", display: "flex", gap: 12 }}>
            <div className="form-field filter-row__field">
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
            <div className="form-field filter-row__field">
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
            <div className="form-field filter-row__field">
              <label>School Year</label>
              <select value={selectedYearId} onChange={(e) => handleYearChange(Number(e.target.value))}>
                {schoolYears.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field filter-row__field">
              <label>Term</label>
              <select value={selectedTermId} onChange={(e) => setSelectedTermId(Number(e.target.value))}>
                {selectedYear?.terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} Term
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field filter-row__field">
              <label>Exam Type</label>
              <select value={examType} onChange={(e) => setExamType(e.target.value as ExamType)}>
                {EXAM_TYPES.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field filter-row__field">
              <label>Learning Area</label>
              <select value={learningAreaName} onChange={(e) => setLearningAreaName(e.target.value)}>
                <option value="">All Assigned Areas</option>
                {assignedAreas.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {assignedAreas.length === 0 ? (
            <p style={{ padding: "20px 26px", color: "var(--text-secondary)", fontSize: 13.5 }}>
              Your account has no Assigned Learning Area yet — ask an Administrator to assign one before you can
              view any submitted files.
            </p>
          ) : loading ? (
            <div style={{ padding: "20px 26px 26px" }}>
              <SkeletonTable columns={7} />
            </div>
          ) : rows.length === 0 ? (
            <p style={{ padding: "20px 26px", color: "var(--text-secondary)", fontSize: 13.5 }}>
              No {docLabel} files found for this Term/Exam Type yet.
            </p>
          ) : (
            <div style={{ padding: "20px 26px 26px", overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>School</th>
                    <th>Grade Level</th>
                    <th>Class/Section</th>
                    <th>Learning Area</th>
                    <th>File</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td style={{ fontWeight: 700 }}>{row.schoolName}</td>
                      <td>{row.gradeName}</td>
                      <td>{row.className}</td>
                      <td>{row.learningAreaName}</td>
                      <td>
                        <div className="file-cell">
                          <PaperclipIcon style={{ width: 11, height: 11, flexShrink: 0 }} />
                          {row.filePath ? (
                            <button
                              type="button"
                              className="file-cell__name file-cell__name--clickable"
                              title="View file"
                              onClick={() => handleView(row.id, row.fileName)}
                            >
                              {row.fileName}
                            </button>
                          ) : (
                            <span className="file-cell__name">{row.fileName}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`pill ${row.status === "LATE" ? "pill--red" : "pill--green"}`}>
                          {row.status === "LATE" ? "Late" : "Submitted"}
                        </span>
                      </td>
                      <td>
                        <div className="upload-cell__actions">
                          {row.filePath && (
                            <button
                              type="button"
                              className="upload-cell__action"
                              title="View file"
                              onClick={() => handleView(row.id, row.fileName)}
                            >
                              <EyeIcon />
                            </button>
                          )}
                          <button
                            type="button"
                            className="upload-cell__action"
                            title="Download file"
                            onClick={() => handleDownload(row.id, row.fileName)}
                          >
                            <DownloadIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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

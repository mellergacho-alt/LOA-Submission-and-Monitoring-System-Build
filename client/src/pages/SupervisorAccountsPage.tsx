import { useEffect, useState } from "react";
import AppLayout, { PageHeader } from "../layouts/AppLayout";
import Modal from "../components/Modal";
import { api } from "../api/client";
import type { BulkSupervisorImportResponse, Supervisor } from "../types/api";
import { UsersIcon, PencilIcon, TrashIcon, LockIcon, UploadIcon, DownloadIcon } from "../icons/Icons";
import { confirmDelete, showSuccess } from "../utils/alerts";
import { SkeletonTable } from "../components/Skeleton";
import "../styles/forms.css";

const emptyForm = { name: "", email: "", password: "", assignedLearningAreas: [] as string[] };

// Groups for the Assigned Learning Area(s) checkbox list — same subject
// lists LOASubmissionPage.tsx uses for its own JHS-elective/SHS-core/
// Cluster-of-Electives gating, kept in this fixed display order (not
// alphabetical) to make assignment easier: general/regular subjects first,
// then progressively more specialized ones. Anything not named in the other
// three groups falls into "ES and JHS Regular Learning Areas" by exclusion.
const JHS_ELECTIVES = ["Creative Tech (Elective)", "Research (Elective)"];
const SHS_CORE_SUBJECTS = ["Effective Communication", "Life Skills", "General Mathematics", "Pag-aaral ng Kasaysayan at Lipunang Pilipino"];
const SHS_CLUSTER_OF_ELECTIVES = ["Academic Cluster", "Business and Entrep", "STEM", "TechPro"];

function groupLearningAreaOptions(names: string[]): { label: string; areas: string[] }[] {
  const isSpecialCased = (name: string) =>
    JHS_ELECTIVES.includes(name) || SHS_CORE_SUBJECTS.includes(name) || SHS_CLUSTER_OF_ELECTIVES.includes(name);

  return [
    { label: "ES and JHS Regular Learning Areas", areas: names.filter((n) => !isSpecialCased(n)) },
    { label: "JHS Electives (Special Program)", areas: names.filter((n) => JHS_ELECTIVES.includes(n)) },
    { label: "SHS Core Subjects", areas: names.filter((n) => SHS_CORE_SUBJECTS.includes(n)) },
    { label: "SHS Cluster of Electives", areas: names.filter((n) => SHS_CLUSTER_OF_ELECTIVES.includes(n)) },
  ].filter((group) => group.areas.length > 0);
}

export default function SupervisorAccountsPage() {
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [learningAreaOptions, setLearningAreaOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // A single modal handles both create and edit — the Assigned Learning Area
  // checkbox list needs real vertical space, so it doesn't fit the inline
  // table-row editing pattern used elsewhere (School Account, Chairman).
  const [showModal, setShowModal] = useState(false);
  const [editingSupervisor, setEditingSupervisor] = useState<Supervisor | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset Password is its own modal (converted from inline table-row editing).
  const [resetPasswordFor, setResetPasswordFor] = useState<Supervisor | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSaving, setResetSaving] = useState(false);

  const [rowError, setRowError] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<number | null>(null);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvInputKey, setCsvInputKey] = useState(0);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkSupervisorImportResponse | null>(null);

  function reload() {
    return api.get<Supervisor[]>("/supervisors").then((res) => setSupervisors(res.data));
  }

  useEffect(() => {
    Promise.all([reload(), api.get<string[]>("/supervisors/learning-areas").then((res) => setLearningAreaOptions(res.data))]).finally(
      () => setLoading(false)
    );
  }, []);

  function setField<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleArea(name: string) {
    setForm((prev) => ({
      ...prev,
      assignedLearningAreas: prev.assignedLearningAreas.includes(name)
        ? prev.assignedLearningAreas.filter((a) => a !== name)
        : [...prev.assignedLearningAreas, name],
    }));
  }

  function openAddModal() {
    setEditingSupervisor(null);
    setForm(emptyForm);
    setError(null);
    setShowModal(true);
  }

  function openEditModal(supervisor: Supervisor) {
    setEditingSupervisor(supervisor);
    setForm({ name: supervisor.name, email: supervisor.email, password: "", assignedLearningAreas: supervisor.assignedLearningAreas });
    setError(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.assignedLearningAreas.length === 0) {
      setError("Select at least one Assigned Learning Area");
      return;
    }
    setSaving(true);
    try {
      if (editingSupervisor) {
        await api.patch(`/supervisors/${editingSupervisor.id}`, {
          name: form.name,
          email: form.email,
          assignedLearningAreas: form.assignedLearningAreas,
        });
        showSuccess("Supervisor account updated");
      } else {
        await api.post("/supervisors", form);
        showSuccess("Supervisor account created");
      }
      await reload();
      setShowModal(false);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Failed to save supervisor account");
    } finally {
      setSaving(false);
    }
  }

  function handleDownloadTemplate() {
    const headers = ["name", "email", "password", "assignedLearningAreas"];
    const example = ["Dr. Juan Dela Cruz", "juan.delacruz@deped.gov.ph", "ChangeMe@2026", "English;Science;STEM"];
    const csv = [headers, example].map((row) => row.join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "supervisor_accounts_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleBulkUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!csvFile) return;

    setBulkError(null);
    setBulkResult(null);
    setBulkUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", csvFile);
      const res = await api.post<BulkSupervisorImportResponse>("/supervisors/bulk", formData);
      setBulkResult(res.data);
      setCsvFile(null);
      setCsvInputKey((k) => k + 1);
      await reload();
    } catch (err: any) {
      setBulkError(err?.response?.data?.message ?? "Failed to process the CSV file");
    } finally {
      setBulkUploading(false);
    }
  }

  // Quick removal of a single Assigned Learning Area directly from its chip —
  // no confirm dialog, unlike handleDelete below: unlike deleting the whole
  // account (which also removes the login), narrowing an assignment is
  // low-stakes and trivially reversible via the Edit modal. A supervisor must
  // always keep at least one area (same rule the backend enforces on
  // create/edit), so removing the last one is blocked client-side with an
  // explanatory message instead of sending a request that would 400.
  async function handleRemoveArea(supervisor: Supervisor, area: string) {
    if (supervisor.assignedLearningAreas.length <= 1) {
      setRowError('A supervisor must have at least one Assigned Learning Area — use "Edit" to replace it instead of removing the last one.');
      return;
    }
    setRowBusyId(supervisor.id);
    setRowError(null);
    try {
      const nextAreas = supervisor.assignedLearningAreas.filter((a) => a !== area);
      await api.patch(`/supervisors/${supervisor.id}`, { assignedLearningAreas: nextAreas });
      await reload();
      showSuccess(`Removed "${area}"`);
    } catch (err: any) {
      setRowError(err?.response?.data?.message ?? "Failed to remove learning area");
    } finally {
      setRowBusyId(null);
    }
  }

  async function handleDelete(supervisor: Supervisor) {
    const confirmed = await confirmDelete(
      `Delete "${supervisor.name}"?`,
      "This permanently removes their login account. This cannot be undone."
    );
    if (!confirmed) return;

    setRowBusyId(supervisor.id);
    try {
      await api.delete(`/supervisors/${supervisor.id}`);
      await reload();
      showSuccess("Supervisor account deleted");
    } catch (err: any) {
      setRowError(err?.response?.data?.message ?? "Failed to delete account");
    } finally {
      setRowBusyId(null);
    }
  }

  function openResetModal(supervisor: Supervisor) {
    setResetPasswordFor(supervisor);
    setResetPasswordValue("");
    setResetError(null);
  }

  function closeResetModal() {
    setResetPasswordFor(null);
    setResetError(null);
  }

  async function saveResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetPasswordFor) return;
    if (resetPasswordValue.length < 6) {
      setResetError("New password must be at least 6 characters");
      return;
    }
    setResetSaving(true);
    setResetError(null);
    try {
      await api.patch(`/supervisors/${resetPasswordFor.id}/reset-password`, { newPassword: resetPasswordValue });
      setResetPasswordFor(null);
      setResetPasswordValue("");
      showSuccess("Password reset");
    } catch (err: any) {
      setResetError(err?.response?.data?.message ?? "Failed to reset password");
    } finally {
      setResetSaving(false);
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <PageHeader
          eyebrow="Department of Education, Division of Guihulngan City"
          title="Division Supervisor Account"
          subtitle="CREATE AND MANAGE SUPERVISOR ACCOUNTS PER LEARNING AREA"
        />
        <div className="card-stack" style={{ marginTop: 20 }}>
          <div className="card">
            <div className="table-scroll">
              <SkeletonTable columns={4} />
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Department of Education, Division of Guihulngan City"
        title="Division Supervisor Account"
        subtitle="CREATE AND MANAGE SUPERVISOR ACCOUNTS PER LEARNING AREA"
      />

      <div className="card-stack">
        <div className="card">
          <h2 className="heading section-title">Bulk Upload (CSV)</h2>
          <div className="section-subtitle">
            Create many Division Supervisor accounts at once. The CSV's first row must be a header with these
            columns, in order: <code>name, email, password, assignedLearningAreas</code>.{" "}
            <code>assignedLearningAreas</code> is a semicolon-separated list of Learning Area names (e.g.{" "}
            <code>English;Science;STEM</code>). Each row is processed independently — one bad row won't block the
            rest.
          </div>

          <div style={{ padding: "0 26px 16px" }}>
            <button type="button" className="btn btn--ghost" onClick={handleDownloadTemplate}>
              <DownloadIcon /> Download CSV Template
            </button>
          </div>

          <form onSubmit={handleBulkUpload}>
            <div style={{ padding: "0 26px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <input
                key={csvInputKey}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
              />
              <button className="btn btn--primary" type="submit" disabled={!csvFile || bulkUploading}>
                <UploadIcon /> {bulkUploading ? "Uploading..." : "Upload CSV"}
              </button>
            </div>

            {bulkError && (
              <div style={{ padding: "16px 26px 0", color: "var(--status-red)", fontSize: 13, fontWeight: 600 }}>
                {bulkError}
              </div>
            )}
          </form>

          {bulkResult && (
            <div style={{ padding: "20px 26px 26px" }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <span className="pill pill--green">{bulkResult.created} Created</span>
                {bulkResult.failed > 0 && <span className="pill pill--red">{bulkResult.failed} Failed</span>}
              </div>
              <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Email</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkResult.results.map((r) => (
                    <tr key={r.row}>
                      <td>{r.row}</td>
                      <td>{r.email || "—"}</td>
                      <td>
                        {r.status === "created" ? (
                          <span className="pill pill--green">Created</span>
                        ) : (
                          <span style={{ color: "var(--status-red)", fontSize: 12.5 }}>{r.message}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ flex: "1 1 320px", minWidth: 0 }}>
              <h2 className="heading section-title">Division Supervisor Accounts</h2>
              <div className="section-subtitle">
                Each supervisor can view and download submitted LOA Result files for their assigned Learning
                Area(s) across every school — read-only, no upload or removal access.
              </div>
            </div>
            <button
              className="btn btn--primary"
              type="button"
              onClick={openAddModal}
              style={{ margin: "20px 26px 0 0", flexShrink: 0 }}
            >
              <UsersIcon /> Create Supervisor Account
            </button>
          </div>

          {rowError && (
            <div style={{ padding: "0 26px 16px", color: "var(--status-red)", fontSize: 13, fontWeight: 600 }}>{rowError}</div>
          )}

          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name of Supervisor</th>
                <th>DepEd Email</th>
                <th>Assigned Learning Area(s)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {supervisors.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ color: "var(--text-secondary)" }}>
                    No Division Supervisor accounts yet.
                  </td>
                </tr>
              )}
              {supervisors.map((s) => {
                const isBusy = rowBusyId === s.id;
                return (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 700 }}>{s.name}</td>
                    <td>{s.email}</td>
                    <td>
                      <div className="class-chip-list">
                        {s.assignedLearningAreas.map((area) => (
                          <span key={area} className="class-chip">
                            {area}
                            <button
                              type="button"
                              className="class-chip__remove"
                              disabled={isBusy}
                              onClick={() => handleRemoveArea(s, area)}
                              aria-label={`Remove ${area}`}
                              title={`Remove ${area}`}
                            >
                              <TrashIcon />
                            </button>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button type="button" className="table-icon-btn" title="Edit" onClick={() => openEditModal(s)}>
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        className="table-icon-btn"
                        title="Reset Password"
                        onClick={() => openResetModal(s)}
                      >
                        <LockIcon />
                      </button>
                      <button
                        type="button"
                        className="table-icon-btn table-icon-btn--danger"
                        title="Delete"
                        disabled={isBusy}
                        onClick={() => handleDelete(s)}
                      >
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {showModal && (
        <Modal title={editingSupervisor ? "Edit Supervisor Account" : "Create Supervisor Account"} onClose={closeModal}>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-field form-field--full">
                <label>Name of Supervisor</label>
                <input value={form.name} onChange={(e) => setField("name", e.target.value)} required />
              </div>
              <div className="form-field form-field--full">
                <label>DepEd Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  placeholder="supervisor@deped.gov.ph"
                  required
                />
                <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Used as the account's login email.</span>
              </div>
              {!editingSupervisor && (
                <div className="form-field form-field--full">
                  <label>Account Password</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setField("password", e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>
              )}
              <div className="form-field form-field--full">
                <label>Assigned Learning Area(s)</label>
                <div className="checkbox-list">
                  {learningAreaOptions.length === 0 ? (
                    <div className="checkbox-list__empty">No learning areas found.</div>
                  ) : (
                    groupLearningAreaOptions(learningAreaOptions).map((group) => (
                      <div key={group.label} className="checkbox-list__group">
                        <div className="checkbox-list__group-header">{group.label}</div>
                        {group.areas.map((area) => (
                          <label key={area} className="checkbox-list__item">
                            <input
                              type="checkbox"
                              checked={form.assignedLearningAreas.includes(area)}
                              onChange={() => toggleArea(area)}
                            />
                            {area}
                          </label>
                        ))}
                      </div>
                    ))
                  )}
                </div>
                <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                  Determines which LOA Result files this supervisor can view, across every grade that offers each
                  selected subject.
                </span>
              </div>
            </div>

            {error && (
              <div style={{ padding: "0 26px 16px", color: "var(--status-red)", fontSize: 13, fontWeight: 600 }}>{error}</div>
            )}

            <div className="form-actions">
              <button className="btn btn--ghost" type="button" onClick={closeModal}>
                Cancel
              </button>
              <button className="btn btn--primary" type="submit" disabled={saving} style={{ marginLeft: 10 }}>
                <UsersIcon /> {saving ? "Saving..." : editingSupervisor ? "Save Changes" : "Create Supervisor Account"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {resetPasswordFor && (
        <Modal title={`Reset Password — ${resetPasswordFor.name}`} onClose={closeResetModal}>
          <form onSubmit={saveResetPassword}>
            <div className="form-grid">
              <div className="form-field form-field--full">
                <label>New Password</label>
                <input
                  type="password"
                  value={resetPasswordValue}
                  onChange={(e) => setResetPasswordValue(e.target.value)}
                  placeholder="New password (min. 6 characters)"
                  required
                  minLength={6}
                />
              </div>
            </div>

            {resetError && (
              <div style={{ padding: "0 26px 16px", color: "var(--status-red)", fontSize: 13, fontWeight: 600 }}>
                {resetError}
              </div>
            )}

            <div className="form-actions">
              <button className="btn btn--ghost" type="button" onClick={closeResetModal}>
                Cancel
              </button>
              <button className="btn btn--primary" type="submit" disabled={resetSaving} style={{ marginLeft: 10 }}>
                <LockIcon /> {resetSaving ? "Resetting..." : "Reset Password"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </AppLayout>
  );
}

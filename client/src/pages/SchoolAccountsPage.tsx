import { useEffect, useState } from "react";
import AppLayout, { PageHeader } from "../layouts/AppLayout";
import Modal from "../components/Modal";
import { api } from "../api/client";
import type { BulkSchoolImportResponse, Cluster, School, SchoolLevel } from "../types/api";
import { UsersIcon, PencilIcon, TrashIcon, LockIcon, SearchIcon, UploadIcon, DownloadIcon } from "../icons/Icons";
import { confirmDelete, showSuccess, showError } from "../utils/alerts";
import { SkeletonTable } from "../components/Skeleton";
import "../styles/forms.css";

const SCHOOL_LEVELS: { value: SchoolLevel; label: string }[] = [
  { value: "ES", label: "Elementary School (ES)" },
  { value: "JHS", label: "Junior High School (JHS)" },
  { value: "JHS_SHS", label: "JHS and SHS" },
  { value: "SHS", label: "Senior High School (SHS)" },
];

const emptyForm = {
  schoolIdNumber: "",
  schoolName: "",
  schoolLevel: "ES" as SchoolLevel,
  clusterId: "",
  contactName: "",
  schoolEmail: "",
  accountPassword: "",
  forceGoogleSignIn: false,
  forceChairmenGoogleSignIn: false,
};

const emptyEditDraft = { schoolIdNumber: "", schoolName: "", schoolLevel: "ES" as SchoolLevel, clusterId: "" };

export default function SchoolAccountsPage() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Edit and Reset Password are each their own modal (converted from inline
  // table-row editing) -- editingSchool/resetPasswordFor hold the record
  // being acted on, or null when the modal is closed.
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [editDraft, setEditDraft] = useState(emptyEditDraft);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [resetPasswordFor, setResetPasswordFor] = useState<School | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSaving, setResetSaving] = useState(false);

  const [rowError, setRowError] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvInputKey, setCsvInputKey] = useState(0);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkSchoolImportResponse | null>(null);

  const filteredSchools = schools.filter((school) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return [school.schoolName, school.schoolIdNumber, school.cluster?.name, school.user?.email]
      .filter(Boolean)
      .some((field) => field!.toLowerCase().includes(q));
  });

  function reload() {
    return api.get<School[]>("/schools").then((res) => setSchools(res.data));
  }

  useEffect(() => {
    api.get<Cluster[]>("/clusters").then((res) => {
      setClusters(res.data);
      setForm((prev) => ({ ...prev, clusterId: res.data[0] ? String(res.data[0].id) : "" }));
    });
    reload().finally(() => setLoading(false));
  }, []);

  function setField<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openAddModal() {
    setForm((prev) => ({ ...emptyForm, clusterId: prev.clusterId }));
    setError(null);
    setShowAddModal(true);
  }

  function closeAddModal() {
    setShowAddModal(false);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post("/schools", { ...form, clusterId: Number(form.clusterId) });
      setForm((prev) => ({ ...emptyForm, clusterId: prev.clusterId }));
      await reload();
      showSuccess("School Admin created");
      setShowAddModal(false);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Failed to create school account");
    } finally {
      setSaving(false);
    }
  }

  function handleDownloadTemplate() {
    const headers = [
      "schoolIdNumber",
      "schoolName",
      "schoolLevel",
      "cluster",
      "contactName",
      "schoolHeadName",
      "schoolEmail",
      "accountPassword",
      "forceGoogleSignIn",
      "forceChairmenGoogleSignIn",
    ];
    const example = [
      "123456",
      "Sample Elementary School",
      "ES",
      "1",
      "Juan Dela Cruz",
      "",
      "123456@deped.gov.ph",
      "ChangeMe@2026",
      "false",
      "false",
    ];
    const csv = [headers, example].map((row) => row.join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "school_accounts_template.csv";
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
      const res = await api.post<BulkSchoolImportResponse>("/schools/bulk", formData);
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

  function openEditModal(school: School) {
    setEditingSchool(school);
    setEditDraft({
      schoolIdNumber: school.schoolIdNumber,
      schoolName: school.schoolName,
      schoolLevel: school.schoolLevel,
      clusterId: String(school.clusterId),
    });
    setEditError(null);
  }

  function closeEditModal() {
    setEditingSchool(null);
    setEditError(null);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingSchool) return;
    setEditSaving(true);
    setEditError(null);
    try {
      await api.patch(`/schools/${editingSchool.id}`, {
        schoolIdNumber: editDraft.schoolIdNumber,
        schoolName: editDraft.schoolName,
        schoolLevel: editDraft.schoolLevel,
        clusterId: Number(editDraft.clusterId),
      });
      setEditingSchool(null);
      await reload();
      showSuccess("School updated");
    } catch (err: any) {
      setEditError(err?.response?.data?.message ?? "Failed to update school");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDeleteSchool(school: School) {
    const confirmed = await confirmDelete(
      `Delete "${school.schoolName}"?`,
      "This permanently removes its profile, class sections, all submitted files, and its login account. This cannot be undone."
    );
    if (!confirmed) return;

    setRowBusyId(school.id);
    try {
      await api.delete(`/schools/${school.id}`);
      await reload();
      showSuccess("School deleted");
    } catch (err: any) {
      setRowError(err?.response?.data?.message ?? "Failed to delete school");
    } finally {
      setRowBusyId(null);
    }
  }

  // Immediate single-click toggle (no confirm modal, no separate save step)
  // -- same pattern as the "Set as Active Term"/"Set as Active Year" buttons
  // elsewhere, not the inline-row-editing pattern this page's Edit/Reset
  // Password moved away from on 2026-08-28. Reverting is just as immediate,
  // so there's nothing here that needs a confirmation step the way a
  // destructive action would.
  async function handleToggleForceGoogle(school: School, next: boolean) {
    if (!school.user) return;
    setRowBusyId(school.id);
    try {
      await api.patch(`/schools/${school.id}`, { forceGoogleSignIn: next });
      await reload();
      showSuccess(next ? "Google Sign-In is now required for this account" : "Password login re-enabled for this account");
    } catch (err: any) {
      showError(err?.response?.data?.message ?? "Failed to update this account's sign-in setting");
    } finally {
      setRowBusyId(null);
    }
  }

  // Same immediate single-click pattern as handleToggleForceGoogle above,
  // but this policy lives on School itself (not a specific User row) --
  // checked live at login time for every GRADE_CHAIRMAN under this school,
  // so it isn't gated on `school.user` existing the way the per-account
  // toggle is.
  async function handleToggleForceChairmenGoogle(school: School, next: boolean) {
    setRowBusyId(school.id);
    try {
      await api.patch(`/schools/${school.id}`, { forceChairmenGoogleSignIn: next });
      await reload();
      showSuccess(
        next
          ? "Google Sign-In is now required for every Grade Level Chairman under this school"
          : "Password login re-enabled for this school's Grade Level Chairmen"
      );
    } catch (err: any) {
      showError(err?.response?.data?.message ?? "Failed to update this school's chairman sign-in setting");
    } finally {
      setRowBusyId(null);
    }
  }

  function openResetModal(school: School) {
    setResetPasswordFor(school);
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
      await api.patch(`/schools/${resetPasswordFor.id}/reset-password`, { newPassword: resetPasswordValue });
      setResetPasswordFor(null);
      setResetPasswordValue("");
      showSuccess("Password reset");
    } catch (err: any) {
      setResetError(err?.response?.data?.message ?? "Failed to reset password");
    } finally {
      setResetSaving(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Department of Education, Division of Guihulngan City"
        title="School Admin"
        subtitle="CREATE AND MANAGE SCHOOL PROFILES AND LOGIN ACCOUNTS"
      />

      <div className="card-stack">
        <div className="card">
          <h2 className="heading section-title">Bulk Upload (CSV)</h2>
          <div className="section-subtitle">
            Create many School Admin accounts at once. The CSV's first row must be a header with these columns, in
            order: <code>schoolIdNumber, schoolName, schoolLevel, cluster, contactName, schoolHeadName,
            schoolEmail, accountPassword, forceGoogleSignIn, forceChairmenGoogleSignIn</code>. <code>schoolLevel</code> must
            be one of ES, JHS, JHS_SHS, SHS; <code>cluster</code> is the cluster number (1-10); <code>schoolHeadName</code> may
            be left blank; <code>forceGoogleSignIn</code> is <code>true</code>/<code>yes</code>/<code>1</code> to require
            Google Sign-In for the School Admin account itself, or blank/anything else for normal password login;
            <code>forceChairmenGoogleSignIn</code> is the same true/yes/1 values but requires Google Sign-In for every
            Grade Level Chairman account under that school instead.
            Each row is processed independently — one bad row won't block the rest.
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
                    <th>School ID Number</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkResult.results.map((r) => (
                    <tr key={r.row}>
                      <td>{r.row}</td>
                      <td>{r.schoolIdNumber || "—"}</td>
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
              <h2 className="heading section-title">School Admins</h2>
              <div className="section-subtitle">All registered schools and their login accounts.</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 26px 0 0", flexWrap: "wrap" }}>
              <button className="btn btn--primary" type="button" onClick={openAddModal}>
                <UsersIcon /> Create School Admin
              </button>
              <div className="search-box">
                <SearchIcon />
                <input
                  placeholder="Search by school, ID, cluster, or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>

          {rowError && (
            <div style={{ padding: "0 26px 16px", color: "var(--status-red)", fontSize: 13, fontWeight: 600 }}>{rowError}</div>
          )}

          <div className="table-scroll">
          {loading ? (
          <SkeletonTable columns={8} />
          ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>School</th>
                <th>ID Number</th>
                <th>Level</th>
                <th>Cluster</th>
                <th>Account</th>
                <th>Force Google Sign-In (School Admin)</th>
                <th>Force Google Sign-In (Chairmen)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSchools.map((school) => {
                const isBusy = rowBusyId === school.id;

                return (
                  <tr key={school.id}>
                    <td style={{ fontWeight: 700 }}>{school.schoolName}</td>
                    <td>{school.schoolIdNumber}</td>
                    <td>{school.schoolLevel}</td>
                    <td>{school.cluster?.name ?? "—"}</td>
                    <td>
                      {school.user ? (
                        <span className="pill pill--green">{school.user.email}</span>
                      ) : (
                        <span className="pill pill--slate">No Account</span>
                      )}
                    </td>
                    <td>
                      {school.user && (
                        <label className="toggle-switch" title="When on, this account can only sign in with its DepEd Google account — password login is rejected.">
                          <input
                            type="checkbox"
                            checked={school.user.forceGoogleSignIn}
                            disabled={isBusy}
                            onChange={(e) => handleToggleForceGoogle(school, e.target.checked)}
                          />
                          <span className="toggle-switch__track">
                            <span className="toggle-switch__thumb" />
                          </span>
                        </label>
                      )}
                    </td>
                    <td>
                      <label className="toggle-switch" title="When on, every Grade Level Chairman account under this school can only sign in with their DepEd Google account — password login is rejected.">
                        <input
                          type="checkbox"
                          checked={school.forceChairmenGoogleSignIn}
                          disabled={isBusy}
                          onChange={(e) => handleToggleForceChairmenGoogle(school, e.target.checked)}
                        />
                        <span className="toggle-switch__track">
                          <span className="toggle-switch__thumb" />
                        </span>
                      </label>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" className="table-icon-btn" title="Edit" onClick={() => openEditModal(school)}>
                          <PencilIcon />
                        </button>
                        {school.user && (
                          <button
                            type="button"
                            className="table-icon-btn"
                            title="Reset Password"
                            onClick={() => openResetModal(school)}
                          >
                            <LockIcon />
                          </button>
                        )}
                        <button
                          type="button"
                          className="table-icon-btn table-icon-btn--danger"
                          title="Delete School"
                          disabled={isBusy}
                          onClick={() => handleDeleteSchool(school)}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
          </div>

          {!loading && filteredSchools.length === 0 && (
            <p style={{ padding: "0 26px 24px", color: "var(--text-secondary)", fontSize: 13.5 }}>
              No schools match "{searchQuery}".
            </p>
          )}
        </div>
      </div>

      {showAddModal && (
        <Modal title="Create School Admin" onClose={closeAddModal}>
          <div className="section-subtitle">
            Registers the school's profile and creates its login account in one step.
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label>School ID Number</label>
                <input
                  value={form.schoolIdNumber}
                  onChange={(e) => setField("schoolIdNumber", e.target.value)}
                  placeholder="e.g. 303231"
                  required
                />
              </div>
              <div className="form-field">
                <label>School Name</label>
                <input
                  value={form.schoolName}
                  onChange={(e) => setField("schoolName", e.target.value)}
                  placeholder="e.g. Mandi-i Elementary School"
                  required
                />
              </div>
              <div className="form-field">
                <label>School Level</label>
                <select value={form.schoolLevel} onChange={(e) => setField("schoolLevel", e.target.value as SchoolLevel)}>
                  {SCHOOL_LEVELS.map((level) => (
                    <option key={level.value} value={level.value}>
                      {level.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Cluster</label>
                <select value={form.clusterId} onChange={(e) => setField("clusterId", e.target.value)}>
                  {clusters.map((cluster) => (
                    <option key={cluster.id} value={cluster.id}>
                      {cluster.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Contact Name</label>
                <input
                  value={form.contactName}
                  onChange={(e) => setField("contactName", e.target.value)}
                  placeholder="School focal person"
                  required
                />
              </div>
              <div className="form-field">
                <label>School Email</label>
                <input
                  type="email"
                  value={form.schoolEmail}
                  onChange={(e) => setField("schoolEmail", e.target.value)}
                  placeholder="school@deped.gov.ph"
                  required
                />
                <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Used as the school's login email.</span>
              </div>
              <div className="form-field">
                <label>Account Password</label>
                <input
                  type="password"
                  value={form.accountPassword}
                  onChange={(e) => setField("accountPassword", e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
              <div className="form-field form-field--full">
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={form.forceGoogleSignIn}
                    onChange={(e) => setField("forceGoogleSignIn", e.target.checked)}
                  />
                  <span className="toggle-switch__track">
                    <span className="toggle-switch__thumb" />
                  </span>
                  Force Google Sign-In
                </label>
                <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                  When on, this account can only sign in with its DepEd Google account — password login is rejected.
                  Can be changed later from the School Admins table.
                </span>
              </div>
              <div className="form-field form-field--full">
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={form.forceChairmenGoogleSignIn}
                    onChange={(e) => setField("forceChairmenGoogleSignIn", e.target.checked)}
                  />
                  <span className="toggle-switch__track">
                    <span className="toggle-switch__thumb" />
                  </span>
                  Force Google Sign-In for Grade Level Chairmen
                </label>
                <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                  When on, every Grade Level Chairman account this school creates can only sign in with their DepEd
                  Google account — password login is rejected. Can be changed later from the School Admins table.
                </span>
              </div>
            </div>

            {error && (
              <div style={{ padding: "0 26px 16px", color: "var(--status-red)", fontSize: 13, fontWeight: 600 }}>
                {error}
              </div>
            )}

            <div className="form-actions">
              <button className="btn btn--ghost" type="button" onClick={closeAddModal}>
                Cancel
              </button>
              <button className="btn btn--primary" type="submit" disabled={saving} style={{ marginLeft: 10 }}>
                <UsersIcon /> {saving ? "Creating..." : "Create School Admin"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editingSchool && (
        <Modal title="Edit School Admin" onClose={closeEditModal}>
          <form onSubmit={saveEdit}>
            <div className="form-grid">
              <div className="form-field">
                <label>School ID Number</label>
                <input
                  value={editDraft.schoolIdNumber}
                  onChange={(e) => setEditDraft((prev) => ({ ...prev, schoolIdNumber: e.target.value }))}
                  required
                />
              </div>
              <div className="form-field">
                <label>School Name</label>
                <input
                  value={editDraft.schoolName}
                  onChange={(e) => setEditDraft((prev) => ({ ...prev, schoolName: e.target.value }))}
                  required
                />
              </div>
              <div className="form-field">
                <label>School Level</label>
                <select
                  value={editDraft.schoolLevel}
                  onChange={(e) => setEditDraft((prev) => ({ ...prev, schoolLevel: e.target.value as SchoolLevel }))}
                >
                  {SCHOOL_LEVELS.map((level) => (
                    <option key={level.value} value={level.value}>
                      {level.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Cluster</label>
                <select
                  value={editDraft.clusterId}
                  onChange={(e) => setEditDraft((prev) => ({ ...prev, clusterId: e.target.value }))}
                >
                  {clusters.map((cluster) => (
                    <option key={cluster.id} value={cluster.id}>
                      {cluster.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {editError && (
              <div style={{ padding: "0 26px 16px", color: "var(--status-red)", fontSize: 13, fontWeight: 600 }}>
                {editError}
              </div>
            )}

            <div className="form-actions">
              <button className="btn btn--ghost" type="button" onClick={closeEditModal}>
                Cancel
              </button>
              <button className="btn btn--primary" type="submit" disabled={editSaving} style={{ marginLeft: 10 }}>
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {resetPasswordFor && (
        <Modal title={`Reset Password — ${resetPasswordFor.schoolName}`} onClose={closeResetModal}>
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

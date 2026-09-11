import { useEffect, useState } from "react";
import AppLayout, { PageHeader } from "../layouts/AppLayout";
import Modal from "../components/Modal";
import { api } from "../api/client";
import type { Chairman, School } from "../types/api";
import { UsersIcon, PencilIcon, TrashIcon, LockIcon } from "../icons/Icons";
import { confirmDelete, showSuccess } from "../utils/alerts";
import { SkeletonTable } from "../components/Skeleton";
import "../styles/forms.css";

const emptyForm = { name: "", email: "", password: "", gradeLevelIds: [] as number[], multigrade: false };

export default function ChairmanAccountsPage() {
  const [school, setSchool] = useState<School | null>(null);
  const [chairmen, setChairmen] = useState<Chairman[]>([]);
  const [loading, setLoading] = useState(true);

  // A single modal handles both create and edit (unified, same pattern as
  // Supervisor's account modal) — editingChairman holds the record being
  // edited, or null when creating a new one.
  const [showModal, setShowModal] = useState(false);
  const [editingChairman, setEditingChairman] = useState<Chairman | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset Password is its own modal (converted from inline table-row editing).
  const [resetPasswordFor, setResetPasswordFor] = useState<Chairman | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSaving, setResetSaving] = useState(false);

  const [rowError, setRowError] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<number | null>(null);

  function reload() {
    return Promise.all([
      api.get<School>("/schools/me").then((res) => setSchool(res.data)),
      api.get<Chairman[]>("/chairmen").then((res) => setChairmen(res.data)),
    ]);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  function setField<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openAddModal() {
    setEditingChairman(null);
    setForm(emptyForm);
    setError(null);
    setShowModal(true);
  }

  function openEditModal(chairman: Chairman) {
    setEditingChairman(chairman);
    setForm({
      name: chairman.name,
      email: chairman.email,
      password: "",
      gradeLevelIds: chairman.gradeLevelIds,
      multigrade: chairman.multigrade,
    });
    setError(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setError(null);
  }

  // Turning Multigrade off narrows the selection down to just the first
  // grade already picked, rather than blocking the toggle with a validation
  // error the admin would then have to go fix by hand -- the resulting state
  // is always valid the moment the toggle is flipped.
  function setMultigrade(next: boolean) {
    setForm((prev) => ({ ...prev, multigrade: next, gradeLevelIds: next ? prev.gradeLevelIds : prev.gradeLevelIds.slice(0, 1) }));
  }

  function toggleGradeLevel(id: number) {
    setForm((prev) => ({
      ...prev,
      gradeLevelIds: prev.gradeLevelIds.includes(id)
        ? prev.gradeLevelIds.filter((g) => g !== id)
        : [...prev.gradeLevelIds, id],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.gradeLevelIds.length === 0) {
      setError("Select at least one grade level");
      return;
    }
    setSaving(true);
    try {
      const payload = { name: form.name, email: form.email, gradeLevelIds: form.gradeLevelIds, multigrade: form.multigrade };
      if (editingChairman) {
        await api.patch(`/chairmen/${editingChairman.id}`, payload);
        showSuccess("Account updated");
      } else {
        await api.post("/chairmen", { ...payload, password: form.password });
        showSuccess("Chairman account created");
      }
      await reload();
      setShowModal(false);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Failed to save Grade Level Chairman account");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(chairman: Chairman) {
    const confirmed = await confirmDelete(`Delete "${chairman.name}"?`, "This permanently removes their login account.");
    if (!confirmed) return;

    setRowBusyId(chairman.id);
    try {
      await api.delete(`/chairmen/${chairman.id}`);
      await reload();
      showSuccess("Chairman account deleted");
    } catch (err: any) {
      setRowError(err?.response?.data?.message ?? "Failed to delete account");
    } finally {
      setRowBusyId(null);
    }
  }

  function openResetModal(chairman: Chairman) {
    setResetPasswordFor(chairman);
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
      await api.patch(`/chairmen/${resetPasswordFor.id}/reset-password`, { newPassword: resetPasswordValue });
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
          title="Grade Level Chairman Accounts"
          subtitle="ADD AND MANAGE PER-GRADE LOA SUBMISSION ACCOUNTS"
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

  const gradeLevels = school?.gradeLevels ?? [];

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Department of Education, Division of Guihulngan City"
        title="Grade Level Chairman Accounts"
        subtitle="ADD AND MANAGE PER-GRADE LOA SUBMISSION ACCOUNTS"
      />

      <div className="card-stack">
        <div className="card">
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ flex: "1 1 320px", minWidth: 0 }}>
              <h2 className="heading section-title">Existing Grade Level Chairmen</h2>
            </div>
            <button
              className="btn btn--primary"
              type="button"
              onClick={openAddModal}
              style={{ margin: "20px 26px 0 0", flexShrink: 0 }}
            >
              <UsersIcon /> Add Chairman Account
            </button>
          </div>

          {rowError && (
            <div style={{ padding: "0 26px 16px", color: "var(--status-red)", fontSize: 13, fontWeight: 600 }}>
              {rowError}
            </div>
          )}

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Grade Level</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {chairmen.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ color: "var(--text-secondary)" }}>
                      No Grade Level Chairman accounts yet.
                    </td>
                  </tr>
                )}
                {chairmen.map((c) => {
                  const isBusy = rowBusyId === c.id;
                  return (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 700 }}>{c.name}</td>
                      <td>{c.email}</td>
                      <td>
                        {c.gradeLevels.map((g) => g.gradeName).join(", ")}
                        {c.multigrade && (
                          <span className="pill pill--blue" style={{ marginLeft: 8 }}>
                            Multigrade
                          </span>
                        )}
                      </td>
                      <td style={{ display: "flex", gap: 6 }}>
                        <button type="button" className="table-icon-btn" title="Edit" onClick={() => openEditModal(c)}>
                          <PencilIcon />
                        </button>
                        <button
                          type="button"
                          className="table-icon-btn"
                          title="Reset Password"
                          onClick={() => openResetModal(c)}
                        >
                          <LockIcon />
                        </button>
                        <button
                          type="button"
                          className="table-icon-btn table-icon-btn--danger"
                          title="Delete"
                          disabled={isBusy}
                          onClick={() => handleDelete(c)}
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
        <Modal title={editingChairman ? "Edit Grade Level Chairman" : "Add Grade Level Chairman"} onClose={closeModal}>
          {!editingChairman && (
            <div className="section-subtitle">
              Each account is normally assigned to exactly one Grade Level
              {school?.schoolLevel === "ES" ? " — turn on Multigrade below to assign more than one" : ""}. A Grade
              Level Chairman can upload, view, download, and remove LOA files for their assigned grade(s) only, and
              can view Status of Submission scoped to those grades — they have no access to School Profile.
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-field form-field--full">
                <label>Name</label>
                <input value={form.name} onChange={(e) => setField("name", e.target.value)} required />
              </div>
              <div className="form-field form-field--full">
                <label>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  placeholder="chairman@deped.gov.ph"
                  required
                />
              </div>
              {!editingChairman && (
                <div className="form-field">
                  <label>Password</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setField("password", e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
              )}
              {school?.schoolLevel === "ES" && (
                <div className="form-field form-field--full">
                  <label className="toggle-switch">
                    <input type="checkbox" checked={form.multigrade} onChange={(e) => setMultigrade(e.target.checked)} />
                    <span className="toggle-switch__track">
                      <span className="toggle-switch__thumb" />
                    </span>
                    Multigrade
                  </label>
                  <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                    When on, this account can be assigned more than one grade level below.
                  </span>
                </div>
              )}
              <div className="form-field form-field--full">
                <label>Grade Level{form.multigrade ? "(s)" : ""}</label>
                {form.multigrade ? (
                  <div className="checkbox-list">
                    {gradeLevels.length === 0 ? (
                      <div className="checkbox-list__empty">No grade levels found.</div>
                    ) : (
                      gradeLevels.map((g) => (
                        <label key={g.id} className="checkbox-list__item">
                          <input
                            type="checkbox"
                            checked={form.gradeLevelIds.includes(g.id)}
                            onChange={() => toggleGradeLevel(g.id)}
                          />
                          {g.gradeName}
                        </label>
                      ))
                    )}
                  </div>
                ) : (
                  <select
                    value={form.gradeLevelIds[0] ?? ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, gradeLevelIds: [Number(e.target.value)] }))}
                    required
                  >
                    <option value="" disabled>
                      Select a grade level
                    </option>
                    {gradeLevels.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.gradeName}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {error && (
              <div style={{ padding: "0 26px 16px", color: "var(--status-red)", fontSize: 13, fontWeight: 600 }}>
                {error}
              </div>
            )}

            <div className="form-actions">
              <button className="btn btn--ghost" type="button" onClick={closeModal}>
                Cancel
              </button>
              <button className="btn btn--primary" type="submit" disabled={saving} style={{ marginLeft: 10 }}>
                <UsersIcon /> {saving ? "Saving..." : editingChairman ? "Save Changes" : "Add Chairman Account"}
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

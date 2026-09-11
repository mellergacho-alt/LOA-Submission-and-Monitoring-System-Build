import { useEffect, useState } from "react";
import AppLayout, { PageHeader } from "../layouts/AppLayout";
import Modal from "../components/Modal";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { AdminAccount } from "../types/api";
import { UserIcon, PencilIcon, TrashIcon, LockIcon } from "../icons/Icons";
import { confirmDelete, showSuccess } from "../utils/alerts";
import { SkeletonTable } from "../components/Skeleton";
import "../styles/forms.css";

const emptyForm = { name: "", email: "", password: "" };

export default function AdminAccountsPage() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);

  // A single modal handles both create and edit (unified, same pattern as
  // Supervisor's account modal) — editingAdmin holds the record being edited,
  // or null when creating a new one.
  const [showModal, setShowModal] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<AdminAccount | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset Password is its own modal (converted from inline table-row editing).
  const [resetPasswordFor, setResetPasswordFor] = useState<AdminAccount | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSaving, setResetSaving] = useState(false);

  const [rowError, setRowError] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<number | null>(null);

  function reload() {
    return api.get<AdminAccount[]>("/admins").then((res) => setAdmins(res.data));
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  function setField<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openAddModal() {
    setEditingAdmin(null);
    setForm(emptyForm);
    setError(null);
    setShowModal(true);
  }

  function openEditModal(admin: AdminAccount) {
    setEditingAdmin(admin);
    setForm({ name: admin.name, email: admin.email, password: "" });
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
    setSaving(true);
    try {
      if (editingAdmin) {
        await api.patch(`/admins/${editingAdmin.id}`, { name: form.name, email: form.email });
        showSuccess("Admin account updated");
      } else {
        await api.post("/admins", form);
        showSuccess("Division Admin account created");
      }
      await reload();
      setShowModal(false);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Failed to save admin account");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(admin: AdminAccount) {
    const confirmed = await confirmDelete(`Delete "${admin.name}"?`, "This permanently removes their login account.");
    if (!confirmed) return;

    setRowBusyId(admin.id);
    try {
      await api.delete(`/admins/${admin.id}`);
      await reload();
      showSuccess("Admin account deleted");
    } catch (err: any) {
      setRowError(err?.response?.data?.message ?? "Failed to delete admin account");
    } finally {
      setRowBusyId(null);
    }
  }

  function openResetModal(admin: AdminAccount) {
    setResetPasswordFor(admin);
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
      await api.patch(`/admins/${resetPasswordFor.id}/reset-password`, { newPassword: resetPasswordValue });
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
          title="Division Admin Account"
          subtitle="CREATE AND MANAGE DIVISION ADMINISTRATOR ACCOUNTS"
        />
        <div className="card-stack" style={{ marginTop: 20 }}>
          <div className="card">
            <div className="table-scroll">
              <SkeletonTable columns={3} />
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
        title="Division Admin Account"
        subtitle="CREATE AND MANAGE DIVISION ADMINISTRATOR ACCOUNTS"
      />

      <div className="card-stack">
        <div className="card">
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ flex: "1 1 320px", minWidth: 0 }}>
              <h2 className="heading section-title">Division Admin Accounts</h2>
              <div className="section-subtitle">
                All Division Administrator login accounts. Your own account is managed from Admin Profile, not
                here.
              </div>
            </div>
            <button
              className="btn btn--primary"
              type="button"
              onClick={openAddModal}
              style={{ margin: "20px 26px 0 0", flexShrink: 0 }}
            >
              <UserIcon /> Create Admin Account
            </button>
          </div>

          {rowError && (
            <div style={{ padding: "0 26px 16px", color: "var(--status-red)", fontSize: 13, fontWeight: 600 }}>{rowError}</div>
          )}

          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>DepEd Email</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ color: "var(--text-secondary)" }}>
                    No Division Admin accounts yet.
                  </td>
                </tr>
              )}
              {admins.map((admin) => {
                const isSelf = admin.id === user?.id;
                const isBusy = rowBusyId === admin.id;

                return (
                  <tr key={admin.id}>
                    <td style={{ fontWeight: 700 }}>
                      {admin.name}
                      {isSelf && (
                        <span className="pill pill--slate" style={{ marginLeft: 8 }}>
                          You
                        </span>
                      )}
                    </td>
                    <td>{admin.email}</td>
                    <td>
                      {isSelf ? (
                        <span style={{ color: "var(--text-muted)", fontSize: 12.5 }}>
                          Managed via Admin Profile
                        </span>
                      ) : (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            type="button"
                            className="table-icon-btn"
                            title="Edit"
                            onClick={() => openEditModal(admin)}
                          >
                            <PencilIcon />
                          </button>
                          <button
                            type="button"
                            className="table-icon-btn"
                            title="Reset Password"
                            onClick={() => openResetModal(admin)}
                          >
                            <LockIcon />
                          </button>
                          <button
                            type="button"
                            className="table-icon-btn table-icon-btn--danger"
                            title="Delete"
                            disabled={isBusy}
                            onClick={() => handleDelete(admin)}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      )}
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
        <Modal title={editingAdmin ? "Edit Admin Account" : "Create Division Admin Account"} onClose={closeModal}>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-field form-field--full">
                <label>Name</label>
                <input value={form.name} onChange={(e) => setField("name", e.target.value)} required />
              </div>
              <div className="form-field form-field--full">
                <label>DepEd Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  placeholder="admin@deped.gov.ph"
                  required
                />
                <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Used as the account's login email.</span>
              </div>
              {!editingAdmin && (
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
                <UserIcon /> {saving ? "Saving..." : editingAdmin ? "Save Changes" : "Create Admin Account"}
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

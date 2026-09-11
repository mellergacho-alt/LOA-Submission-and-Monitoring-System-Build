import { useEffect, useState } from "react";
import AppLayout, { PageHeader } from "../layouts/AppLayout";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import ChangePasswordForm from "../components/ChangePasswordForm";
import { UserIcon } from "../icons/Icons";
import { showSuccess } from "../utils/alerts";
import "../styles/forms.css";

export default function AdminProfilePage() {
  const { user, refreshUser } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
  }, [user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.patch("/auth/profile", { name, email });
      await refreshUser();
      showSuccess("Account information updated");
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Failed to update account information");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Department of Education, Division of Guihulngan City"
        title="Admin Profile"
        subtitle="ACCOUNT INFORMATION AND SECURITY"
      />

      <div className="card-stack">
        <div className="card">
          <h2 className="heading section-title">Account Information</h2>
          <div className="section-subtitle">Your administrator account details.</div>

          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label>Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="form-field">
                <label>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="form-field">
                <label>Role</label>
                <input value="Administrator" disabled />
              </div>
            </div>

            {error && (
              <div style={{ padding: "0 26px 16px", color: "var(--status-red)", fontSize: 13, fontWeight: 600 }}>
                {error}
              </div>
            )}

            <div className="form-actions">
              <button className="btn btn--primary" type="submit" disabled={saving}>
                <UserIcon /> {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <h2 className="heading section-title">Security</h2>
          <div className="section-subtitle">Update the password used to sign in.</div>
          <ChangePasswordForm />
        </div>
      </div>
    </AppLayout>
  );
}

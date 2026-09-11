import { useState } from "react";
import { api } from "../api/client";
import { LockIcon } from "../icons/Icons";
import { showSuccess } from "../utils/alerts";

export default function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match");
      return;
    }

    setSaving(true);
    try {
      await api.patch("/auth/password", { currentPassword, newPassword });
      showSuccess("Password updated successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Failed to update password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-grid">
        <div className="form-field form-field--full">
          <label>Current Password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
        <div className="form-field">
          <label>New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>
        <div className="form-field">
          <label>Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>
      </div>

      {error && (
        <div style={{ padding: "0 26px 16px", color: "var(--status-red)", fontSize: 13, fontWeight: 600 }}>
          {error}
        </div>
      )}

      <div className="form-actions">
        <button className="btn btn--primary" type="submit" disabled={saving}>
          <LockIcon /> {saving ? "Updating..." : "Update Password"}
        </button>
      </div>
    </form>
  );
}

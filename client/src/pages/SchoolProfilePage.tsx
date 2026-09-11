import { useEffect, useState } from "react";
import AppLayout, { PageHeader } from "../layouts/AppLayout";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { Cluster, School, SchoolLevel } from "../types/api";
import { SchoolIcon } from "../icons/Icons";
import ChangePasswordForm from "../components/ChangePasswordForm";
import { showSuccess } from "../utils/alerts";
import { SkeletonCard } from "../components/Skeleton";
import "../styles/forms.css";

const SCHOOL_LEVELS: { value: SchoolLevel; label: string }[] = [
  { value: "ES", label: "Elementary School (ES)" },
  { value: "JHS", label: "Junior High School (JHS)" },
  { value: "JHS_SHS", label: "JHS and SHS" },
  { value: "SHS", label: "Senior High School (SHS)" },
];

export default function SchoolProfilePage() {
  const { refreshUser } = useAuth();
  const [school, setSchool] = useState<School | null>(null);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);

  const [schoolIdNumber, setSchoolIdNumber] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [schoolHeadName, setSchoolHeadName] = useState("");
  const [schoolEmail, setSchoolEmail] = useState("");
  const [schoolLevel, setSchoolLevel] = useState<SchoolLevel>("ES");
  const [clusterId, setClusterId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    return api.get<School>("/schools/me").then((res) => {
      setSchool(res.data);
      setSchoolIdNumber(res.data.schoolIdNumber);
      setSchoolName(res.data.schoolName);
      setSchoolHeadName(res.data.schoolHeadName ?? "");
      setSchoolEmail(res.data.schoolEmail ?? "");
      setSchoolLevel(res.data.schoolLevel);
      setClusterId(res.data.clusterId);
    });
  }

  useEffect(() => {
    Promise.all([reload(), api.get<Cluster[]>("/clusters").then((res) => setClusters(res.data))]).finally(() =>
      setLoading(false)
    );
  }, []);

  async function handleSaveBasicInfo(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.patch("/schools/me", {
        schoolIdNumber,
        schoolName,
        schoolHeadName,
        schoolEmail,
        schoolLevel,
        clusterId,
      });
      await Promise.all([reload(), refreshUser()]);
      showSuccess("Basic information updated");
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Failed to update school information");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <PageHeader
          eyebrow="Department of Education, Division of Guihulngan City"
          title="School Profile"
          subtitle="SCHOOL IDENTITY AND ACCOUNT SECURITY"
        />
        <div className="card-stack" style={{ marginTop: 20 }}>
          <SkeletonCard lines={5} />
          <SkeletonCard lines={2} />
        </div>
      </AppLayout>
    );
  }

  if (!school) return null;

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Department of Education, Division of Guihulngan City"
        title="School Profile"
        subtitle="SCHOOL IDENTITY AND ACCOUNT SECURITY"
      />

      <div className="card-stack">
        <div className="card">
          <h2 className="heading section-title">Basic Information</h2>
          <div className="section-subtitle">School identity, level, and cluster assignment</div>

          <form onSubmit={handleSaveBasicInfo}>
            <div className="form-grid">
              <div className="form-field">
                <label>School ID Number</label>
                <input value={schoolIdNumber} onChange={(e) => setSchoolIdNumber(e.target.value)} required />
              </div>
              <div className="form-field">
                <label>School Name</label>
                <input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} required />
              </div>
              <div className="form-field">
                <label>Name of School Head</label>
                <input
                  value={schoolHeadName}
                  onChange={(e) => setSchoolHeadName(e.target.value)}
                  placeholder="e.g. Juan Dela Cruz"
                />
              </div>
              <div className="form-field">
                <label>School Email</label>
                <input
                  type="email"
                  value={schoolEmail}
                  onChange={(e) => setSchoolEmail(e.target.value)}
                  placeholder="school@deped.gov.ph"
                />
                <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                  This is also your login email — changing it changes what you sign in with.
                </span>
              </div>
              <div className="form-field">
                <label>School Level</label>
                <select value={schoolLevel} onChange={(e) => setSchoolLevel(e.target.value as SchoolLevel)}>
                  {SCHOOL_LEVELS.map((level) => (
                    <option key={level.value} value={level.value}>
                      {level.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Cluster</label>
                <select value={clusterId} onChange={(e) => setClusterId(Number(e.target.value))}>
                  {clusters.map((cluster) => (
                    <option key={cluster.id} value={cluster.id}>
                      {cluster.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <div style={{ padding: "0 26px 16px", color: "var(--status-red)", fontSize: 13, fontWeight: 600 }}>
                {error}
              </div>
            )}

            <div className="form-actions">
              <button className="btn btn--primary" type="submit" disabled={saving}>
                <SchoolIcon /> {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <h2 className="heading section-title">Security</h2>
          {school?.user?.forceGoogleSignIn ? (
            <>
              <div className="section-subtitle">Password login is turned off for this account.</div>
              <div style={{ padding: "0 26px 26px", color: "var(--text-secondary)", fontSize: 13.5 }}>
                Your Division Admin has set this account to sign in with Google only — password login is disabled,
                so there's nothing to change here. Contact your Division Admin if you need this turned back on.
              </div>
            </>
          ) : (
            <>
              <div className="section-subtitle">Update the password used to sign in.</div>
              <ChangePasswordForm />
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

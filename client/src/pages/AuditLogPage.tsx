import { useEffect, useState } from "react";
import AppLayout, { PageHeader } from "../layouts/AppLayout";
import { api } from "../api/client";
import type { AuditAction, AuditLog, AuditLogResponse, Role } from "../types/api";
import { SearchIcon, HistoryIcon } from "../icons/Icons";
import { SkeletonTable } from "../components/Skeleton";
import "../styles/forms.css";

const ACTION_LABELS: Record<AuditAction, string> = {
  LOGIN_SUCCESS: "Login Success",
  LOGIN_FAILURE: "Login Failure",
  SCHOOL_ACCOUNT_CREATE: "School Admin Created",
  SCHOOL_ACCOUNT_UPDATE: "School Admin Updated",
  SCHOOL_ACCOUNT_DELETE: "School Admin Deleted",
  SCHOOL_ACCOUNT_PASSWORD_RESET: "School Admin Password Reset",
  CHAIRMAN_CREATE: "Chairman Created",
  CHAIRMAN_UPDATE: "Chairman Updated",
  CHAIRMAN_DELETE: "Chairman Deleted",
  CHAIRMAN_PASSWORD_RESET: "Chairman Password Reset",
  SUPERVISOR_CREATE: "Supervisor Created",
  SUPERVISOR_UPDATE: "Supervisor Updated",
  SUPERVISOR_DELETE: "Supervisor Deleted",
  SUPERVISOR_PASSWORD_RESET: "Supervisor Password Reset",
  ADMIN_CREATE: "Admin Created",
  ADMIN_UPDATE: "Admin Updated",
  ADMIN_DELETE: "Admin Deleted",
  ADMIN_PASSWORD_RESET: "Admin Password Reset",
  SUBMISSION_UPLOAD: "File Uploaded",
  SUBMISSION_ACCESS: "File Viewed/Downloaded",
  SUBMISSION_DELETE: "File Removed",
};

const ACTION_PILL_CLASS: Record<AuditAction, string> = {
  LOGIN_SUCCESS: "pill--green",
  LOGIN_FAILURE: "pill--red",
  SCHOOL_ACCOUNT_CREATE: "pill--green",
  SCHOOL_ACCOUNT_UPDATE: "pill--blue",
  SCHOOL_ACCOUNT_DELETE: "pill--red",
  SCHOOL_ACCOUNT_PASSWORD_RESET: "pill--amber",
  CHAIRMAN_CREATE: "pill--green",
  CHAIRMAN_UPDATE: "pill--blue",
  CHAIRMAN_DELETE: "pill--red",
  CHAIRMAN_PASSWORD_RESET: "pill--amber",
  SUPERVISOR_CREATE: "pill--green",
  SUPERVISOR_UPDATE: "pill--blue",
  SUPERVISOR_DELETE: "pill--red",
  SUPERVISOR_PASSWORD_RESET: "pill--amber",
  ADMIN_CREATE: "pill--green",
  ADMIN_UPDATE: "pill--blue",
  ADMIN_DELETE: "pill--red",
  ADMIN_PASSWORD_RESET: "pill--amber",
  SUBMISSION_UPLOAD: "pill--green",
  SUBMISSION_ACCESS: "pill--slate",
  SUBMISSION_DELETE: "pill--red",
};

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Division Admin",
  SCHOOL: "School Admin",
  GRADE_CHAIRMAN: "Grade Level Chairman",
  SUPERVISOR: "Division Supervisor",
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [action, setAction] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  function reload() {
    setLoading(true);
    setError(null);
    const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
    if (action) params.action = action;
    if (role) params.role = role;
    if (search.trim()) params.q = search.trim();
    if (from) params.from = new Date(from).toISOString();
    if (to) params.to = new Date(to + "T23:59:59").toISOString();

    return api
      .get<AuditLogResponse>("/audit-logs", { params })
      .then((res) => {
        setLogs(res.data.logs);
        setTotal(res.data.total);
      })
      .catch((err) => setError(err?.response?.data?.message ?? "Failed to load audit logs"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function applyFilters() {
    if (page === 1) reload();
    else setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Department of Education, Division of Guihulngan City"
        title="Audit Log"
        subtitle="SECURITY-SENSITIVE ACTIVITY ACROSS EVERY ACCOUNT AND FILE ACCESS"
      />

      <div className="card-stack">
        <div className="card">
          <div style={{ padding: "20px 26px 0", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div className="form-field" style={{ flex: "0 0 200px" }}>
              <label>Action</label>
              <select value={action} onChange={(e) => setAction(e.target.value)}>
                <option value="">All Actions</option>
                {(Object.keys(ACTION_LABELS) as AuditAction[]).map((a) => (
                  <option key={a} value={a}>
                    {ACTION_LABELS[a]}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field" style={{ flex: "0 0 180px" }}>
              <label>Actor Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">All Roles</option>
                {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field" style={{ flex: "0 0 160px" }}>
              <label>From</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="form-field" style={{ flex: "0 0 160px" }}>
              <label>To</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="form-field" style={{ flex: "1 1 220px" }}>
              <label>Search</label>
              <div className="search-box">
                <SearchIcon />
                <input
                  placeholder="Search by actor, email, or details..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                />
              </div>
            </div>
            <button className="btn btn--primary" type="button" onClick={applyFilters} style={{ flexShrink: 0 }}>
              <HistoryIcon /> Apply Filters
            </button>
          </div>

          {error && (
            <div style={{ padding: "16px 26px 0", color: "var(--status-red)", fontSize: 13, fontWeight: 600 }}>
              {error}
            </div>
          )}

          <div style={{ padding: "20px 26px 26px", overflowX: "auto" }}>
            {loading ? (
              <SkeletonTable columns={5} />
            ) : logs.length === 0 ? (
              <p style={{ color: "var(--text-secondary)" }}>No audit log entries match these filters.</p>
            ) : (
              <>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Target</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td style={{ whiteSpace: "nowrap" }}>{formatTimestamp(log.createdAt)}</td>
                        <td>
                          {log.actorName ? (
                            <>
                              <div style={{ fontWeight: 700 }}>{log.actorName}</div>
                              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{log.actorEmail}</div>
                              {log.actorRole && (
                                <span className="pill pill--slate" style={{ marginTop: 4 }}>
                                  {ROLE_LABELS[log.actorRole]}
                                </span>
                              )}
                            </>
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>Unauthenticated</span>
                          )}
                        </td>
                        <td>
                          <span className={`pill ${ACTION_PILL_CLASS[log.action]}`}>{ACTION_LABELS[log.action]}</span>
                        </td>
                        <td>
                          {log.targetType ? (
                            <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                              {log.targetType} #{log.targetId}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td style={{ fontSize: 12.5, color: "var(--text-secondary)", maxWidth: 380 }}>
                          {log.details ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, flexWrap: "wrap", gap: 10 }}>
                  <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                    {total.toLocaleString()} total entries — page {page} of {totalPages}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import RouteLoadingFallback from "./components/RouteLoadingFallback";
// LoginPage stays a normal eager import -- it's the one page nearly every
// session hits first, so splitting it into its own chunk would only add a
// fetch delay before the very first paint with no real benefit. Every other
// page is behind auth and lazy-loaded below, so a role only ever downloads
// the pages its own portal actually uses.
import LoginPage from "./pages/LoginPage";
import { DOCUMENT_TYPES } from "./utils/documentTypes";

const SchoolProfilePage = lazy(() => import("./pages/SchoolProfilePage"));
const OrganizedClassesPage = lazy(() => import("./pages/OrganizedClassesPage"));
const LOASubmissionPage = lazy(() => import("./pages/LOASubmissionPage"));
const StatusOfSubmissionPage = lazy(() => import("./pages/StatusOfSubmissionPage"));
const AdminProfilePage = lazy(() => import("./pages/AdminProfilePage"));
const SchoolYearTermPage = lazy(() => import("./pages/SchoolYearTermPage"));
const SchoolAccountsPage = lazy(() => import("./pages/SchoolAccountsPage"));
const SupervisorAccountsPage = lazy(() => import("./pages/SupervisorAccountsPage"));
const SupervisorLOAResultPage = lazy(() => import("./pages/SupervisorLOAResultPage"));
const AdminAccountsPage = lazy(() => import("./pages/AdminAccountsPage"));
const ChairmanAccountsPage = lazy(() => import("./pages/ChairmanAccountsPage"));
const ChairmanProfilePage = lazy(() => import("./pages/ChairmanProfilePage"));
const SupervisorProfilePage = lazy(() => import("./pages/SupervisorProfilePage"));
const AuditLogPage = lazy(() => import("./pages/AuditLogPage"));

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<LoginPage />} />

            {/* School Portal */}
            <Route
              path="/school-profile"
              element={
                <ProtectedRoute roles={["SCHOOL"]}>
                  <SchoolProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/organized-classes"
              element={
                <ProtectedRoute roles={["SCHOOL"]}>
                  <OrganizedClassesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/loa-submission"
              element={<Navigate to={`/loa-submission/${DOCUMENT_TYPES[0].slug}`} replace />}
            />
            {DOCUMENT_TYPES.map((d) => (
              <Route
                key={d.slug}
                path={`/loa-submission/${d.slug}`}
                element={
                  <ProtectedRoute roles={["SCHOOL", "GRADE_CHAIRMAN"]}>
                    <LOASubmissionPage documentType={d.value} />
                  </ProtectedRoute>
                }
              />
            ))}
            <Route
              path="/chairman-profile"
              element={
                <ProtectedRoute roles={["GRADE_CHAIRMAN"]}>
                  <ChairmanProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/chairmen"
              element={
                <ProtectedRoute roles={["SCHOOL"]}>
                  <ChairmanAccountsPage />
                </ProtectedRoute>
              }
            />

            {/* Shared: content is scoped by role server-side */}
            <Route path="/status" element={<Navigate to={`/status/${DOCUMENT_TYPES[0].slug}`} replace />} />
            {DOCUMENT_TYPES.map((d) => (
              <Route
                key={d.slug}
                path={`/status/${d.slug}`}
                element={
                  <ProtectedRoute roles={["ADMIN", "SCHOOL", "GRADE_CHAIRMAN"]}>
                    <StatusOfSubmissionPage documentType={d.value} />
                  </ProtectedRoute>
                }
              />
            ))}

            {/* Admin Dashboard */}
            <Route
              path="/admin-profile"
              element={
                <ProtectedRoute roles={["ADMIN"]}>
                  <AdminProfilePage />
                </ProtectedRoute>
              }
            />
            <Route path="/school-accounts" element={<Navigate to="/school-accounts/school-year-term" replace />} />
            <Route
              path="/school-accounts/school-year-term"
              element={
                <ProtectedRoute roles={["ADMIN"]}>
                  <SchoolYearTermPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/school-accounts/accounts"
              element={
                <ProtectedRoute roles={["ADMIN"]}>
                  <SchoolAccountsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/school-accounts/supervisors"
              element={
                <ProtectedRoute roles={["ADMIN"]}>
                  <SupervisorAccountsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/school-accounts/admins"
              element={
                <ProtectedRoute roles={["ADMIN"]}>
                  <AdminAccountsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/school-accounts/audit-log"
              element={
                <ProtectedRoute roles={["ADMIN"]}>
                  <AuditLogPage />
                </ProtectedRoute>
              }
            />

            {/* Division Supervisor: read-only, division-wide, scoped by Learning Area */}
            <Route
              path="/supervisor-profile"
              element={
                <ProtectedRoute roles={["SUPERVISOR"]}>
                  <SupervisorProfilePage />
                </ProtectedRoute>
              }
            />
            <Route path="/loa-result" element={<Navigate to={`/loa-result/${DOCUMENT_TYPES[0].slug}`} replace />} />
            {DOCUMENT_TYPES.map((d) => (
              <Route
                key={d.slug}
                path={`/loa-result/${d.slug}`}
                element={
                  <ProtectedRoute roles={["SUPERVISOR"]}>
                    <SupervisorLOAResultPage documentType={d.value} />
                  </ProtectedRoute>
                }
              />
            ))}
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

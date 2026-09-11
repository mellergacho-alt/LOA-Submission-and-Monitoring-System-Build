import "dotenv/config";
import path from "path";
import express from "express";
// Patches Express 4's route/router handling so a rejected promise inside an
// async handler is forwarded to next(err) instead of becoming an unhandled
// promise rejection — must be required after express but before any routes
// are defined. Without this, an uncaught error in any async controller
// crashes the whole process (confirmed live 2026-08-25), not just that
// request. See "Gotchas" in CLAUDE.md.
import "express-async-errors";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import schoolRoutes from "./routes/school.routes";
import clusterRoutes from "./routes/cluster.routes";
import classSectionRoutes from "./routes/classSection.routes";
import submissionRoutes from "./routes/submission.routes";
import schoolYearRoutes from "./routes/schoolYear.routes";
import chairmanRoutes from "./routes/chairman.routes";
import supervisorRoutes from "./routes/supervisor.routes";
import adminRoutes from "./routes/admin.routes";
import auditLogRoutes from "./routes/auditLog.routes";
import { requireAuth } from "./middleware/auth";

const app = express();
const PORT = process.env.PORT || 4001;

app.use(cors());
app.use(express.json());
// No public static mount for the uploads folder any more — every "View"/
// "Download" now goes through the authenticated GET /submissions/:id/download
// endpoint (see submission.controller.ts's downloadSubmission), so a file's
// on-disk path is never reachable by an unauthenticated request, including
// one that guessed or leaked a filename.

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);

// Everything below requires a valid session.
app.use("/api/schools", requireAuth, schoolRoutes);
app.use("/api/clusters", requireAuth, clusterRoutes);
app.use("/api/class-sections", requireAuth, classSectionRoutes);
app.use("/api/submissions", requireAuth, submissionRoutes);
app.use("/api/school-years", requireAuth, schoolYearRoutes);
app.use("/api/chairmen", requireAuth, chairmanRoutes);
app.use("/api/supervisors", requireAuth, supervisorRoutes);
app.use("/api/admins", requireAuth, adminRoutes);
app.use("/api/audit-logs", requireAuth, auditLogRoutes);

// Production only: the built React app (client/dist, copied here as
// ./public at build time — see BUILD.md) is served by this same process,
// so the whole app is one Node process on one port rather than needing a
// separate static host/reverse proxy in front. Not present in dev — the
// Vite dev server handles the frontend there instead, so this directory
// simply won't exist and both lines below no-op harmlessly.
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));
// React Router is a client-side router, so a direct hit or hard refresh on
// any of its routes (e.g. /loa-submission) is a real HTTP request this
// server has no matching route for — without this catch-all it would 404
// instead of loading the app, which then renders the right route itself.
// Only applies to non-API paths: an actual unmatched /api/* request still
// falls through to Express's normal 404 rather than silently returning
// index.html.
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(publicDir, "index.html"), (err) => {
    if (err) next(err);
  });
});

// Catch-all error handler — must be registered last, after every route. With
// express-async-errors above, a thrown/rejected error from any (sync or
// async) route handler lands here instead of crashing the process; a bug now
// degrades to one failed request instead of an outage for every concurrent
// user. Express identifies this as error middleware purely by arity, so the
// unused `_next` parameter must stay even though eslint would flag it.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

// Last-resort net for errors thrown outside the request/response cycle
// (e.g. a fire-and-forget promise, a timer callback) that express-async-errors
// can't route through the middleware above — log and keep the process alive
// rather than let Node's default behavior kill it.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

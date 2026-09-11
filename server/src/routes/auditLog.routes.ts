import { Router } from "express";
import { listAuditLogs } from "../controllers/auditLog.controller";
import { requireRole } from "../middleware/auth";

const router = Router();

router.use(requireRole("ADMIN"));

router.get("/", listAuditLogs);

export default router;

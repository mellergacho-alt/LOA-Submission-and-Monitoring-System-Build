import { Router } from "express";
import {
  getSubmissionGrid,
  uploadSubmission,
  downloadSubmission,
  deleteSubmission,
  getAdminStats,
  getStatusGrid,
  getSchoolsRoster,
  getSupervisorSubmissions,
  getSupervisorSchools,
} from "../controllers/submission.controller";
import { upload } from "../middleware/upload";
import { requireRole } from "../middleware/auth";

const router = Router();

router.get("/grid", getSubmissionGrid);
router.get("/status-grid", getStatusGrid);
router.get("/stats", getAdminStats);
router.get("/roster", requireRole("ADMIN"), getSchoolsRoster);
router.get("/supervisor-view", requireRole("SUPERVISOR"), getSupervisorSubmissions);
router.get("/supervisor-schools", requireRole("SUPERVISOR"), getSupervisorSchools);
router.post("/upload", upload.single("file"), uploadSubmission);
router.get("/:id/download", downloadSubmission);
router.delete("/:id", deleteSubmission);

export default router;

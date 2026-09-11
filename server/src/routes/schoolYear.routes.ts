import { Router } from "express";
import {
  listSchoolYears,
  createSchoolYear,
  activateSchoolYear,
  activateTerm,
  updateExamSchedules,
} from "../controllers/schoolYear.controller";
import { requireRole } from "../middleware/auth";

const router = Router();

router.get("/", listSchoolYears);
router.post("/", requireRole("ADMIN"), createSchoolYear);
router.patch("/:id/activate", requireRole("ADMIN"), activateSchoolYear);
router.patch("/terms/:id/activate", requireRole("ADMIN"), activateTerm);
router.patch("/terms/:id/exam-schedules", requireRole("ADMIN"), updateExamSchedules);

export default router;

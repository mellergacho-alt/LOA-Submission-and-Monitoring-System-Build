import { Router } from "express";
import { createClassSections, updateClassSection, deleteClassSection } from "../controllers/classSection.controller";
import { requireRole } from "../middleware/auth";

const router = Router();

// GRADE_CHAIRMAN has no access to class/section management (School Profile
// is off-limits to that role entirely) — only ADMIN and SCHOOL reach these.
router.use(requireRole("ADMIN", "SCHOOL"));

router.post("/", createClassSections);
router.patch("/:id", updateClassSection);
router.delete("/:id", deleteClassSection);

export default router;

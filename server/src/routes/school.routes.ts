import { Router } from "express";
import {
  listSchools,
  getMySchool,
  updateMySchool,
  updateSchoolById,
  deleteSchool,
  resetSchoolPassword,
  createSchool,
  bulkCreateSchools,
} from "../controllers/school.controller";
import { requireRole } from "../middleware/auth";
import { uploadMemory } from "../middleware/uploadMemory";

const router = Router();

router.get("/", requireRole("ADMIN"), listSchools);
router.get("/me", requireRole("SCHOOL", "GRADE_CHAIRMAN"), getMySchool);
router.patch("/me", requireRole("SCHOOL"), updateMySchool);
router.patch("/:id/reset-password", requireRole("ADMIN"), resetSchoolPassword);
router.patch("/:id", requireRole("ADMIN"), updateSchoolById);
router.delete("/:id", requireRole("ADMIN"), deleteSchool);
router.post("/bulk", requireRole("ADMIN"), uploadMemory.single("file"), bulkCreateSchools);
router.post("/", requireRole("ADMIN"), createSchool);

export default router;

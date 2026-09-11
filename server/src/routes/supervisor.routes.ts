import { Router } from "express";
import {
  listSupervisors,
  listLearningAreaNames,
  createSupervisor,
  bulkCreateSupervisors,
  updateSupervisor,
  deleteSupervisor,
  resetSupervisorPassword,
} from "../controllers/supervisor.controller";
import { requireRole } from "../middleware/auth";
import { uploadMemory } from "../middleware/uploadMemory";

const router = Router();

router.use(requireRole("ADMIN"));

router.get("/", listSupervisors);
router.get("/learning-areas", listLearningAreaNames);
router.post("/", createSupervisor);
router.post("/bulk", uploadMemory.single("file"), bulkCreateSupervisors);
router.patch("/:id", updateSupervisor);
router.delete("/:id", deleteSupervisor);
router.patch("/:id/reset-password", resetSupervisorPassword);

export default router;

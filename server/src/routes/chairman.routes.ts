import { Router } from "express";
import {
  listChairmen,
  createChairman,
  updateChairman,
  deleteChairman,
  resetChairmanPassword,
} from "../controllers/chairman.controller";
import { requireRole } from "../middleware/auth";

const router = Router();

router.use(requireRole("SCHOOL"));

router.get("/", listChairmen);
router.post("/", createChairman);
router.patch("/:id", updateChairman);
router.delete("/:id", deleteChairman);
router.patch("/:id/reset-password", resetChairmanPassword);

export default router;

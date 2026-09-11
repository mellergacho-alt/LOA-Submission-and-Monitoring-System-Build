import { Router } from "express";
import { listAdmins, createAdminAccount, updateAdmin, deleteAdmin, resetAdminPassword } from "../controllers/admin.controller";
import { requireRole } from "../middleware/auth";

const router = Router();

router.use(requireRole("ADMIN"));

router.get("/", listAdmins);
router.post("/", createAdminAccount);
router.patch("/:id", updateAdmin);
router.delete("/:id", deleteAdmin);
router.patch("/:id/reset-password", resetAdminPassword);

export default router;

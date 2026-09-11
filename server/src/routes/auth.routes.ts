import { Router } from "express";
import { login, googleLogin, me, updateProfile, updatePassword } from "../controllers/auth.controller";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.post("/login", login);
router.post("/google", googleLogin);
router.get("/me", requireAuth, me);
router.patch("/profile", requireAuth, requireRole("ADMIN", "SUPERVISOR", "GRADE_CHAIRMAN"), updateProfile);
router.patch("/password", requireAuth, updatePassword);

export default router;

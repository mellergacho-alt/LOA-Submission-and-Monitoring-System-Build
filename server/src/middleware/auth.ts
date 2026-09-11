import { Request, Response, NextFunction } from "express";
import { verifyToken, type AuthTokenPayload } from "../utils/jwt";

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired session" });
  }
}

export function requireRole(...roles: Array<"ADMIN" | "SCHOOL" | "GRADE_CHAIRMAN" | "SUPERVISOR">) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have access to this resource" });
    }
    next();
  };
}

// For SCHOOL-role users, restricts access to their own schoolId. ADMIN passes through.
export function requireOwnSchool(getSchoolId: (req: Request) => number | undefined) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role === "ADMIN") return next();

    const schoolId = getSchoolId(req);
    if (req.user?.role === "SCHOOL" && schoolId && req.user.schoolId === schoolId) {
      return next();
    }
    return res.status(403).json({ message: "You can only access your own school's data" });
  };
}

import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const JWT_EXPIRES_IN = "8h";

export interface AuthTokenPayload {
  sub: number;
  role: "ADMIN" | "SCHOOL" | "GRADE_CHAIRMAN" | "SUPERVISOR";
  schoolId: number | null;
  gradeLevelIds: number[];
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, JWT_SECRET) as unknown as AuthTokenPayload;
}

import { Request, Response } from "express";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "../prisma";

// ADMIN-only, division-wide read of the audit trail — see auditLog.ts for
// what gets logged and why. Filterable by action, actor role, a free-text
// search across actor/details/target, and a createdAt date range; paginated
// since this table only grows.
export async function listAuditLogs(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
  const { action, role, q, from, to } = req.query as Record<string, string | undefined>;

  const where: Prisma.AuditLogWhereInput = {};
  if (action) where.action = action;
  if (role) where.actorRole = role as Role;
  if (from || to) {
    where.createdAt = {
      ...(from && { gte: new Date(from) }),
      ...(to && { lte: new Date(to) }),
    };
  }
  if (q) {
    where.OR = [
      { actorName: { contains: q, mode: "insensitive" } },
      { actorEmail: { contains: q, mode: "insensitive" } },
      { details: { contains: q, mode: "insensitive" } },
      { targetType: { contains: q, mode: "insensitive" } },
    ];
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({ logs, total, page, pageSize });
}

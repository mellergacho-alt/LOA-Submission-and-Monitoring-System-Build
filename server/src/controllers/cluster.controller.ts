import { Request, Response } from "express";
import { prisma } from "../prisma";

export async function listClusters(_req: Request, res: Response) {
  const clusters = await prisma.cluster.findMany({ orderBy: { id: "asc" } });
  res.json(clusters);
}

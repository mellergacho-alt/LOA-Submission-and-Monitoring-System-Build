import { Router } from "express";
import { listClusters } from "../controllers/cluster.controller";

const router = Router();

router.get("/", listClusters);

export default router;

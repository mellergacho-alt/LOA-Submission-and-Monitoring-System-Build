import multer from "multer";

// For files that get parsed in-memory and never saved to disk (e.g. CSV imports).
export const uploadMemory = multer({ storage: multer.memoryStorage() });

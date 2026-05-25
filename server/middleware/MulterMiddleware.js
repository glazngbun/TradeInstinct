import multer from "multer";
import path from "path";

const fileFilter = (req, file, cb) => {
  const allowedMimes = ["text/csv", "application/vnd.ms-excel"];
  const allowedExts  = [".csv"];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) && allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Only CSV files are allowed"), false);
  }
};

export const upload = multer({
  storage: multer.memoryStorage(),   // buffer only, no disk writes
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB hard cap
});
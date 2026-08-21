import { Readable } from "node:stream";
import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import requireAuth from "../middleware/requireAuth.js";
import { cloudinary } from "../../lib/cloudinary.js";

const router = Router();

const isValidId = (value) => {
  const id = Number(value);

  return Number.isInteger(id) && id > 0;
};

router.get("/files/:id/download", requireAuth, async (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(404).send("File not found.");
  }

  const fileId = Number(req.params.id);

  const file = await prisma.file.findFirst({
    where: {
      id: fileId,
      userId: req.user.id,
    },
  });

  if (!file) {
    return res.status(404).send("File not found.");
  }

  try {
    const response = await fetch(file.url);

    if (!response.ok || !response.body) {
      return res.status(500).send("Could not download file.");
    }

    res.attachment(file.originalName);

    Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    console.error("Download failed:", error);

    if (!res.headersSent) {
      res.status(500).send("Could not download file.");
    }
  }
});

router.post("/files/:id/delete", requireAuth, async (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(404).send("File not found.");
  }

  const fileId = Number(req.params.id);

  const file = await prisma.file.findFirst({
    where: {
      id: fileId,
      userId: req.user.id,
    },
  });

  if (!file) {
    return res.status(404).send("File not found.");
  }

  try {
    const resourceType = file.mimeType.startsWith("image/") ? "image" : "raw";

    await cloudinary.uploader.destroy(file.name, {
      resource_type: resourceType,
    });

    await prisma.file.delete({
      where: {
        id: file.id,
      },
    });

    res.redirect(`/folders/${file.folderId}`);
  } catch (error) {
    console.error("File deletion failed:", error);

    res.status(500).send("Could not delete file.");
  }
});

router.get("/files/:id", requireAuth, async (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(404).send("File not found.");
  }

  const fileId = Number(req.params.id);

  const file = await prisma.file.findFirst({
    where: {
      id: fileId,
      userId: req.user.id,
    },
    include: {
      folder: true,
    },
  });

  if (!file) {
    return res.status(404).send("File not found.");
  }

  res.render("files/show", {
    file,
  });
});

export default router;

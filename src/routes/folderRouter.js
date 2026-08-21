import { Router } from "express";
import multer from "multer";
import { prisma } from "../../lib/prisma.js";
import requireAuth from "../middleware/requireAuth.js";
import upload from "../middleware/upload.js";
import { cloudinary } from "../../lib/cloudinary.js";

const router = Router();

const activeUploads = new Set();

const isValidId = (value) => {
  const id = Number(value);

  return Number.isInteger(id) && id > 0;
};

router.get("/folders", requireAuth, async (req, res) => {
  const folders = await prisma.folder.findMany({
    where: {
      userId: req.user.id,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  res.render("folders/index", {
    folders,
  });
});

router.post("/folders", requireAuth, async (req, res, next) => {
  try {
    const name = req.body.name?.trim() || "";

    if (!name) {
      return res.status(400).render("error", {
        title: "Invalid folder name",
        message: "Folder name is required.",
        backUrl: "/folders",
        backText: "Back to folders",
      });
    }

    await prisma.folder.create({
      data: {
        name,
        userId: req.user.id,
      },
    });

    res.redirect("/folders");
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(400).render("error", {
        title: "Folder already exists",
        message:
          "A folder with this name already exists. Please choose a different name.",
        backUrl: "/folders",
        backText: "Back to folders",
      });
    }

    next(error);
  }
});

router.get("/folders/:id", requireAuth, async (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(404).send("Folder not found.");
  }

  const folderId = Number(req.params.id);

  const folder = await prisma.folder.findFirst({
    where: {
      id: folderId,
      userId: req.user.id,
    },
    include: {
      files: true,
    },
  });

  if (!folder) {
    return res.status(404).send("Folder not found.");
  }

  res.render("folders/show", {
    folder,
  });
});

router.get("/folders/:id/edit", requireAuth, async (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(404).send("Folder not found.");
  }

  const folderId = Number(req.params.id);

  const folder = await prisma.folder.findFirst({
    where: {
      id: folderId,
      userId: req.user.id,
    },
  });

  if (!folder) {
    return res.status(404).send("Folder not found.");
  }

  res.render("folders/edit", {
    folder,
  });
});

router.post("/folders/:id/edit", requireAuth, async (req, res, next) => {
  if (!isValidId(req.params.id)) {
    return res.status(404).send("Folder not found.");
  }

  const folderId = Number(req.params.id);
  const name = req.body.name?.trim() || "";

  if (!name) {
    return res.status(400).render("error", {
      title: "Invalid folder name",
      message: "Folder name is required.",
      backUrl: `/folders/${folderId}/edit`,
      backText: "Back to edit",
    });
  }

  const folder = await prisma.folder.findFirst({
    where: {
      id: folderId,
      userId: req.user.id,
    },
  });

  if (!folder) {
    return res.status(404).send("Folder not found.");
  }

  try {
    await prisma.folder.update({
      where: {
        id: folder.id,
      },
      data: {
        name,
      },
    });

    res.redirect(`/folders/${folder.id}`);
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(400).render("error", {
        title: "Folder already exists",
        message:
          "A folder with this name already exists. Please choose a different name.",
        backUrl: `/folders/${folder.id}/edit`,
        backText: "Back to edit",
      });
    }

    next(error);
  }
});

router.post("/folders/:id/delete", requireAuth, async (req, res, next) => {
  if (!isValidId(req.params.id)) {
    return res.status(404).send("Folder not found.");
  }

  const folderId = Number(req.params.id);

  const folder = await prisma.folder.findFirst({
    where: {
      id: folderId,
      userId: req.user.id,
    },
    include: {
      files: true,
    },
  });

  if (!folder) {
    return res.status(404).send("Folder not found.");
  }

  try {
    for (const file of folder.files) {
      const resourceType = file.mimeType.startsWith("image/") ? "image" : "raw";

      await cloudinary.uploader.destroy(file.name, {
        resource_type: resourceType,
      });
    }

    await prisma.folder.delete({
      where: {
        id: folder.id,
      },
    });

    res.redirect("/folders");
  } catch (error) {
    console.error("Folder deletion failed:", error);

    next(error);
  }
});

router.post(
  "/folders/:id/files",
  requireAuth,
  (req, res, next) => {
    if (!isValidId(req.params.id)) {
      return res.status(404).send("Folder not found.");
    }

    const uploadKey = `${req.user.id}:${req.params.id}`;

    if (activeUploads.has(uploadKey)) {
      return res.status(409).render("error", {
        title: "Upload already in progress",
        message: "Please wait for the current upload to finish.",
        backUrl: `/folders/${req.params.id}`,
        backText: "Back to folder",
      });
    }

    activeUploads.add(uploadKey);

    upload.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        activeUploads.delete(uploadKey);

        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).render("error", {
            title: "File too large",
            message: "The maximum file size is 5 MB.",
            backUrl: `/folders/${req.params.id}`,
            backText: "Back to folder",
          });
        }

        return res.status(400).render("error", {
          title: "Upload failed",
          message: err.message,
          backUrl: `/folders/${req.params.id}`,
          backText: "Back to folder",
        });
      }

      if (err) {
        activeUploads.delete(uploadKey);

        return res.status(400).render("error", {
          title: "Unsupported file type",
          message: "Please choose a JPEG, PNG, GIF, PDF, or TXT file.",
          backUrl: `/folders/${req.params.id}`,
          backText: "Back to folder",
        });
      }

      next();
    });
  },
  async (req, res, next) => {
    const folderId = Number(req.params.id);
    const uploadKey = `${req.user.id}:${req.params.id}`;

    try {
      const folder = await prisma.folder.findFirst({
        where: {
          id: folderId,
          userId: req.user.id,
        },
      });

      if (!folder) {
        return res.status(404).send("Folder not found.");
      }

      if (!req.file) {
        return res.status(400).render("error", {
          title: "No file selected",
          message: "Please select a file to upload.",
          backUrl: `/folders/${folder.id}`,
          backText: "Back to folder",
        });
      }

      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: "auto",
            folder: "file-uploader",
          },
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          },
        );

        uploadStream.end(req.file.buffer);
      });

      await prisma.file.create({
        data: {
          name: result.public_id,
          originalName: req.file.originalname,
          size: req.file.size,
          mimeType: req.file.mimetype,
          url: result.secure_url,
          userId: req.user.id,
          folderId: folder.id,
        },
      });

      res.redirect(`/folders/${folder.id}`);
    } catch (error) {
      console.error("Cloudinary upload failed:", error);

      next(error);
    } finally {
      activeUploads.delete(uploadKey);
    }
  },
);

export default router;

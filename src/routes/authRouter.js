import { Router } from "express";
import bcrypt from "bcryptjs";
import passport from "../passport.js";
import { prisma } from "../../lib/prisma.js";

const router = Router();

router.get("/login", (req, res) => {
  res.render("login", {
    error: null,
    success:
      req.query.signup === "success"
        ? "Account created successfully. You can now log in."
        : null,
    username: "",
  });
});

router.post("/login", (req, res, next) => {
  const username = req.body.username?.trim() || "";
  const password = req.body.password || "";

  if (!username || !password) {
    return res.status(400).render("login", {
      error: "Username and password are required.",
      username,
    });
  }

  passport.authenticate("local", (err, user, info) => {
    if (err) {
      return next(err);
    }

    if (!user) {
      return res.status(401).render("login", {
        error: info?.message || "Incorrect username or password.",
        username,
      });
    }

    req.logIn(user, (err) => {
      if (err) {
        return next(err);
      }

      res.redirect("/folders");
    });
  })(req, res, next);
});

router.post("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }

    req.session.destroy((err) => {
      if (err) {
        return next(err);
      }

      res.redirect("/login");
    });
  });
});

router.get("/signup", (req, res) => {
  res.render("signup", {
    error: null,
    username: "",
  });
});

router.post("/signup", async (req, res, next) => {
  try {
    const username = req.body.username?.trim() || "";
    const password = req.body.password || "";
    const confirmPassword = req.body.confirmPassword || "";

    if (!username || !password) {
      return res.status(400).render("signup", {
        error: "Username and password are required.",
        username,
      });
    }

    if (username.length < 3 || username.length > 30) {
      return res.status(400).render("signup", {
        error: "Username must be between 3 and 30 characters.",
        username,
      });
    }

    if (password.length < 8) {
      return res.status(400).render("signup", {
        error: "Password must be at least 8 characters long.",
        username,
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).render("signup", {
        error: "Passwords do not match.",
        username,
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        username,
      },
    });

    if (existingUser) {
      return res.status(400).render("signup", {
        error: "Username already exists.",
        username,
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
      },
    });

    res.redirect("/login?signup=success");
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(400).render("signup", {
        error: "Username already exists.",
        username: req.body.username?.trim() || "",
      });
    }

    next(error);
  }
});

export default router;

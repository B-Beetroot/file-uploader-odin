import express from "express";
import expressLayouts from "express-ejs-layouts";
import session from "express-session";
import { PrismaSessionStore } from "@quixo3/prisma-session-store";
import authRouter from "./routes/authRouter.js";
import fileRouter from "./routes/fileRouter.js";

import passport from "./passport.js";
import { prisma } from "../lib/prisma.js";

import folderRouter from "./routes/folderRouter.js";

const app = express();

const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", "./src/views");

app.use(expressLayouts);
app.set("layout", "layout");

app.use(express.urlencoded({ extended: false }));
app.use(express.static("public"));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new PrismaSessionStore(prisma, {
      checkPeriod: 2 * 60 * 1000,
      dbRecordIdIsSessionId: true,
      dbRecordIdFunction: undefined,
    }),
  }),
);

app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});

app.use((req, res, next) => {
  if (req.path.startsWith("/folders") || req.path.startsWith("/files")) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  }

  next();
});

app.use(authRouter);
app.use(folderRouter);
app.use(fileRouter);

app.get("/", (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect("/folders");
  }

  res.redirect("/login");
});

app.use((err, req, res, next) => {
  console.error(err);

  const status = err.status || 500;

  res.status(status).render("error", {
    title: "Server Error",
    message:
      status === 500
        ? "Something went wrong. Please try again later."
        : err.message,
  });
});

app.use((req, res) => {
  res.status(404).render("error", {
    title: "Page Not Found",
    message: "The page you're looking for doesn't exist.",
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

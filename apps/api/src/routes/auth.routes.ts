import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import prisma from "../core/db/prisma";
import { getJwtSecret } from "../core/auth/jwt";
import {
  createLocalUser,
  findLocalUserByEmail,
  findLocalUserById,
} from "../core/auth/localAuthStore";
import { validateBody } from "../middleware/validate.middleware";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

// ── Validation schemas ────────────────────────────────────────
const RegisterSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required").optional(),
});

const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

// ── Token generator ───────────────────────────────────────────
function generateToken(user: {
  id: string;
  email: string;
  role: string;
}): string {
  const secret = getJwtSecret();

  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    secret,
    { expiresIn: "7d" }
  );
}

// ── POST /api/auth/register ───────────────────────────────────
router.post(
  "/register",
  validateBody(RegisterSchema),
  async (req: Request, res: Response) => {
    const { email, password, name } = req.body;

    try {
      const hashedPassword = await bcrypt.hash(password, 12);

      try {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
          res.status(409).json({
            success: false,
            error: "An account with this email already exists",
          });
          return;
        }

        const user = await prisma.user.create({
          data: { email, password: hashedPassword, name, role: "user" },
          select: { id: true, email: true, name: true, role: true },
        });

        const token = generateToken(user);

        res.status(201).json({
          success: true,
          data: { user, token },
        });
        return;
      } catch (dbError) {
        if (process.env.NODE_ENV === "production") {
          throw dbError;
        }

        const existingLocal = await findLocalUserByEmail(email);
        if (existingLocal) {
          res.status(409).json({
            success: false,
            error: "An account with this email already exists",
          });
          return;
        }

        const localUser = await createLocalUser({
          email,
          name,
          password: hashedPassword,
          role: "user",
        });

        const token = generateToken(localUser);

        res.status(201).json({
          success: true,
          data: {
            user: {
              id: localUser.id,
              email: localUser.email,
              name: localUser.name,
              role: localUser.role,
            },
            token,
          },
        });
        return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      res.status(500).json({ success: false, error: message });
    }
  }
);

// ── POST /api/auth/login ──────────────────────────────────────
router.post(
  "/login",
  validateBody(LoginSchema),
  async (req: Request, res: Response) => {
    const { email, password } = req.body;

    try {
      try {
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user || !user.password) {
          res.status(401).json({
            success: false,
            error: "Invalid email or password",
          });
          return;
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
          res.status(401).json({
            success: false,
            error: "Invalid email or password",
          });
          return;
        }

        const token = generateToken(user);

        res.status(200).json({
          success: true,
          data: {
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
            },
            token,
          },
        });
        return;
      } catch (dbError) {
        if (process.env.NODE_ENV === "production") {
          throw dbError;
        }

        const localUser = await findLocalUserByEmail(email);
        if (!localUser) {
          res.status(401).json({
            success: false,
            error: "Invalid email or password",
          });
          return;
        }

        const passwordMatch = await bcrypt.compare(password, localUser.password);
        if (!passwordMatch) {
          res.status(401).json({
            success: false,
            error: "Invalid email or password",
          });
          return;
        }

        const token = generateToken(localUser);

        res.status(200).json({
          success: true,
          data: {
            user: {
              id: localUser.id,
              email: localUser.email,
              name: localUser.name,
              role: localUser.role,
            },
            token,
          },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      res.status(500).json({ success: false, error: message });
    }
  }
);

// ── GET /api/auth/me ──────────────────────────────────────────
router.get("/me", authenticate, async (req: Request, res: Response) => {
  try {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      });

      if (!user) {
        res.status(404).json({ success: false, error: "User not found" });
        return;
      }

      res.status(200).json({ success: true, data: user });
      return;
    } catch (dbError) {
      if (process.env.NODE_ENV === "production") {
        throw dbError;
      }

      const localUser = await findLocalUserById(req.user!.id);
      if (!localUser) {
        res.status(404).json({ success: false, error: "User not found" });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          id: localUser.id,
          email: localUser.email,
          name: localUser.name,
          role: localUser.role,
          createdAt: localUser.createdAt,
        },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch user";
    res.status(500).json({ success: false, error: message });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────
// JWT is stateless — client just drops the token
// This endpoint exists for consistency and future refresh token support
router.post("/logout", authenticate, (_req: Request, res: Response) => {
  res.status(200).json({ success: true, data: { message: "Logged out" } });
});

export default router;
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { v2 as cloudinary } from "cloudinary";
import prisma from "../core/db/prisma.js";
import { getJwtSecret } from "../core/auth/jwt.js";
import {
  createLocalUser,
  findLocalUserByEmail,
  findLocalUserById,
  updateLocalUser,
} from "../core/auth/localAuthStore.js";
import { validateBody } from "../middleware/validate.middleware.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

// ── Validation schemas ────────────────────────────────────────
const RegisterSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required").optional(),
  profilePictureBase64: z.string().optional().nullable(),
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

const MAX_PROFILE_PICTURE_BYTES = 5 * 1024 * 1024;
const PROFILE_PICTURE_DATA_URI = /^data:(image\/(?:jpeg|png|gif|webp));base64,(.*)$/is;

function detectImageMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  if (buffer.length >= 6 && (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a")) {
    return "image/gif";
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

// ── Helper to save profile picture ─────────────────────────────
async function saveProfilePicture(base64String: string, userId: string): Promise<string | null> {
  try {
    if (!base64String || base64String.length === 0) {
      return null;
    }

    const trimmedInput = base64String.trim();
    const dataUriMatch = PROFILE_PICTURE_DATA_URI.exec(trimmedInput);
    const declaredMimeType = dataUriMatch?.[1].toLowerCase();
    const base64Data = (dataUriMatch?.[2] ?? trimmedInput).replace(/\s/g, "");

    if (
      !base64Data ||
      base64Data.length % 4 === 1 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(base64Data)
    ) {
      console.warn("Rejected profile picture: invalid base64 data");
      return null;
    }

    const imageBuffer = Buffer.from(base64Data, "base64");
    const detectedMimeType = detectImageMimeType(imageBuffer);
    if (
      !detectedMimeType ||
      (declaredMimeType && declaredMimeType !== detectedMimeType) ||
      imageBuffer.length > MAX_PROFILE_PICTURE_BYTES
    ) {
      console.warn("Rejected profile picture: unsupported format or size");
      return null;
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
      console.error("Profile picture upload is unavailable: Cloudinary environment variables are missing");
      return null;
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });

    const result = await cloudinary.uploader.upload(
      `data:${detectedMimeType};base64,${base64Data}`,
      {
        folder: "profile-pictures",
        public_id: `${userId}-${Date.now()}`,
        resource_type: "image",
        overwrite: false,
      },
    );

    return typeof result.secure_url === "string" && result.secure_url.startsWith("https://")
      ? result.secure_url
      : null;
  } catch (err) {
    console.error("Failed to upload profile picture to Cloudinary:", err instanceof Error ? err.message : "unknown error");
    return null;
  }
}

// ── POST /api/auth/register ───────────────────────────────────
router.post(
  "/register",
  validateBody(RegisterSchema),
  async (req: Request, res: Response) => {
    const { email, password, name, profilePictureBase64 } = req.body;

    try {
      const hashedPassword = await bcrypt.hash(password, 12);
      let profilePictureUrl: string | null = null;

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
          select: { id: true, email: true, name: true, role: true, profilePictureUrl: true },
        });

        // Save profile picture if provided
        if (profilePictureBase64) {
          profilePictureUrl = await saveProfilePicture(profilePictureBase64, user.id);
          if (profilePictureUrl) {
            await prisma.user.update({
              where: { id: user.id },
              data: { profilePictureUrl },
            });
          }
        }

        const token = generateToken(user);

        res.status(201).json({
          success: true,
          data: { user: { ...user, profilePictureUrl }, token },
        });
        return;
      } catch (dbError) {
        console.warn("Database unavailable during registration; using local auth store:", dbError);

        const existingLocal = await findLocalUserByEmail(email);
        if (existingLocal) {
          res.status(409).json({
            success: false,
            error: "An account with this email already exists",
          });
          return;
        }

        // Generate a temporary ID for local user before saving picture
        const tempUserId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        let pictureUrl: string | null = null;
        if (profilePictureBase64) {
          pictureUrl = await saveProfilePicture(profilePictureBase64, tempUserId);
        }

        const localUser = await createLocalUser({
          email,
          name,
          password: hashedPassword,
          role: "user",
          profilePictureUrl: pictureUrl,
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
              profilePictureUrl: localUser.profilePictureUrl,
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
              profilePictureUrl: user.profilePictureUrl,
              role: user.role,
            },
            token,
          },
        });
        return;
      } catch (dbError) {
        console.warn("Database unavailable during login; using local auth store:", dbError);

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
              profilePictureUrl: localUser.profilePictureUrl,
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
        select: { id: true, email: true, name: true, role: true, profilePictureUrl: true, createdAt: true },
      });

      if (!user) {
        res.status(404).json({ success: false, error: "User not found" });
        return;
      }

      res.status(200).json({ success: true, data: user });
      return;
    } catch (dbError) {
      console.warn("Database unavailable while loading user; using local auth store:", dbError);

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
          profilePictureUrl: localUser.profilePictureUrl,
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
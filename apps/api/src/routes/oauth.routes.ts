import { Router, Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import prisma from "../core/db/prisma";

const router = Router();

function generateToken(user: { id: string; email: string; role: string }): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not set");

  // lazy import to avoid top-level mutation issues
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const jwt = require("jsonwebtoken");

  return jwt.sign({ id: user.id, email: user.email, role: user.role }, secret, {
    expiresIn: "7d",
  });
}

// Redirect user to Google's OAuth consent screen
router.get("/google/authorize", (req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).send("GOOGLE_CLIENT_ID not configured");

  const frontend = process.env.FRONTEND_URL || "http://localhost:3000";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${frontend}/oauth-callback`;

  const scope = ["openid", "email", "profile"].join(" ");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    access_type: "offline",
    prompt: "consent",
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  res.redirect(url);
});

// Exchange code for tokens, verify ID token, upsert user and issue app JWT
router.post("/google/callback", async (req: Request, res: Response) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ success: false, error: "Missing code" });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).json({ success: false, error: "Google OAuth not configured" });
  }

  const frontend = process.env.FRONTEND_URL || "http://localhost:3000";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${frontend}/oauth-callback`;

  const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);

  try {
    const { tokens } = await oauth2Client.getToken(code);
    const idToken = tokens.id_token;
    if (!idToken) {
      return res.status(400).json({ success: false, error: "No id_token returned from Google" });
    }

    const ticket = await oauth2Client.verifyIdToken({ idToken, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(400).json({ success: false, error: "Unable to verify Google identity" });
    }

    const email = payload.email;
    const name = payload.name ?? undefined;

    // upsert user by email
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: { email, name, password: null, role: "user" },
        select: { id: true, email: true, name: true, role: true },
      });
    } else {
      // ensure name is set if missing
      if (!user.name && name) {
        user = await prisma.user.update({
          where: { email },
          data: { name },
          select: { id: true, email: true, name: true, role: true },
        });
      } else {
        user = { id: user.id, email: user.email, name: user.name ?? undefined, role: user.role } as any;
      }
    }

    const token = generateToken(user as { id: string; email: string; role: string });

    return res.status(200).json({ success: true, data: { user, token } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth failed";
    console.error("Google OAuth error:", err);
    return res.status(500).json({ success: false, error: message });
  }
});

export default router;

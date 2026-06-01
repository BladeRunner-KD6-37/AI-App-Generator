import { Router } from "express";
import prisma from "../core/db/prisma.js";
import { authenticate } from "../middleware/auth.middleware.js";
const router = Router();
// ── All notification routes require authentication ────────────
router.use(authenticate);
// ── GET /api/notifications — get all for current user ─────────
router.get("/", async (req, res) => {
    try {
        const notifications = await prisma.notification.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: "desc" },
            take: 50,
        });
        const unreadCount = notifications.filter((n) => !n.read).length;
        res.status(200).json({
            success: true,
            data: { notifications, unreadCount },
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch notifications";
        res.status(500).json({ success: false, error: message });
    }
});
// ── PATCH /api/notifications/:id/read — mark one as read ──────
router.patch("/:id/read", async (req, res) => {
    const id = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;
    if (!id) {
        res.status(400).json({
            success: false,
            error: "Notification ID is required",
        });
        return;
    }
    try {
        const notification = await prisma.notification.findUnique({
            where: { id },
        });
        if (!notification) {
            res.status(404).json({
                success: false,
                error: "Notification not found",
            });
            return;
        }
        if (notification.userId !== req.user.id) {
            res.status(403).json({
                success: false,
                error: "Not authorized",
            });
            return;
        }
        const updated = await prisma.notification.update({
            where: { id },
            data: {
                read: true,
            },
        });
        res.status(200).json({
            success: true,
            data: updated,
        });
    }
    catch (err) {
        const message = err instanceof Error
            ? err.message
            : "Failed to update notification";
        res.status(500).json({
            success: false,
            error: message,
        });
    }
});
// ── PATCH /api/notifications/read-all — mark all as read ──────
router.patch("/read-all", async (req, res) => {
    try {
        await prisma.notification.updateMany({
            where: { userId: req.user.id, read: false },
            data: { read: true },
        });
        res.status(200).json({ success: true, data: { message: "All marked as read" } });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update notifications";
        res.status(500).json({ success: false, error: message });
    }
});
// ── DELETE /api/notifications/:id — delete one ────────────────
router.delete("/:id", async (req, res) => {
    const id = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;
    if (!id) {
        res.status(400).json({
            success: false,
            error: "Notification ID is required",
        });
        return;
    }
    try {
        const notification = await prisma.notification.findUnique({
            where: { id },
        });
        if (!notification) {
            res.status(404).json({
                success: false,
                error: "Notification not found",
            });
            return;
        }
        if (notification.userId !== req.user.id) {
            res.status(403).json({
                success: false,
                error: "Not authorized",
            });
            return;
        }
        await prisma.notification.delete({
            where: { id },
        });
        res.status(200).json({
            success: true,
            data: {
                deleted: true,
                id,
            },
        });
    }
    catch (err) {
        const message = err instanceof Error
            ? err.message
            : "Failed to delete notification";
        res.status(500).json({
            success: false,
            error: message,
        });
    }
});
export default router;

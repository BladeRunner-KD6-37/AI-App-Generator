import prisma from "../../core/db/prisma.js";
export async function createNotification(userId, title, message) {
    return prisma.notification.create({
        data: {
            userId,
            title,
            message,
        },
    });
}
export async function getUserNotifications(userId) {
    const [notifications, unreadCount] = await Promise.all([
        prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            take: 50,
        }),
        prisma.notification.count({
            where: { userId, read: false },
        }),
    ]);
    return { notifications, unreadCount };
}
export async function markAsRead(notificationId, userId) {
    const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
        select: { userId: true },
    });
    if (!notification || notification.userId !== userId) {
        return false;
    }
    await prisma.notification.update({
        where: { id: notificationId },
        data: { read: true },
    });
    return true;
}
export async function markAllAsRead(userId) {
    const result = await prisma.notification.updateMany({
        where: { userId, read: false },
        data: { read: true },
    });
    return result.count;
}
export async function broadcastNotification(title, message, role) {
    const where = role ? { role } : undefined;
    const users = await prisma.user.findMany({
        where,
        select: { id: true },
    });
    if (users.length === 0) {
        return 0;
    }
    const data = users.map((user) => ({
        userId: user.id,
        title,
        message,
    }));
    const result = await prisma.notification.createMany({
        data,
    });
    return result.count ?? 0;
}

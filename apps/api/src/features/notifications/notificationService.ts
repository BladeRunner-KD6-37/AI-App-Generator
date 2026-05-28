import { Notification } from "@prisma/client";
import prisma from "../../core/db/prisma";

type TriggerData = Record<string, unknown>;

export interface UserNotificationsResult {
  notifications: Notification[];
  unreadCount: number;
}

export async function createNotification(
  userId: string,
  title: string,
  message: string,
): Promise<Notification> {
  return prisma.notification.create({
    data: {
      userId,
      title,
      message,
    },
  });
}

export async function getUserNotifications(userId: string): Promise<UserNotificationsResult> {
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

export async function markAsRead(
  notificationId: string,
  userId: string,
): Promise<boolean> {
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

export async function markAllAsRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });

  return result.count;
}

export async function broadcastNotification(
  title: string,
  message: string,
  role?: string,
): Promise<number> {
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

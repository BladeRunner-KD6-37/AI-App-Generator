import Bull, { Job } from "bull";
import { createNotification, broadcastNotification } from "./notificationService.js";

export interface NotificationJob {
  type: "single" | "broadcast";
  userId?: string;
  title: string;
  message: string;
  role?: string;
}

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

export const notificationQueue = new Bull<NotificationJob>("notifications", redisUrl);

notificationQueue.process(async (job: Job<NotificationJob>) => {
  try {
    const { type, userId, title, message, role } = job.data;

    if (type === "single") {
      if (!userId) {
        console.error("Notification job missing userId for single notification");
        return;
      }

      await createNotification(userId, title, message);
      return;
    }

    if (type === "broadcast") {
      await broadcastNotification(title, message, role);
      return;
    }

    console.error(`Unsupported notification job type: ${type}`);
  } catch (error) {
    console.error("Notification queue worker error:", error);
  }
});

notificationQueue.on("completed", (job: Job<NotificationJob>) => {
  console.log(`[NotificationQueue] Job completed: ${job.id}`);
});

notificationQueue.on("failed", (job: Job<NotificationJob>, err: Error) => {
  console.error(`[NotificationQueue] Job failed: ${job.id}`, err);
});

export async function queueSingleNotification(
  userId: string,
  title: string,
  message: string,
): Promise<Job<NotificationJob>> {
  return notificationQueue.add({
    type: "single",
    userId,
    title,
    message,
  });
}

export async function queueBroadcastNotification(
  title: string,
  message: string,
  role?: string,
): Promise<Job<NotificationJob>> {
  return notificationQueue.add({
    type: "broadcast",
    title,
    message,
    role,
  });
}

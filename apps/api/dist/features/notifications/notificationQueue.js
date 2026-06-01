import Bull from "bull";
import { createNotification, broadcastNotification } from "./notificationService.js";
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
export const notificationQueue = new Bull("notifications", redisUrl);
notificationQueue.process(async (job) => {
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
    }
    catch (error) {
        console.error("Notification queue worker error:", error);
    }
});
notificationQueue.on("completed", (job) => {
    console.log(`[NotificationQueue] Job completed: ${job.id}`);
});
notificationQueue.on("failed", (job, err) => {
    console.error(`[NotificationQueue] Job failed: ${job.id}`, err);
});
export async function queueSingleNotification(userId, title, message) {
    return notificationQueue.add({
        type: "single",
        userId,
        title,
        message,
    });
}
export async function queueBroadcastNotification(title, message, role) {
    return notificationQueue.add({
        type: "broadcast",
        title,
        message,
        role,
    });
}

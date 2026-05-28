import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../core/api-client";

interface NotificationsResponse {
  notifications: Record<string, unknown>[];
  unreadCount: number;
}

export default function useNotifications() {
  const queryClient = useQueryClient();

  const notificationQuery = useQuery<NotificationsResponse>(
    ["notifications"],
    getNotifications,
    {
      refetchInterval: 30_000,
      staleTime: 30_000,
      select: (data) => ({
        notifications: Array.isArray((data as NotificationsResponse)?.notifications)
          ? (data as NotificationsResponse).notifications
          : [],
        unreadCount:
          typeof (data as NotificationsResponse)?.unreadCount === "number"
            ? (data as NotificationsResponse).unreadCount
            : 0,
      }),
    },
  );

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries(["notifications"]);
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries(["notifications"]);
    },
  });

  return {
    notifications: notificationQuery.data?.notifications ?? [],
    unreadCount: notificationQuery.data?.unreadCount ?? 0,
    isLoading: notificationQuery.isLoading,
    markRead: (id: string): void => {
      markReadMutation.mutate(id);
    },
    markAllRead: (): void => {
      markAllReadMutation.mutate();
    },
  };
}

import { useEffect, useRef, useState } from "react";
import useNotifications from "./useNotifications";

type NotificationItem = {
  id?: string;
  title?: string;
  message?: string;
  createdAt?: string;
  read?: boolean;
};

function formatRelativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const diffMs = Date.now() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) {
    return `${diffSeconds}s ago`;
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function NotificationBell() {
  const { notifications, unreadCount, isLoading, markRead, markAllRead } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current) {
        return;
      }
      if (!containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
        aria-label="Notifications"
      >
        <span className="text-lg">🔔</span>
        {unreadCount > 0 ? (
          <span className="absolute right-0 top-0 translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="absolute right-0 z-50 mt-3 w-80 max-w-xs rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Notifications</p>
              <p className="text-xs text-slate-500">{unreadCount} unread</p>
            </div>
            <button
              type="button"
              onClick={markAllRead}
              className="rounded-md bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
            >
              Mark all read
            </button>
          </div>

          <div className="max-h-96 space-y-2 overflow-y-auto p-3">
            {isLoading ? (
              <div className="space-y-3 p-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="space-y-2 rounded-2xl bg-slate-100 p-3">
                    <div className="h-3 w-2/3 rounded-full bg-slate-200" />
                    <div className="h-3 w-full rounded-full bg-slate-200" />
                    <div className="h-3 w-1/2 rounded-full bg-slate-200" />
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                No notifications yet.
              </div>
            ) : (
              notifications.slice(0, 10).map((item, index) => {
                const notification = item as NotificationItem;
                const id = notification.id ?? String(index);
                const isUnread = notification.read === false;
                const createdAt = typeof notification.createdAt === "string" ? notification.createdAt : "";

                return (
                  <button
                    type="button"
                    key={id}
                    onClick={() => {
                      if (notification.id) {
                        markRead(notification.id);
                      }
                    }}
                    className={`w-full rounded-2xl border p-3 text-left transition ${
                      isUnread ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-slate-900">{notification.title ?? "Notification"}</p>
                        <p className="text-sm leading-5 text-slate-600">{notification.message ?? "No details provided."}</p>
                      </div>
                      <span className="whitespace-nowrap text-xs text-slate-500">
                        {createdAt ? formatRelativeTime(createdAt) : "—"}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

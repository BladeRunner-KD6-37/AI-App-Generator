'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getApps,
  createApp,
  exportAppToGitHub,
  getGitHubExportStatus,
  type GitHubExportStatus,
} from "../../core/api-client";
import { isAuthenticated } from "../../lib/auth";
import NotificationBell from "../../features/notifications/NotificationBell";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const exampleConfig = JSON.stringify(
  {
    name: "Simple CRM",
    entities: [
      {
        name: "Customer",
        fields: [
          { name: "name", type: "string", required: true },
          { name: "email", type: "email", required: true, unique: true },
          { name: "phone", type: "string" },
          { name: "status", type: "string", defaultValue: "active" },
          { name: "notes", type: "text" },
        ],
      },
      {
        name: "Deal",
        fields: [
          { name: "title", type: "string", required: true },
          { name: "value", type: "number", required: true },
          { name: "stage", type: "string", defaultValue: "prospecting" },
          { name: "customerId", type: "relation", relation: { entity: "Customer", type: "many-to-one" } },
        ],
      },
    ],
    pages: [
      {
        name: "Dashboard",
        slug: "dashboard",
        components: [
          { type: "stat-card", entity: "Customer", title: "Customers" },
          { type: "stat-card", entity: "Deal", title: "Deals" },
        ],
      },
      {
        name: "Customers",
        slug: "customers",
        components: [
          { type: "table", entity: "Customer", fields: ["name", "email", "phone", "status"] },
          { type: "form", entity: "Customer" },
        ],
      },
      {
        name: "Deals",
        slug: "deals",
        components: [
          { type: "table", entity: "Deal", fields: ["title", "value", "stage", "customerId"] },
          { type: "form", entity: "Deal" },
        ],
      },
    ],
    workflows: [
      {
        name: "Notify on new customer",
        trigger: "on_create",
        entity: "Customer",
        condition: "data.status === 'active'",
        actions: [
          {
            type: "send_notification",
            config: {
              title: "New Customer",
              message: "A new customer was added",
            },
          },
        ],
      },
    ],
    auth: { providers: ["credentials"], roles: ["user", "admin"] },
  },
  null,
  2,
);

export default function DashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [activeExportSlug, setActiveExportSlug] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [config, setConfig] = useState(exampleConfig);
  const [error, setError] = useState<string | null>(null);
  const [exportRepositoryName, setExportRepositoryName] = useState("");
  const [exportToken, setExportToken] = useState("");
  const [exportIsPrivate, setExportIsPrivate] = useState(true);
  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
    }
  }, [router]);

  const appsQuery = useQuery({
    queryKey: ["apps"],
    queryFn: getApps,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      let parsedConfig: object;
      try {
        parsedConfig = JSON.parse(config);
      } catch {
        throw new Error("Invalid JSON configuration");
      }

      return createApp({ name, slug, config: parsedConfig });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apps"] });
      setShowForm(false);
      setName("");
      setSlug("");
      setConfig(exampleConfig);
      setError(null);
    },
    onError: (err) => {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to create app");
      }
    },
  });

  const apps = Array.isArray(appsQuery.data) ? appsQuery.data : [];

  const exportStatusQuery = useQuery({
    queryKey: ["github-export", exportJobId],
    queryFn: () => getGitHubExportStatus(exportJobId as string),
    enabled: Boolean(exportJobId),
    refetchInterval: (query) => {
      const status = query.state.data as GitHubExportStatus | undefined;
      if (!status) {
        return 1500;
      }

      return status.state === "queued" || status.state === "running" ? 1500 : false;
    },
  });

  const exportStatus = exportStatusQuery.data as GitHubExportStatus | undefined;

  const exportMutation = useMutation({
    mutationFn: async (payload: {
      appSlug: string;
      repositoryName: string;
      isPrivate: boolean;
      githubToken: string;
    }) => exportAppToGitHub(payload),
    onSuccess: (job) => {
      setExportJobId(job.jobId);
      setNotice({ type: "info", message: `Export started for ${job.repositoryName}` });
    },
    onError: (err) => {
      setNotice({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to start GitHub export",
      });
    },
  });

  function handleNameChange(value: string) {
    setName(value);
    setSlug(slugify(value));
  }

  useEffect(() => {
    if (!exportStatus) {
      return;
    }

    if (exportStatus.state === "completed") {
      setNotice({
        type: "success",
        message: exportStatus.repositoryUrl
          ? `Exported to ${exportStatus.repositoryUrl}`
          : `Exported ${exportStatus.repositoryName} to GitHub`,
      });
      return;
    }

    if (exportStatus.state === "failed") {
      setNotice({
        type: "error",
        message: exportStatus.error ?? exportStatus.message ?? "Export failed",
      });
    }
  }, [exportStatus]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-8 text-slate-900">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">Dashboard</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">My Apps</h1>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <button
              type="button"
              onClick={() => setShowForm((value) => !value)}
              className="inline-flex h-12 items-center justify-center rounded-full bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              New App
            </button>
          </div>
        </header>

        {notice ? (
          <div
            className={`rounded-3xl p-4 text-sm ring-1 ${
              notice.type === "success"
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                : notice.type === "error"
                  ? "bg-rose-50 text-rose-700 ring-rose-200"
                  : "bg-sky-50 text-sky-700 ring-sky-200"
            }`}
          >
            {notice.message}
          </div>
        ) : null}

        {showForm ? (
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Create new app</h2>
                <p className="text-sm text-slate-500">Define the app metadata and deploy a runtime config.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setError(null);
                }}
                className="text-sm font-semibold text-slate-500 hover:text-slate-900"
              >
                Cancel
              </button>
            </div>

            {error ? (
              <div className="mb-4 rounded-2xl bg-rose-50 p-4 text-sm text-rose-700 ring-1 ring-rose-200">
                {error}
              </div>
            ) : null}

            <form
              onSubmit={(event) => {
                event.preventDefault();
                setError(null);
                if (!name.trim()) {
                  setError("App name is required");
                  return;
                }
                if (!slug.trim()) {
                  setError("App slug is required");
                  return;
                }
                createMutation.mutate();
              }}
              className="grid gap-6"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  App name
                  <input
                    value={name}
                    onChange={(event) => handleNameChange(event.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    placeholder="My app"
                  />
                </label>
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  App slug
                  <input
                    value={slug}
                    onChange={(event) => setSlug(slugify(event.target.value))}
                    className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    placeholder="my-app"
                  />
                </label>
              </div>

              <label className="space-y-2 text-sm font-medium text-slate-700">
                JSON config
                <textarea
                  value={config}
                  onChange={(event) => setConfig(event.target.value)}
                  rows={10}
                  className="w-full rounded-3xl border border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </label>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={() => setConfig(exampleConfig)}
                  className="inline-flex h-12 items-center justify-center rounded-full border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-900 transition hover:border-slate-400"
                >
                  Reset example
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="inline-flex h-12 items-center justify-center rounded-full bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {createMutation.isPending ? "Creating app..." : "Create app"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <section className="grid gap-6">
          {appsQuery.isLoading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="animate-pulse rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
              >
                <div className="h-6 w-40 rounded-full bg-slate-200" />
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="h-4 rounded-full bg-slate-200" />
                  <div className="h-4 rounded-full bg-slate-200" />
                </div>
              </div>
            ))
          ) : apps.length === 0 ? (
            <div className="rounded-3xl bg-white p-10 text-center text-slate-500 shadow-sm ring-1 ring-slate-200">
              No apps yet. Create your first app.
            </div>
          ) : (
            apps.map((app) => {
              const appRecord = app as Record<string, unknown>;
              const slugValue = typeof appRecord.slug === "string" ? appRecord.slug : "";
              const nameValue = typeof appRecord.name === "string" ? appRecord.name : "Untitled";
              const createdAt = typeof appRecord.createdAt === "string" ? appRecord.createdAt : "";

              return (
                <div
                  key={slugValue || nameValue}
                  className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">{nameValue}</p>
                      <p className="mt-1 text-base text-slate-700">/{slugValue}</p>
                    </div>
                    <Link
                      href={`/apps/${encodeURIComponent(slugValue)}`}
                      className="inline-flex h-11 items-center justify-center rounded-full bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      Open
                    </Link>
                  </div>
                  <div className="mt-4 text-sm text-slate-500">
                    Created at: {createdAt ? new Date(createdAt).toLocaleString() : "Unknown"}
                  </div>

                  <div className="mt-5 border-t border-slate-200 pt-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">GitHub Export</p>
                        <p className="text-sm text-slate-500">Generate a production-ready repo and push it to GitHub.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveExportSlug((current) => (current === slugValue ? null : slugValue));
                          setExportRepositoryName(slugify(slugValue || nameValue));
                          setExportIsPrivate(true);
                          setExportToken("");
                          setNotice(null);
                        }}
                        className="inline-flex h-11 items-center justify-center rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:border-slate-400"
                      >
                        Export to GitHub
                      </button>
                    </div>

                    {activeExportSlug === slugValue ? (
                      <form
                        className="mt-4 grid gap-4 rounded-3xl bg-slate-50 p-4 ring-1 ring-slate-200"
                        onSubmit={(event) => {
                          event.preventDefault();

                          if (!exportRepositoryName.trim()) {
                            setNotice({ type: "error", message: "Repository name is required" });
                            return;
                          }

                          if (!exportToken.trim()) {
                            setNotice({ type: "error", message: "GitHub token is required" });
                            return;
                          }

                          exportMutation.mutate({
                            appSlug: slugValue,
                            repositoryName: exportRepositoryName.trim(),
                            isPrivate: exportIsPrivate,
                            githubToken: exportToken.trim(),
                          });
                        }}
                      >
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="space-y-2 text-sm font-medium text-slate-700">
                            Repository name
                            <input
                              value={exportRepositoryName}
                              onChange={(event) => setExportRepositoryName(event.target.value)}
                              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                              placeholder="my-exported-app"
                            />
                          </label>
                          <label className="space-y-2 text-sm font-medium text-slate-700">
                            GitHub token
                            <input
                              type="password"
                              value={exportToken}
                              onChange={(event) => setExportToken(event.target.value)}
                              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                              placeholder="ghp_..."
                            />
                          </label>
                        </div>

                        <label className="flex items-center gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700">
                          <input
                            type="checkbox"
                            checked={exportIsPrivate}
                            onChange={(event) => setExportIsPrivate(event.target.checked)}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          Private repository
                        </label>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                          {exportStatus && exportStatus.appSlug === slugValue ? (
                            <div className="mr-auto flex-1 rounded-2xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-semibold text-slate-900">{exportStatus.message}</span>
                                <span>{exportStatus.progress}%</span>
                              </div>
                              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                                <div
                                  className="h-full rounded-full bg-slate-900 transition-all"
                                  style={{ width: `${Math.min(exportStatus.progress, 100)}%` }}
                                />
                              </div>
                              {exportStatus.repositoryUrl ? (
                                <a
                                  href={exportStatus.repositoryUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-3 inline-flex text-sm font-semibold text-slate-900 underline decoration-slate-400 underline-offset-4"
                                >
                                  Open repository
                                </a>
                              ) : null}
                            </div>
                          ) : null}
                          <button
                            type="submit"
                            disabled={exportMutation.isPending}
                            className="inline-flex h-12 items-center justify-center rounded-full bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                          >
                            {exportMutation.isPending ? "Exporting..." : "Push to GitHub"}
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}

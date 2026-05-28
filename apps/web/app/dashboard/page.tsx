'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApps, createApp } from "../../core/api-client";
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
    name: "Example entity",
    entities: [
      {
        name: "Item",
        fields: [
          { name: "title", type: "string", required: true },
          { name: "published", type: "boolean" },
        ],
      },
    ],
    pages: [],
    workflows: [],
    auth: { providers: ["credentials"], roles: ["user", "admin"] },
  },
  null,
  2,
);

export default function DashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [config, setConfig] = useState(exampleConfig);
  const [error, setError] = useState<string | null>(null);

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
      queryClient.invalidateQueries(["apps"]);
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

  function handleNameChange(value: string) {
    setName(value);
    setSlug(slugify(value));
  }

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
                  disabled={createMutation.isLoading}
                  className="inline-flex h-12 items-center justify-center rounded-full bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {createMutation.isLoading ? "Creating app..." : "Create app"}
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
                </div>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}

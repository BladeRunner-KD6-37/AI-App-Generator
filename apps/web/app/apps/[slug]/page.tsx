'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getApp } from "../../../core/api-client";
import { parseConfig } from "../../../core/config/parser";
import PageRenderer from "../../../core/renderer/PageRenderer";
import { isAuthenticated } from "../../../lib/auth";
import NotificationBell from "../../../features/notifications/NotificationBell";
import type { PageDef } from "../../../core/config/types";

interface AppPageProps {
  params: {
    slug: string;
  };
}

export default function AppPage({ params }: AppPageProps) {
  const router = useRouter();
  const { slug } = params;
  const [activePage, setActivePage] = useState<PageDef | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
    }
  }, [router]);

  const appQuery = useQuery({
    queryKey: ["app", slug],
    queryFn: () => getApp(slug),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const appData = appQuery.data as Record<string, unknown> | undefined;

  const config = useMemo(() => {
    if (!appData || !appData.config) {
      return parseConfig(undefined);
    }
    return parseConfig(appData.config);
  }, [appData]);

  useEffect(() => {
    if (config.pages.length > 0) {
      setActivePage((current) => {
        if (current && config.pages.some((page) => page.slug === current.slug)) {
          return current;
        }
        return config.pages[0];
      });
    }
  }, [config.pages]);

  if (appQuery.isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="animate-pulse rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="h-8 w-1/3 rounded bg-slate-200" />
          </div>
          <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
            <div className="space-y-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="h-10 rounded bg-slate-200" />
              <div className="space-y-3">
                <div className="h-4 rounded bg-slate-200" />
                <div className="h-4 rounded bg-slate-200" />
                <div className="h-4 rounded bg-slate-200" />
              </div>
            </div>
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="h-10 rounded bg-slate-200" />
              <div className="mt-6 space-y-4">
                <div className="h-4 rounded bg-slate-200" />
                <div className="h-4 rounded bg-slate-200" />
                <div className="h-4 rounded bg-slate-200" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (appQuery.isError || !appData) {
    const message = appQuery.error instanceof Error ? appQuery.error.message : "App not found";
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-8">
        <div className="mx-auto max-w-4xl rounded-3xl bg-white p-10 text-center shadow-sm ring-1 ring-slate-200">
          <p className="text-lg font-semibold text-slate-900">Unable to load app</p>
          <p className="mt-3 text-sm text-slate-600">{message}</p>
          <Link href="/dashboard" className="mt-6 inline-flex rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">App overview</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
              {typeof appData.name === "string" ? appData.name : "Untitled App"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex h-11 items-center justify-center rounded-full border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
            >
              Back to dashboard
            </Link>
            <NotificationBell />
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          <aside className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">Pages</p>
            {config.pages.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">No pages configured. Edit your app config to add pages.</p>
            ) : (
              <nav className="mt-4 space-y-2">
                {config.pages.map((page) => {
                  const active = activePage?.slug === page.slug;
                  return (
                    <button
                      key={page.slug}
                      type="button"
                      onClick={() => setActivePage(page)}
                      className={`block w-full rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                        active ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {page.name}
                    </button>
                  );
                })}
              </nav>
            )}
          </aside>

          <main className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            {config.pages.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                No pages configured. Edit your app config to add pages.
              </div>
            ) : activePage ? (
              <PageRenderer page={activePage} config={config} appSlug={slug} />
            ) : (
              <div className="text-slate-600">Select a page to view content.</div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

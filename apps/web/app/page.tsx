import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 px-6 py-16 text-slate-900">
      <main className="mx-auto flex max-w-3xl flex-col items-center justify-center gap-10 rounded-3xl bg-white p-12 shadow-xl ring-1 ring-slate-200">
        <div className="space-y-4 text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-500">MetaRuntime</p>
          <h1 className="text-5xl font-semibold tracking-tight text-slate-900 sm:text-6xl">
            Convert JSON configuration into a working application
          </h1>
          <p className="mx-auto max-w-2xl text-lg leading-8 text-slate-600">
            Build apps from metadata definitions, connect runtime routes, and deploy your workflow-driven UI fast.
          </p>
        </div>

        <div className="flex w-full flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/register"
            className="inline-flex h-12 items-center justify-center rounded-full bg-slate-900 px-6 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Get Started
          </Link>
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center rounded-full border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
          >
            Login
          </Link>
        </div>
      </main>
    </div>
  );
}

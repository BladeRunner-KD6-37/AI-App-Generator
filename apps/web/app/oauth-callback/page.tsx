'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveAuth } from '../../lib/auth';

export default function OAuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handle() {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        if (!code) {
          setError('Missing code in callback');
          return;
        }

        const res = await fetch('/api/oauth/google/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });

        const body = await res.json();
        if (!res.ok || !body.success) {
          setError(body?.error || 'OAuth failed');
          return;
        }

        const { data } = body;
        saveAuth(data);
        router.push('/dashboard');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'OAuth callback failed';
        setError(message);
      }
    }

    handle();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md rounded-xl bg-white p-8 shadow">
        {error ? (
          <div className="text-center text-sm text-rose-700">{error}</div>
        ) : (
          <div className="text-center text-sm text-slate-700">Signing you in…</div>
        )}
      </div>
    </div>
  );
}

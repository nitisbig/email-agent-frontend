"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const AUTH_STORAGE_KEY = "email-agent-auth";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const payload = searchParams.get("payload");
    if (typeof window !== "undefined" && payload) {
      try {
        const parsed = JSON.parse(payload);
        if (parsed?.email) {
          window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(parsed));
        }
      } catch (error) {
        console.warn("Unable to restore authentication payload", error);
      }
    }
    router.replace("/");
  }, [router, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f6fb] text-slate-600">
      <div className="rounded-3xl border border-slate-200 bg-white px-8 py-6 shadow-md shadow-slate-200">
        <p className="text-sm font-medium">Completing Google sign-in...</p>
      </div>
    </main>
  );
}

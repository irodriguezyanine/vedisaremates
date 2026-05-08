"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

export function HeaderAuth({ onNavigate }: { onNavigate?: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    setMounted(true);
    const client = createClient();
    if (!client) return;
    const conn = client;

    async function hydrate() {
      const {
        data: { session },
      } = await conn.auth.getSession();
      const user = session?.user;
      setEmail(user?.email ?? null);
      if (user?.id) {
        const { data } = await conn.from("profiles").select("rol").eq("id", user.id).maybeSingle();
        setAdmin((data?.rol ?? "").toLowerCase() === "admin");
      } else {
        setAdmin(false);
      }
    }

    void hydrate();

    const {
      data: { subscription },
    } = conn.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      const user = session?.user;
      setEmail(user?.email ?? null);
      void (async () => {
        if (user?.id) {
          const { data } = await conn.from("profiles").select("rol").eq("id", user.id).maybeSingle();
          setAdmin((data?.rol ?? "").toLowerCase() === "admin");
        } else {
          setAdmin(false);
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    const supabase = createClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    setEmail(null);
    setAdmin(false);
    onNavigate?.();
    window.location.href = "/";
  }

  if (!mounted) {
    return <div className="h-9 min-w-[10rem] shrink-0" aria-hidden />;
  }

  if (email) {
    return (
      <div className="flex flex-nowrap items-center justify-end gap-1.5 sm:gap-2">
        <span
          className="hidden max-w-[10rem] shrink truncate text-[11px] text-white/80 min-[1180px]:inline min-[1180px]:max-w-[12rem]"
          title={email}
        >
          {email}
        </span>
        <Link
          href="/mi-cuenta"
          onClick={onNavigate}
          className="shrink-0 rounded-md border border-white/20 px-2 py-1.5 text-[11px] font-semibold text-white/95 hover:border-[#33C7E3] hover:text-[#33C7E3] sm:px-2.5 sm:text-xs"
        >
          Mi cuenta
        </Link>
        {admin ? (
          <Link
            href="/admin"
            onClick={onNavigate}
            className="shrink-0 rounded-md border border-[#FFC600]/60 px-2 py-1.5 text-[11px] font-bold text-[#FFC600] hover:bg-white/10 sm:px-2.5 sm:text-xs"
          >
            Admin
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() => void signOut()}
          className="shrink-0 rounded-md border border-white/25 px-2 py-1.5 text-[11px] font-semibold text-white hover:border-[#33C7E3] sm:px-2.5 sm:text-xs"
        >
          Salir
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/registro"
        onClick={onNavigate}
        className="rounded-md border border-white/25 px-4 py-2 text-sm font-semibold text-white hover:border-[#33C7E3] hover:text-[#33C7E3]"
      >
        Registrarse
      </Link>
      <Link
        href="/ingreso"
        onClick={onNavigate}
        className="rounded-md bg-gradient-to-r from-[#33C7E3] to-[#2ab0c9] px-4 py-2 text-sm font-bold text-[#0f1f2c] shadow-md hover:brightness-105"
      >
        Inicia sesión
      </Link>
    </div>
  );
}

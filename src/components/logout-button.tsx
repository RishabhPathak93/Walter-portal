"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass } from "@/components/ui";

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className={buttonClass("ghost", "sm", className)}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" } });
        } finally {
          router.push("/");
          router.refresh();
        }
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}

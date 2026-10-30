import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { Alert, Container } from "@/components/ui";
import { DEFAULT_NAME, DEFAULT_TAGLINE, getShellData } from "@/lib/site";
import { getCompetition } from "@/lib/services/queries";
import { isSupabaseConfigured } from "@/lib/env";

export async function generateMetadata(): Promise<Metadata> {
  let name = DEFAULT_NAME;
  let tagline = DEFAULT_TAGLINE;
  if (isSupabaseConfigured()) {
    try {
      const c = await getCompetition();
      name = c.name;
      tagline = c.tagline || tagline;
    } catch {
      /* fall back to defaults */
    }
  }
  return {
    title: { default: name, template: `%s · ${name}` },
    description: tagline,
    robots: { index: true, follow: true },
  };
}

// Every page depends on the session or live competition data.
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#060a08",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { viewer, competition, configured } = await getShellData();
  const name = competition?.name ?? DEFAULT_NAME;

  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink"
        >
          Skip to content
        </a>
        <SiteHeader viewer={viewer} competitionName={name} />
        {!configured ? (
          <Container className="pt-6">
            <Alert tone="warn" title="Setup required">
              Supabase environment variables are missing. Copy <code className="font-mono">.env.example</code> to{" "}
              <code className="font-mono">.env.local</code> and follow the README.
            </Alert>
          </Container>
        ) : null}
        {viewer?.isDisabled ? (
          <Container className="pt-6">
            <Alert tone="danger" title="Competition access disabled">
              An administrator has disabled your competition access. You can still browse, but flag submissions are blocked.
            </Alert>
          </Container>
        ) : null}
        <main id="main" className="flex-1 py-10 sm:py-14">
          {children}
        </main>
        <footer className="border-t border-line py-6">
          <Container className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-subtle">
            <span>
              {name} <span className="text-accent">::</span> individual CTF
            </span>
            <span>Times shown in your local time zone · server clock is authoritative</span>
          </Container>
        </footer>
      </body>
    </html>
  );
}

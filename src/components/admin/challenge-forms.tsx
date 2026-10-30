"use client";

import { useState, type FormEvent } from "react";
import { Alert, Badge, Button, Field, Input, Select, Spinner, Textarea } from "@/components/ui";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { DIFFICULTIES } from "@/lib/validation";

type ChallengeInput = {
  slug: string;
  title: string;
  description: string;
  category: string;
  difficulty: (typeof DIFFICULTIES)[number];
  isActive: boolean;
  sortOrder: number;
};

export type AdminChallengeView = ChallengeInput & {
  id: string;
  hasFlag: boolean;
  solveCount: number;
  attemptCount: number;
  incorrectCount: number;
};

function ChallengeFields({ value, onChange, idPrefix }: { value: ChallengeInput; onChange: (v: ChallengeInput) => void; idPrefix: string }) {
  const set = <K extends keyof ChallengeInput>(k: K, v: ChallengeInput[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Title" htmlFor={`${idPrefix}-title`}>
        <Input id={`${idPrefix}-title`} value={value.title} maxLength={120} required onChange={(e) => set("title", e.target.value)} />
      </Field>
      <Field label="Slug" htmlFor={`${idPrefix}-slug`} hint="URL id: lowercase, numbers, hyphens">
        <Input
          id={`${idPrefix}-slug`}
          value={value.slug}
          maxLength={64}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          required
          className="font-mono"
          onChange={(e) => set("slug", e.target.value.toLowerCase())}
        />
      </Field>
      <Field label="Category" htmlFor={`${idPrefix}-category`}>
        <Input id={`${idPrefix}-category`} value={value.category} maxLength={40} required onChange={(e) => set("category", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Difficulty" htmlFor={`${idPrefix}-difficulty`}>
          <Select
            id={`${idPrefix}-difficulty`}
            value={value.difficulty}
            onChange={(e) => set("difficulty", e.target.value as ChallengeInput["difficulty"])}
          >
            {DIFFICULTIES.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </Select>
        </Field>
        <Field label="Sort order" htmlFor={`${idPrefix}-sort`}>
          <Input id={`${idPrefix}-sort`} type="number" value={value.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value))} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Description" htmlFor={`${idPrefix}-description`} hint="Plain text. http(s) links become clickable. Do not include the flag.">
          <Textarea
            id={`${idPrefix}-description`}
            value={value.description}
            maxLength={10000}
            rows={6}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value.isActive} onChange={(e) => set("isActive", e.target.checked)} className="size-4 accent-[#3ee08a]" />
        Active (visible and accepting submissions)
      </label>
    </div>
  );
}

export function CreateChallengeForm() {
  const empty: ChallengeInput = { slug: "", title: "", description: "", category: "Web Security", difficulty: "Easy", isActive: false, sortOrder: 100 };
  const [value, setValue] = useState(empty);
  const [flag, setFlag] = useState("");
  const { busy, feedback, run } = useAdminAction();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const res = await run("/api/admin/challenges", "POST", { ...value, flag });
    if (res.ok) {
      setValue(empty);
      setFlag("");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 p-5">
      <ChallengeFields value={value} onChange={setValue} idPrefix="new" />
      <Field label="Flag" htmlFor="new-flag" hint="Stored only as an HMAC digest. It can never be displayed again.">
        <Input id="new-flag" value={flag} onChange={(e) => setFlag(e.target.value)} required maxLength={256} autoComplete="off" spellCheck={false} className="font-mono" />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? <Spinner /> : null} Create challenge
        </Button>
        {feedback ? <Alert tone={feedback.tone} className="flex-1">{feedback.message}</Alert> : null}
      </div>
    </form>
  );
}

export function ChallengeAdminRow({ challenge }: { challenge: AdminChallengeView }) {
  const [value, setValue] = useState<ChallengeInput>({
    slug: challenge.slug,
    title: challenge.title,
    description: challenge.description,
    category: challenge.category,
    difficulty: challenge.difficulty,
    isActive: challenge.isActive,
    sortOrder: challenge.sortOrder,
  });
  const [flag, setFlag] = useState("");
  const edit = useAdminAction();
  const toggle = useAdminAction();
  const flagAction = useAdminAction();

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {challenge.title} <span className="ml-1 font-mono text-xs text-muted">/{challenge.slug}</span>
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Badge tone={challenge.isActive ? "accent" : "neutral"}>{challenge.isActive ? "active" : "inactive"}</Badge>
            <Badge>{challenge.category}</Badge>
            <Badge>{challenge.difficulty}</Badge>
            <Badge tone={challenge.hasFlag ? "accent" : "danger"}>{challenge.hasFlag ? "flag set" : "no flag"}</Badge>
            <Badge tone="info">
              {challenge.solveCount} solves · {challenge.incorrectCount}/{challenge.attemptCount} wrong
            </Badge>
          </div>
        </div>
        <Button
          variant={challenge.isActive ? "secondary" : "primary"}
          size="sm"
          disabled={toggle.busy}
          onClick={() => toggle.run(`/api/admin/challenges/${challenge.id}`, "PATCH", { isActive: !challenge.isActive })}
        >
          {toggle.busy ? <Spinner /> : null}
          {challenge.isActive ? "Deactivate" : "Activate"}
        </Button>
      </div>
      {toggle.feedback?.tone === "danger" ? <Alert tone="danger" className="mt-3">{toggle.feedback.message}</Alert> : null}

      <details className="group mt-3 rounded-lg border border-line bg-bg/30">
        <summary className="cursor-pointer select-none px-4 py-2 text-sm text-muted hover:text-fg">Edit details & flag</summary>
        <div className="space-y-6 border-t border-line p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void edit.run(`/api/admin/challenges/${challenge.id}`, "PATCH", value);
            }}
            className="space-y-4"
          >
            <ChallengeFields value={value} onChange={setValue} idPrefix={challenge.id} />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="sm" disabled={edit.busy}>
                {edit.busy ? <Spinner /> : null} Save details
              </Button>
              {edit.feedback ? <Alert tone={edit.feedback.tone} className="flex-1">{edit.feedback.message}</Alert> : null}
            </div>
          </form>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const res = await flagAction.run(`/api/admin/challenges/${challenge.id}/flag`, "PUT", { flag });
              if (res.ok) setFlag("");
            }}
            className="space-y-3 border-t border-line pt-4"
          >
            <Field
              label="Replace flag"
              htmlFor={`${challenge.id}-flag`}
              hint="The current flag is never shown. Existing solves are kept; only future submissions use the new flag."
            >
              <Input
                id={`${challenge.id}-flag`}
                value={flag}
                onChange={(e) => setFlag(e.target.value)}
                required
                maxLength={256}
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                placeholder="flag{...}"
              />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="sm" variant="secondary" disabled={flagAction.busy || !flag.trim()}>
                {flagAction.busy ? <Spinner /> : null} Set new flag
              </Button>
              {flagAction.feedback ? <Alert tone={flagAction.feedback.tone} className="flex-1">{flagAction.feedback.message}</Alert> : null}
            </div>
          </form>
        </div>
      </details>
    </div>
  );
}

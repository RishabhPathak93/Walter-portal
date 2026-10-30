import { Container, Spinner } from "@/components/ui";

export default function Loading() {
  return (
    <Container className="flex items-center gap-3 font-mono text-sm text-muted" aria-busy="true">
      <Spinner className="text-accent" /> loading…
    </Container>
  );
}

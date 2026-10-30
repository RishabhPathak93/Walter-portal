import { Container, LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <Container className="max-w-xl text-center">
      <p className="font-mono text-sm text-accent">HTTP 404</p>
      <h1 className="mt-2 text-3xl font-semibold">Nothing to capture here</h1>
      <p className="mt-2 text-muted">The page or challenge you are looking for does not exist or is not available.</p>
      <div className="mt-6 flex justify-center gap-3">
        <LinkButton href="/challenges">Challenges</LinkButton>
        <LinkButton href="/" variant="secondary">
          Home
        </LinkButton>
      </div>
    </Container>
  );
}

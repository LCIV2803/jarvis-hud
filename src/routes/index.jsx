import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Jarvis HUD" }] }),
  component: HomePage,
});

function HomePage() {
  return <main className="min-h-screen bg-background" />;
}
// Minimal API server that can also renderPage server-side.
export function renderPage(title: string): string {
  return `api:${title}`;
}

export function startServer(port: number): { port: number } {
  return { port };
}

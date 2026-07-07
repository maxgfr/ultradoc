// Shared helpers across the git-host providers (GitHub, GitLab, Gitea, …).

// Optional GitHub auth as a keyless-by-default enhancer: when GITHUB_TOKEN is
// set, send it on the public REST fallback so a run isn't capped at the ~10
// req/min unauthenticated search limit. Absent → no header, unchanged behavior.
export function ghAuthHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN?.trim();
  return token ? { authorization: `Bearer ${token}` } : {};
}

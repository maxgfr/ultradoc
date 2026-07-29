// Serialize work that touches one repo's cache entry.
//
// `ensureClone` and `ensureIndex` are not concurrency-safe: two overlapping
// calls for the same slug race on `git clone` into the same directory (the
// second sees a half-populated `.git` and either throws "already exists and is
// not empty" or, worse, returns a partial tree as if it were valid) and on the
// index write. The CLI never hit this because one process runs one command;
// the MCP server can have several tool calls in flight at once.
//
// The fix is a promise chain per slug — the smallest thing that is actually
// correct. It is deliberately coarse: an `ask` on a repo blocks a `symbol` on
// the SAME repo, while different repos stay fully parallel. Finer locking (hold
// it across `buildContext` only, then release before the network fan-out in
// `runSources`) would need a hook threaded through `ask.ts`; it is a follow-up,
// not a v1 requirement.
//
// This guards a single process. The cross-process race — an MCP server and a
// CLI invocation running side by side — is what `writeFileAtomic` in `util.ts`
// covers; the clone itself remains a known gap.
const chains = new Map<string, Promise<unknown>>();

export function withRepoLock<T>(slug: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(slug) ?? Promise.resolve();
  // Chain off `prev` however it settled: a failed predecessor must not poison
  // every later call for the same repo.
  const next = prev.then(fn, fn);
  // The tail the NEXT caller waits on never rejects, so one thrown tool call
  // can't reject the whole queue behind it.
  const tail = next.then(noop, noop);
  chains.set(slug, tail);
  // Drop the entry once the tail is still us, so a long-lived server doesn't
  // accumulate a settled promise per repo it ever touched.
  tail.then(() => {
    if (chains.get(slug) === tail) chains.delete(slug);
  }, noop);
  return next;
}

function noop(): void {}

// Test seam: drop every pending chain. Never call this from product code — an
// in-flight lock holder would stop serializing against later arrivals.
export function resetRepoLocks(): void {
  chains.clear();
}

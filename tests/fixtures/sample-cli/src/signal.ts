// Register a handler invoked when the process receives an interrupt signal
// (SIGINT) or a termination signal (SIGTERM). The handler runs once; the
// signal then re-raises with the default behavior.
export function onInterrupt(handler: () => void): void {
  let fired = false;
  const once = () => {
    if (fired) return;
    fired = true;
    handler();
  };
  process.on("SIGINT", once);
  process.on("SIGTERM", once);
}

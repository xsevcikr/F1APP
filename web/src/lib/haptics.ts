/** A short vibration where the browser supports it (Android; iOS Safari does not). */
export function tick(ms = 10) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(ms);
  } catch {
    /* unsupported */
  }
}

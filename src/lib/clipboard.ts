/**
 * Copies text to the clipboard.
 *
 * `navigator.clipboard` only exists in a secure context (HTTPS or localhost).
 * DockLite's remote mode serves the app over plain HTTP on a LAN address, so
 * the async API is routinely absent there. This falls back to the legacy
 * `execCommand("copy")` path via an off-screen textarea, and never throws —
 * callers should check the returned boolean and report failure themselves.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path below.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

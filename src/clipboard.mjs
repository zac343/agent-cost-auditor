export async function writeClipboardText(value, options = {}) {
  const text = String(value ?? "");
  if (!text) throw new Error("Nothing is available to copy.");

  const clipboard = Object.hasOwn(options, "clipboard")
    ? options.clipboard
    : globalThis.navigator?.clipboard;
  if (typeof clipboard?.writeText === "function") {
    const timeoutMs = Number.isFinite(options.clipboardTimeoutMs)
      ? Math.max(1, Math.min(2_000, options.clipboardTimeoutMs))
      : 800;
    let timeoutId;
    const copied = await Promise.race([
      Promise.resolve()
        .then(() => clipboard.writeText(text))
        .then(() => true, () => false),
      new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve(false), timeoutMs);
      })
    ]);
    clearTimeout(timeoutId);
    if (copied) return "clipboard";
  }

  const documentRef = Object.hasOwn(options, "documentRef")
    ? options.documentRef
    : globalThis.document;
  if (
    !documentRef?.body
    || typeof documentRef.createElement !== "function"
    || typeof documentRef.execCommand !== "function"
  ) {
    throw new Error("Clipboard access is unavailable.");
  }

  const textarea = documentRef.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.inset = "0 auto auto -9999px";
  textarea.style.opacity = "0";
  documentRef.body.appendChild(textarea);

  let copied = false;
  try {
    textarea.select();
    textarea.setSelectionRange?.(0, text.length);
    copied = documentRef.execCommand("copy");
  } finally {
    textarea.remove();
  }

  if (!copied) throw new Error("Clipboard access is unavailable.");
  return "selection";
}

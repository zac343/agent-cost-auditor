const STORAGE_KEY = "agentcartai-cost-audit-language";

function normalizeLanguage(value) {
  const language = String(value || "").trim().toLowerCase();
  if (language === "zh" || language.startsWith("zh-")) return "zh";
  if (language === "en" || language.startsWith("en-")) return "en";
  return "";
}

export function resolvePageLanguage({ query = "", stored = "", browser = "" } = {}) {
  return normalizeLanguage(query) || normalizeLanguage(stored) || normalizeLanguage(browser) || "en";
}

function detectedLanguage() {
  if (typeof window === "undefined") return "en";
  const queryLanguage = new URLSearchParams(window.location.search).get("lang");
  let storedLanguage = "";
  try {
    storedLanguage = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Language detection still works when browser storage is unavailable.
  }
  return resolvePageLanguage({
    query: queryLanguage,
    stored: storedLanguage,
    browser: window.navigator?.language
  });
}

export const pageLanguage = detectedLanguage();

export function isChinese() {
  return pageLanguage === "zh";
}

export function t(english, chinese) {
  return isChinese() ? chinese : english;
}

export function applyPageLocale(root = document) {
  if (!root?.querySelectorAll) return;
  const html = root.documentElement || root.ownerDocument?.documentElement;
  if (html) html.lang = isChinese() ? "zh-CN" : "en";

  for (const element of root.querySelectorAll("[data-zh]")) {
    if (isChinese()) element.textContent = element.dataset.zh;
  }
  for (const element of root.querySelectorAll("[data-placeholder-zh]")) {
    if (isChinese()) element.setAttribute("placeholder", element.dataset.placeholderZh);
  }
  for (const element of root.querySelectorAll("[data-aria-zh]")) {
    if (isChinese()) element.setAttribute("aria-label", element.dataset.ariaZh);
  }

  const toggle = root.getElementById?.("language-toggle");
  if (!toggle) return;
  toggle.textContent = isChinese() ? "EN" : "中文";
  const label = isChinese() ? "Switch to English" : "切换到中文";
  toggle.setAttribute("aria-label", label);
  toggle.setAttribute("title", label);
  toggle.addEventListener("click", () => {
    const nextLanguage = isChinese() ? "en" : "zh";
    try {
      window.localStorage.setItem(STORAGE_KEY, nextLanguage);
    } catch {
      // The query parameter remains a durable language override.
    }
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("lang", nextLanguage);
    window.location.assign(nextUrl.href);
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => applyPageLocale(document), { once: true });
  } else {
    applyPageLocale(document);
  }
}

const UNSAFE_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g;

export const sanitizeFilename = (value: string) => {
  const normalized = value
    .normalize("NFKD")
    .replace(UNSAFE_FILENAME_CHARS, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  return normalized || "transcript";
};

export const titleFromSource = (source: { kind: "file"; filename: string } | { kind: "url"; url: string }) => {
  if (source.kind === "file") {
    return sanitizeFilename(source.filename.replace(/\.[^.]+$/, ""));
  }

  try {
    const url = new URL(source.url);
    const lastPath = url.pathname.split("/").filter(Boolean).at(-1);
    return sanitizeFilename(decodeURIComponent(lastPath || url.hostname));
  } catch {
    return "URL transcript";
  }
};

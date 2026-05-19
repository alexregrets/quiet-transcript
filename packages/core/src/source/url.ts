const DIRECT_MEDIA_EXTENSIONS = new Set(["mp3", "wav", "m4a", "aac", "ogg", "opus", "flac", "mp4", "mov", "webm", "mkv"]);

export const validateHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return { ok: false as const, error: "Only http and https URLs are supported." };
    }

    return { ok: true as const, url };
  } catch {
    return { ok: false as const, error: "Enter a valid URL." };
  }
};

export const isDirectMediaUrl = (value: string) => {
  const validation = validateHttpUrl(value);
  if (!validation.ok) {
    return false;
  }

  const extension = validation.url.pathname.split(".").at(-1)?.toLowerCase();
  return extension ? DIRECT_MEDIA_EXTENSIONS.has(extension) : false;
};

export const describeUrlSupport = (value: string) => {
  if (isDirectMediaUrl(value)) {
    return "direct-media";
  }

  const validation = validateHttpUrl(value);
  if (!validation.ok) {
    return "invalid";
  }

  return "extractor-required";
};

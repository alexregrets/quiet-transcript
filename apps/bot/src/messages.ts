export type BotLocale = "en" | "ru";

/** Telegram reports the client language; anything other than Russian falls back to English. */
export const pickLocale = (languageCode: string | undefined): BotLocale =>
  languageCode?.toLowerCase().startsWith("ru") ? "ru" : "en";

export const messages = {
  en: {
    start:
      "Send me an audio or video file, a voice message, or a link (YouTube, TikTok, VK, Instagram, Rutube) and I will reply with a Markdown transcript.",
    help: "Send audio, video, a voice message, or a link. Files up to 20 MB — that is Telegram's limit for bots.",
    queued: "Got it. Starting…",
    downloading: "Downloading from Telegram…",
    extracting: "Extracting audio from the link…",
    transcribing: "Transcribing. This can take a few minutes…",
    invalidUrl: "That does not look like a link I can open. Send an http or https URL.",
    tooLarge: (limit: string) => `That file is over ${limit}. Telegram does not let bots download anything bigger.`,
    uploadTooLarge: (limit: string) => `The extracted audio is over ${limit}, which is too large to transcribe.`,
    empty: "That file is empty.",
    unsupportedDocument: "I can only read audio and video files. Send one of those, or a link.",
    busy: "I am still working on your previous message. One at a time, please.",
    failed: (reason: string) => `Something went wrong: ${reason}`,
    caption: (title: string, duration: string) => `${title}\nDuration: ${duration}`
  },
  ru: {
    start:
      "Пришлите аудио или видео, голосовое сообщение либо ссылку (YouTube, TikTok, VK, Instagram, Rutube) — я отвечу транскриптом в Markdown.",
    help: "Пришлите аудио, видео, голосовое сообщение или ссылку. Файлы до 20 МБ — это ограничение Telegram для ботов.",
    queued: "Принято. Начинаю…",
    downloading: "Скачиваю из Telegram…",
    extracting: "Извлекаю аудио по ссылке…",
    transcribing: "Распознаю речь. Это может занять несколько минут…",
    invalidUrl: "Это не похоже на ссылку, которую я могу открыть. Пришлите http или https адрес.",
    tooLarge: (limit: string) => `Файл больше ${limit}. Telegram не даёт ботам скачивать файлы крупнее.`,
    uploadTooLarge: (limit: string) => `Извлечённое аудио больше ${limit} — это слишком много для распознавания.`,
    empty: "Файл пустой.",
    unsupportedDocument: "Я умею читать только аудио и видео. Пришлите такой файл или ссылку.",
    busy: "Я ещё обрабатываю прошлое сообщение. Пожалуйста, по одному.",
    failed: (reason: string) => `Что-то пошло не так: ${reason}`,
    caption: (title: string, duration: string) => `${title}\nДлительность: ${duration}`
  }
} satisfies Record<BotLocale, Record<string, unknown>>;

export const formatDuration = (seconds: number | undefined) => {
  if (!seconds || seconds <= 0) {
    return "—";
  }

  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  return `${minutes}m ${remaining}s`;
};

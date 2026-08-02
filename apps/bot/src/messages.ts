export type BotLocale = "en" | "ru";

/** Telegram reports the client language; anything other than Russian falls back to English. */
export const pickLocale = (languageCode: string | undefined): BotLocale =>
  languageCode?.toLowerCase().startsWith("ru") ? "ru" : "en";

export const messages = {
  en: {
    start:
      "Send me an audio or video file, a voice message, or a link (YouTube, TikTok, VK, Instagram, Rutube) and I will reply with a Markdown transcript.\n\nFirst, connect your own Gladia API key with /setkey — transcription runs on your key, so you keep your own free quota.",
    help:
      "Commands:\n/setkey <key> — connect your Gladia API key\n/status — check whether a key is connected\n/deletekey — remove your stored key\n\nThen send audio, video, a voice message, or a link. Files up to 20 MB — that is Telegram's limit for bots.",
    statusReady: (masked: string) => `Key connected (${masked}). Send audio, video, or a link.`,
    statusMissing: "No key connected yet. Send /setkey your-key to get started.",
    noKey:
      "You need your own Gladia API key first.\n\n1. Get a free one at gladia.io (about 10 hours a month)\n2. Send it here as: /setkey your-key\n\nTranscription runs on your key, so nobody shares a quota.",
    setKeyUsage: "Send the key with the command, like: /setkey your-key-here",
    keyBadFormat: "That does not look like an API key. Copy it from gladia.io and try again.",
    keySaved: "Key saved. Send me audio, a video, or a link.",
    keyUnverified:
      "Key saved, but Gladia did not confirm it just now. Try a transcription — if it fails, re-check the key.",
    keyRejected: "Gladia rejected that key. Check you copied all of it from gladia.io.",
    deleteMessageHint: "Now delete your message with the key — I cannot delete it for you.",
    keyRemoved: "Your key is deleted. I no longer store anything for you.",
    keyNotStored: "I do not have a key stored for you.",
    checkingKey: "Checking the key…",
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
      "Пришлите аудио или видео, голосовое сообщение либо ссылку (YouTube, TikTok, VK, Instagram, Rutube) — я отвечу транскриптом в Markdown.\n\nСначала подключите свой ключ Gladia через /setkey — распознавание идёт на вашем ключе, так что квота остаётся вашей.",
    help:
      "Команды:\n/setkey <ключ> — подключить ваш ключ Gladia\n/status — проверить, подключён ли ключ\n/deletekey — удалить сохранённый ключ\n\nДальше присылайте аудио, видео, голосовое или ссылку. Файлы до 20 МБ — это ограничение Telegram для ботов.",
    statusReady: (masked: string) => `Ключ подключён (${masked}). Присылайте аудио, видео или ссылку.`,
    statusMissing: "Ключ пока не подключён. Отправьте /setkey ваш-ключ, чтобы начать.",
    noKey:
      "Сначала нужен ваш собственный ключ Gladia.\n\n1. Получите бесплатный на gladia.io (около 10 часов в месяц)\n2. Пришлите его сюда командой: /setkey ваш-ключ\n\nРаспознавание идёт на вашем ключе, так что общей квоты ни у кого нет.",
    setKeyUsage: "Пришлите ключ вместе с командой, например: /setkey ваш-ключ",
    keyBadFormat: "Это не похоже на API-ключ. Скопируйте его с gladia.io и попробуйте снова.",
    keySaved: "Ключ сохранён. Присылайте аудио, видео или ссылку.",
    keyUnverified:
      "Ключ сохранён, но Gladia сейчас его не подтвердила. Попробуйте транскрибацию — если не выйдет, проверьте ключ.",
    keyRejected: "Gladia отклонила этот ключ. Проверьте, что скопировали его целиком с gladia.io.",
    deleteMessageHint: "Теперь удалите своё сообщение с ключом — я не могу сделать это за вас.",
    keyRemoved: "Ваш ключ удалён. Я больше ничего о вас не храню.",
    keyNotStored: "У меня нет сохранённого ключа для вас.",
    checkingKey: "Проверяю ключ…",
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

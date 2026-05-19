import { buildMarkdown } from "../markdown";
import { titleFromSource } from "../source/sanitize";
import { validateHttpUrl } from "../source/url";
import type { TranscriptionProvider, TranscriptionRequest, TranscriptionResult, TranscriptSegment } from "../types";

const GLADIA_API_BASE = "https://api.gladia.io";
const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 120;

interface GladiaConfig {
  apiKey: string;
  fetchImpl?: typeof fetch;
}

interface GladiaUploadResponse {
  audio_url: string;
  audio_metadata?: {
    filename?: string;
    audio_duration?: number;
  };
}

interface GladiaJobResponse {
  id: string;
  result_url?: string;
}

interface GladiaResultResponse {
  id?: string;
  status?: string;
  result?: {
    metadata?: {
      audio_duration?: number;
      language?: string;
    };
    transcription?: {
      full_transcript?: string;
      languages?: string[];
      utterances?: Array<{
        start?: number;
        end?: number;
        speaker?: number | string;
        text?: string;
      }>;
    };
  };
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const assertOk = async (response: Response, label: string) => {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${label} failed with ${response.status}: ${body || response.statusText}`);
  }
};

const mapSegments = (payload: GladiaResultResponse): TranscriptSegment[] | undefined => {
  const utterances = payload.result?.transcription?.utterances;
  if (!utterances?.length) {
    return undefined;
  }

  return utterances
    .filter((utterance) => utterance.text?.trim())
    .map((utterance) => ({
      startSeconds: utterance.start,
      endSeconds: utterance.end,
      speaker: utterance.speaker === undefined ? undefined : `Speaker ${utterance.speaker}`,
      text: utterance.text?.trim() ?? ""
    }));
};

export class GladiaProvider implements TranscriptionProvider {
  readonly name = "gladia";
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: GladiaConfig) {
    this.apiKey = config.apiKey;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    const audioUrl = request.audioUrl ?? (request.file ? await this.uploadFile(request.file) : this.requireAudioUrl(request));
    const job = await this.createJob(audioUrl, request.languageHints);
    const payload = await this.poll(job.id, job.result_url);
    const title = request.title ?? titleFromSource(request.source);
    const text = payload.result?.transcription?.full_transcript?.trim() ?? "";
    const language = payload.result?.transcription?.languages?.[0] ?? payload.result?.metadata?.language;
    const durationSeconds = payload.result?.metadata?.audio_duration;

    return {
      id: payload.id ?? job.id,
      title,
      source: request.source,
      language,
      durationSeconds,
      createdAt: new Date().toISOString(),
      text,
      segments: mapSegments(payload),
      provider: this.name
    };
  }

  private requireAudioUrl(request: TranscriptionRequest) {
    if (request.source.kind !== "url") {
      throw new Error("A file Blob or audio URL is required for file transcription.");
    }

    const validation = validateHttpUrl(request.source.url);
    if (!validation.ok) {
      throw new Error(validation.error);
    }

    return validation.url.toString();
  }

  private async uploadFile(file: Blob) {
    const body = new FormData();
    body.append("audio", file);

    const response = await this.fetchImpl(`${GLADIA_API_BASE}/v2/upload`, {
      method: "POST",
      headers: {
        "x-gladia-key": this.apiKey
      },
      body
    });

    await assertOk(response, "Gladia upload");
    const payload = (await response.json()) as GladiaUploadResponse;
    return payload.audio_url;
  }

  private async createJob(audioUrl: string, languageHints: string[] = []) {
    const response = await this.fetchImpl(`${GLADIA_API_BASE}/v2/pre-recorded`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-gladia-key": this.apiKey
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        language_config: {
          languages: languageHints,
          code_switching: languageHints.length > 1
        },
        sentences: true,
        subtitles: false,
        diarization: false
      })
    });

    await assertOk(response, "Gladia job creation");
    return (await response.json()) as GladiaJobResponse;
  }

  private async poll(id: string, resultUrl?: string) {
    const url = resultUrl ?? `${GLADIA_API_BASE}/v2/pre-recorded/${id}`;

    for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          "x-gladia-key": this.apiKey
        }
      });
      await assertOk(response, "Gladia polling");
      const payload = (await response.json()) as GladiaResultResponse;

      if (payload.status === "done") {
        return payload;
      }

      if (payload.status === "error") {
        throw new Error("Gladia transcription failed.");
      }

      await wait(POLL_INTERVAL_MS);
    }

    throw new Error("Gladia transcription timed out.");
  }
}

export const createMarkdownFromResult = buildMarkdown;

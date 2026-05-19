# Source Extraction

The MVP supports direct media URLs first. This keeps the first product reliable and avoids bundling a downloader that may need platform-specific binaries.

## Current Interface

- `validateHttpUrl(value)` accepts only `http` and `https`.
- `isDirectMediaUrl(value)` checks common audio/video extensions.
- `describeUrlSupport(value)` returns:
  - `direct-media`
  - `extractor-required`
  - `invalid`

## Next Step: YouTube And Page URLs

Add a `SourceExtractor` interface in `packages/core`:

```ts
interface SourceExtractor {
  name: string;
  canExtract(url: URL): boolean;
  extract(url: URL): Promise<{ audioUrl: string; title?: string; durationSeconds?: number }>;
}
```

Recommended first implementation: a server-side `yt-dlp` adapter for desktop and web API routes. Keep it behind an explicit command and never let arbitrary local paths pass from the frontend to the downloader.

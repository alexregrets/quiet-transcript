import { isDirectMediaUrl } from "@transcriber/core";

export default function Page() {
  const exampleUrl = "https://files.gladia.io/example/audio-transcription/split_infinity.wav";

  return (
    <main className="web-shell">
      <section className="web-card">
        <p className="web-kicker">Phase 1 web shell</p>
        <h1>Quiet Transcript</h1>
        <p className="web-copy">
          The desktop app contains the full MVP flow. This web workspace is ready for the same Supabase Auth,
          server-side Gladia calls, and shared Markdown output.
        </p>
        <div className="web-panel">
          <p className="web-panel-title">Direct media URL support check</p>
          <p className="web-url">{exampleUrl}</p>
          <p className="web-status">{isDirectMediaUrl(exampleUrl) ? "Supported" : "Needs extractor"}</p>
        </div>
      </section>
    </main>
  );
}

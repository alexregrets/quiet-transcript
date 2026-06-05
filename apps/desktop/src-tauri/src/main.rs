use reqwest::multipart::{Form, Part};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    env,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::Duration,
};
use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;
use tokio::time::sleep;
use url::Url;

static YTDLP_PATH: OnceLock<Option<PathBuf>> = OnceLock::new();

const GLADIA_API_BASE: &str = "https://api.gladia.io";
const MAX_POLLS: usize = 120;
static ENV_REPORT: OnceLock<EnvLoadReport> = OnceLock::new();
static PENDING_AUTH_DEEP_LINKS: OnceLock<Mutex<Vec<String>>> = OnceLock::new();

#[derive(Debug, Deserialize)]
struct UploadResponse {
    audio_url: String,
}

#[derive(Debug, Deserialize)]
struct JobResponse {
    id: String,
    result_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GladiaPollResponse {
    id: Option<String>,
    status: Option<String>,
    result: Option<GladiaResult>,
}

#[derive(Debug, Deserialize)]
struct GladiaResult {
    metadata: Option<GladiaMetadata>,
    transcription: Option<GladiaTranscription>,
}

#[derive(Debug, Deserialize)]
struct GladiaMetadata {
    audio_duration: Option<f64>,
    language: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GladiaTranscription {
    full_transcript: Option<String>,
    languages: Option<Vec<String>>,
    utterances: Option<Vec<GladiaUtterance>>,
}

#[derive(Debug, Deserialize)]
struct GladiaUtterance {
    start: Option<f64>,
    end: Option<f64>,
    speaker: Option<serde_json::Value>,
    text: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TranscriptPayload {
    result: TranscriptionResult,
    markdown: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TranscriptionResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    title: String,
    source: TranscriptionSource,
    #[serde(skip_serializing_if = "Option::is_none")]
    language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    duration_seconds: Option<f64>,
    created_at: String,
    text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    segments: Option<Vec<TranscriptSegment>>,
    provider: String,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum TranscriptionSource {
    File {
        filename: String,
        #[serde(rename = "mimeType")]
        #[serde(skip_serializing_if = "Option::is_none")]
        mime_type: Option<String>,
        #[serde(rename = "sizeBytes")]
        size_bytes: usize,
    },
    Url {
        url: String,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TranscriptSegment {
    #[serde(skip_serializing_if = "Option::is_none")]
    start_seconds: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    end_seconds: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    speaker: Option<String>,
    text: String,
}

#[derive(Debug, Clone)]
struct EnvLoadReport {
    current_dir: Option<PathBuf>,
    cargo_manifest_dir: PathBuf,
    loaded_env_path: Option<PathBuf>,
    gladia_key_present: bool,
    checked_paths: Vec<PathBuf>,
}

#[derive(Debug, Serialize)]
struct EnvHealthCheck {
    current_dir: Option<String>,
    cargo_manifest_dir: String,
    loaded_env_path: Option<String>,
    gladia_key_present: bool,
    checked_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
struct AuthDeepLinkPayload {
    url: String,
}

#[tauri::command]
async fn transcribe_file(
    filename: String,
    mime_type: Option<String>,
    bytes: Vec<u8>,
) -> Result<TranscriptPayload, String> {
    validate_filename(&filename)?;
    validate_media_extension(&filename)?;

    let api_key = gladia_key()?;
    let client = reqwest::Client::new();
    let size_bytes = bytes.len();
    let audio_url = upload_file(&client, &api_key, &filename, mime_type.as_deref(), bytes).await?;
    let payload = transcribe_audio_url(
        &client,
        &api_key,
        &audio_url,
        TranscriptionSource::File {
            filename: filename.clone(),
            mime_type,
            size_bytes,
        },
        title_from_filename(&filename),
    )
    .await?;

    Ok(payload)
}

#[tauri::command]
async fn transcribe_file_path(path: String) -> Result<TranscriptPayload, String> {
    let path = PathBuf::from(path);
    if !path.is_file() {
        return Err("Dropped path is not a file.".to_string());
    }

    // Security: only the OS-provided drag/drop path is read, and only after validating it is a supported media file.
    let filename = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Invalid dropped filename.".to_string())?
        .to_string();

    validate_filename(&filename)?;
    validate_drag_drop_extension(&filename)?;

    let bytes = std::fs::read(&path).map_err(|error| format!("Could not read dropped file: {error}"))?;
    let mime_type = mime_type_from_filename(&filename).map(str::to_string);
    let api_key = gladia_key()?;
    let client = reqwest::Client::new();
    let size_bytes = bytes.len();
    let audio_url = upload_file(&client, &api_key, &filename, mime_type.as_deref(), bytes).await?;

    transcribe_audio_url(
        &client,
        &api_key,
        &audio_url,
        TranscriptionSource::File {
            filename: filename.clone(),
            mime_type,
            size_bytes,
        },
        title_from_filename(&filename),
    )
    .await
}

#[tauri::command]
async fn transcribe_url(url: String) -> Result<TranscriptPayload, String> {
    validate_url(&url)?;

    let api_key = gladia_key()?;
    let client = reqwest::Client::new();

    if is_direct_media_url(&url) {
        return transcribe_audio_url(
            &client,
            &api_key,
            &url,
            TranscriptionSource::Url { url: url.clone() },
            title_from_url(&url),
        )
        .await;
    }

    // Non-direct URL: extract audio via yt-dlp
    let ytdlp = resolve_ytdlp_path().ok_or_else(|| "yt-dlp not found in resources.".to_string())?;
    let temp_dir = std::env::temp_dir();
    let out_template = temp_dir.join("qt_%(id)s.%(ext)s");
    let out_template_str = out_template.to_string_lossy().to_string();

    let output = std::process::Command::new(&ytdlp)
        .args([
            "--extract-audio",
            "--audio-format", "m4a",
            "--audio-quality", "0",
            "--no-playlist",
            "--no-warnings",
            "--print", "after_move:filepath",
            "-o", &out_template_str,
            &url,
        ])
        .output()
        .map_err(|e| format!("Failed to run yt-dlp: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp failed: {stderr}"));
    }

    let extracted_path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let extracted_path = PathBuf::from(&extracted_path_str);

    if !extracted_path.is_file() {
        return Err(format!("yt-dlp did not produce a file at: {extracted_path_str}"));
    }

    let filename = extracted_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("extracted.m4a")
        .to_string();

    let bytes = std::fs::read(&extracted_path)
        .map_err(|e| format!("Could not read extracted audio: {e}"))?;
    let _ = std::fs::remove_file(&extracted_path);

    let size_bytes = bytes.len();
    let audio_url = upload_file(&client, &api_key, &filename, Some("audio/mp4"), bytes).await?;

    transcribe_audio_url(
        &client,
        &api_key,
        &audio_url,
        TranscriptionSource::Url { url: url.clone() },
        title_from_url(&url),
    )
    .await
}

#[tauri::command]
fn env_health_check() -> EnvHealthCheck {
    env_report_to_health_check(ensure_env_loaded())
}

#[tauri::command]
fn pending_auth_deep_links() -> Vec<String> {
    pending_auth_links()
        .lock()
        .map(|mut links| std::mem::take(&mut *links))
        .unwrap_or_default()
}

fn gladia_key() -> Result<String, String> {
    ensure_env_loaded();
    env::var("GLADIA_API_KEY").map_err(|_| "GLADIA_API_KEY is not set.".to_string())
}

fn ensure_env_loaded() -> &'static EnvLoadReport {
    ENV_REPORT.get_or_init(load_env_for_dev)
}

fn load_env_for_dev() -> EnvLoadReport {
    let current_dir = env::current_dir().ok();
    let cargo_manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let checked_paths = collect_env_candidates(current_dir.as_deref(), &cargo_manifest_dir);
    let loaded_env_path = choose_env_path(&checked_paths);

    eprintln!(
        "[env] current_dir: {}",
        current_dir
            .as_ref()
            .map(path_to_string)
            .unwrap_or_else(|| "<unavailable>".to_string())
    );
    eprintln!("[env] CARGO_MANIFEST_DIR: {}", cargo_manifest_dir.display());
    for candidate in &checked_paths {
        eprintln!("[env] candidate: {}", candidate.display());
    }

    if let Some(path) = &loaded_env_path {
        match dotenvy::from_path_override(path) {
            Ok(_) => eprintln!("[env] loaded: {}", path.display()),
            Err(error) => eprintln!("[env] failed to load {}: {error}", path.display()),
        }
    } else {
        eprintln!("[env] loaded: <none>");
    }

    let gladia_key_present = env::var_os("GLADIA_API_KEY").is_some();
    eprintln!("[env] GLADIA_API_KEY present after load: {gladia_key_present}");

    EnvLoadReport {
        current_dir,
        cargo_manifest_dir,
        loaded_env_path,
        gladia_key_present,
        checked_paths,
    }
}

fn collect_env_candidates(current_dir: Option<&Path>, cargo_manifest_dir: &Path) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    let mut candidates = Vec::new();

    if let Some(dir) = current_dir {
        collect_env_candidates_from(dir, &mut seen, &mut candidates);
    }
    collect_env_candidates_from(cargo_manifest_dir, &mut seen, &mut candidates);

    candidates
}

fn collect_env_candidates_from(
    start: &Path,
    seen: &mut HashSet<PathBuf>,
    candidates: &mut Vec<PathBuf>,
) {
    let mut cursor = Some(start);

    while let Some(dir) = cursor {
        let candidate = dir.join(".env");
        if seen.insert(candidate.clone()) {
            candidates.push(candidate);
        }
        cursor = dir.parent();
    }
}

fn choose_env_path(candidates: &[PathBuf]) -> Option<PathBuf> {
    candidates
        .iter()
        .filter(|path| path.is_file())
        .find(|path| {
            path.parent()
                .is_some_and(|parent| parent.join("pnpm-workspace.yaml").is_file())
        })
        .cloned()
        .or_else(|| {
            candidates
                .iter()
                .filter(|path| path.is_file())
                .last()
                .cloned()
        })
}

fn env_report_to_health_check(report: &EnvLoadReport) -> EnvHealthCheck {
    EnvHealthCheck {
        current_dir: report.current_dir.as_ref().map(path_to_string),
        cargo_manifest_dir: path_to_string(&report.cargo_manifest_dir),
        loaded_env_path: report.loaded_env_path.as_ref().map(path_to_string),
        gladia_key_present: report.gladia_key_present,
        checked_paths: report.checked_paths.iter().map(path_to_string).collect(),
    }
}

fn path_to_string(path: &PathBuf) -> String {
    path.display().to_string()
}

fn validate_filename(filename: &str) -> Result<(), String> {
    // Security: only the browser-selected filename is used, never a local path from untrusted UI input.
    if filename.contains('/') || filename.contains('\\') || filename.trim().is_empty() {
        return Err("Invalid filename.".to_string());
    }
    Ok(())
}

fn validate_media_extension(filename: &str) -> Result<(), String> {
    let allowed = [
        "mp3", "wav", "m4a", "aac", "ogg", "opus", "flac", "mp4", "mov", "webm", "mkv",
    ];
    let extension = filename
        .rsplit('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();

    if allowed.contains(&extension.as_str()) {
        Ok(())
    } else {
        Err("Unsupported media file extension.".to_string())
    }
}

fn validate_drag_drop_extension(filename: &str) -> Result<(), String> {
    validate_media_extension(filename).map_err(|_| "Unsupported dropped media file extension.".to_string())
}

fn mime_type_from_filename(filename: &str) -> Option<&'static str> {
    let extension = filename.rsplit('.').next()?.to_ascii_lowercase();
    match extension.as_str() {
        "mp3" => Some("audio/mpeg"),
        "wav" => Some("audio/wav"),
        "m4a" => Some("audio/mp4"),
        "aac" => Some("audio/aac"),
        "ogg" => Some("audio/ogg"),
        "opus" => Some("audio/opus"),
        "flac" => Some("audio/flac"),
        "mp4" => Some("video/mp4"),
        "mov" => Some("video/quicktime"),
        "webm" => Some("video/webm"),
        "mkv" => Some("video/x-matroska"),
        _ => None,
    }
}

fn validate_url(value: &str) -> Result<(), String> {
    let parsed = Url::parse(value).map_err(|_| "Enter a valid URL.".to_string())?;
    if parsed.scheme() != "https" && parsed.scheme() != "http" {
        return Err("Only http and https URLs are supported.".to_string());
    }
    Ok(())
}

fn is_direct_media_url(value: &str) -> bool {
    let extensions = ["mp3", "wav", "m4a", "aac", "ogg", "opus", "flac", "mp4", "mov", "webm", "mkv"];
    Url::parse(value)
        .ok()
        .and_then(|url| {
            url.path_segments()
                .and_then(|segs| segs.last().map(str::to_lowercase))
        })
        .map(|last| {
            extensions.iter().any(|ext| last.ends_with(&format!(".{ext}")))
        })
        .unwrap_or(false)
}

fn resolve_ytdlp_path() -> Option<PathBuf> {
    YTDLP_PATH
        .get_or_init(|| {
            // In production: next to the exe in the resources dir
            let exe_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
            let candidate = exe_dir.join("yt-dlp.exe");
            if candidate.is_file() {
                return Some(candidate);
            }
            // Dev: in src-tauri/resources
            let cargo_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
            let dev_candidate = cargo_dir.join("resources").join("yt-dlp.exe");
            if dev_candidate.is_file() {
                return Some(dev_candidate);
            }
            None
        })
        .clone()
}

fn pending_auth_links() -> &'static Mutex<Vec<String>> {
    PENDING_AUTH_DEEP_LINKS.get_or_init(|| Mutex::new(Vec::new()))
}

fn is_auth_deep_link(value: &str) -> bool {
    Url::parse(value)
        .map(|url| url.scheme() == "quiet-transcript" && url.host_str() == Some("auth"))
        .unwrap_or(false)
}

fn handle_auth_deep_link<R: tauri::Runtime>(app: &tauri::AppHandle<R>, value: &str, store_pending: bool) {
    if !is_auth_deep_link(value) {
        return;
    }

    if store_pending {
        if let Ok(mut pending) = pending_auth_links().lock() {
            pending.push(value.to_string());
        }
    }

    if app
        .emit(
            "auth-deep-link",
            AuthDeepLinkPayload {
                url: value.to_string(),
            },
        )
        .is_err()
    {
        eprintln!("[auth] failed to emit auth deep-link event");
    }
}

async fn upload_file(
    client: &reqwest::Client,
    api_key: &str,
    filename: &str,
    mime_type: Option<&str>,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let part = Part::bytes(bytes)
        .file_name(filename.to_string())
        .mime_str(mime_type.unwrap_or("application/octet-stream"))
        .map_err(|error| error.to_string())?;
    let form = Form::new().part("audio", part);
    let response = client
        .post(format!("{GLADIA_API_BASE}/v2/upload"))
        .header("x-gladia-key", api_key)
        .multipart(form)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    ensure_ok(response, "Gladia upload")
        .await?
        .json::<UploadResponse>()
        .await
        .map_err(|error| error.to_string())
        .map(|payload| payload.audio_url)
}

async fn transcribe_audio_url(
    client: &reqwest::Client,
    api_key: &str,
    audio_url: &str,
    source: TranscriptionSource,
    title: String,
) -> Result<TranscriptPayload, String> {
    let job = create_job(client, api_key, audio_url).await?;
    let result = poll_job(client, api_key, &job).await?;
    let transcription = result
        .result
        .as_ref()
        .and_then(|value| value.transcription.as_ref());
    let metadata = result
        .result
        .as_ref()
        .and_then(|value| value.metadata.as_ref());
    let text = transcription
        .and_then(|value| value.full_transcript.clone())
        .unwrap_or_default();
    let language = transcription
        .and_then(|value| value.languages.as_ref())
        .and_then(|languages| languages.first().cloned())
        .or_else(|| metadata.and_then(|value| value.language.clone()));
    let duration_seconds = metadata.and_then(|value| value.audio_duration);
    let segments = map_segments(transcription);
    let created_at = current_iso_timestamp();

    let transcript = TranscriptionResult {
        id: result.id.or(Some(job.id)),
        title,
        source,
        language,
        duration_seconds,
        created_at,
        text,
        segments,
        provider: "gladia".to_string(),
    };
    let markdown = build_markdown(&transcript);

    Ok(TranscriptPayload {
        result: transcript,
        markdown,
    })
}

async fn create_job(
    client: &reqwest::Client,
    api_key: &str,
    audio_url: &str,
) -> Result<JobResponse, String> {
    let response = client
        .post(format!("{GLADIA_API_BASE}/v2/pre-recorded"))
        .header("Content-Type", "application/json")
        .header("x-gladia-key", api_key)
        .json(&serde_json::json!({
            "audio_url": audio_url,
            "language_config": {
                "languages": [],
                "code_switching": false
            },
            "sentences": true,
            "diarization": false
        }))
        .send()
        .await
        .map_err(|error| error.to_string())?;

    ensure_ok(response, "Gladia job creation")
        .await?
        .json::<JobResponse>()
        .await
        .map_err(|error| error.to_string())
}

async fn poll_job(
    client: &reqwest::Client,
    api_key: &str,
    job: &JobResponse,
) -> Result<GladiaPollResponse, String> {
    let result_url = job
        .result_url
        .clone()
        .unwrap_or_else(|| format!("{GLADIA_API_BASE}/v2/pre-recorded/{}", job.id));

    for _ in 0..MAX_POLLS {
        let response = client
            .get(&result_url)
            .header("x-gladia-key", api_key)
            .send()
            .await
            .map_err(|error| error.to_string())?;
        let payload = ensure_ok(response, "Gladia polling")
            .await?
            .json::<GladiaPollResponse>()
            .await
            .map_err(|error| error.to_string())?;

        match payload.status.as_deref() {
            Some("done") => return Ok(payload),
            Some("error") => return Err("Gladia transcription failed.".to_string()),
            _ => sleep(Duration::from_millis(2500)).await,
        }
    }

    Err("Gladia transcription timed out.".to_string())
}

async fn ensure_ok(response: reqwest::Response, label: &str) -> Result<reqwest::Response, String> {
    if response.status().is_success() {
        return Ok(response);
    }

    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    Err(format!("{label} failed with {status}: {body}"))
}

fn map_segments(transcription: Option<&GladiaTranscription>) -> Option<Vec<TranscriptSegment>> {
    let segments: Vec<TranscriptSegment> = transcription?
        .utterances
        .as_ref()?
        .iter()
        .filter_map(|utterance| {
            let text = utterance.text.as_ref()?.trim().to_string();
            if text.is_empty() {
                return None;
            }

            Some(TranscriptSegment {
                start_seconds: utterance.start,
                end_seconds: utterance.end,
                speaker: utterance
                    .speaker
                    .as_ref()
                    .map(|speaker| format!("Speaker {speaker}")),
                text,
            })
        })
        .collect();

    if segments.is_empty() {
        None
    } else {
        Some(segments)
    }
}

fn title_from_filename(filename: &str) -> String {
    sanitize_filename(
        filename
            .rsplit_once('.')
            .map(|value| value.0)
            .unwrap_or(filename),
    )
}

fn title_from_url(value: &str) -> String {
    Url::parse(value)
        .ok()
        .and_then(|url| {
            url.path_segments()
                .and_then(|mut segments| segments.next_back().map(str::to_string))
                .filter(|segment| !segment.is_empty())
                .or_else(|| url.host_str().map(str::to_string))
        })
        .map(|segment| sanitize_filename(&segment))
        .unwrap_or_else(|| "URL transcript".to_string())
}

fn sanitize_filename(value: &str) -> String {
    let sanitized: String = value
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
            character if character.is_control() => '-',
            character => character,
        })
        .collect::<String>()
        .trim()
        .chars()
        .take(120)
        .collect();

    if sanitized.is_empty() {
        "transcript".to_string()
    } else {
        sanitized
    }
}

fn build_markdown(result: &TranscriptionResult) -> String {
    let source = match &result.source {
        TranscriptionSource::File { filename, .. } => filename.clone(),
        TranscriptionSource::Url { url } => url.clone(),
    };
    let duration = result
        .duration_seconds
        .map(format_duration)
        .unwrap_or_else(|| "Unknown".to_string());
    let language = result
        .language
        .clone()
        .unwrap_or_else(|| "Unknown".to_string());
    let mut markdown = format!(
        "# {}\n\n| Field | Value |\n| --- | --- |\n| Source | {} |\n| Language | {} |\n| Duration | {} |\n| Created | {} |\n| Provider | {} |\n\n## Transcript\n\n{}\n",
        result.title,
        source,
        language,
        duration,
        result.created_at,
        result.provider,
        if result.text.trim().is_empty() {
            "_No transcript text returned._"
        } else {
            result.text.trim()
        }
    );

    if let Some(segments) = &result.segments {
        markdown.push_str("\n## Timestamps\n\n");
        for segment in segments {
            let timestamp = segment
                .start_seconds
                .map(format_timestamp)
                .unwrap_or_default();
            let speaker = segment
                .speaker
                .clone()
                .map(|value| format!(" **{value}:**"))
                .unwrap_or_default();
            markdown.push_str(&format!("- {timestamp}{speaker} {}\n", segment.text));
        }
    }

    markdown
}

fn format_duration(seconds: f64) -> String {
    let rounded = seconds.round() as u64;
    let hours = rounded / 3600;
    let minutes = (rounded % 3600) / 60;
    let remaining_seconds = rounded % 60;

    if hours > 0 {
        format!("{hours}h {minutes}m {remaining_seconds}s")
    } else {
        format!("{minutes}m {remaining_seconds}s")
    }
}

fn format_timestamp(seconds: f64) -> String {
    let rounded = seconds.max(0.0).floor() as u64;
    format!("[{:02}:{:02}]", rounded / 60, rounded % 60)
}

fn current_iso_timestamp() -> String {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| "unknown".to_string())
}

fn main() {
    ensure_env_loaded();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // Forward deep-link URLs from second instance to first
            for arg in &argv {
                handle_auth_deep_link(app, arg, false);
            }
            // Bring window to front
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let _ = app.get_webview_window("main");

            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            app.deep_link().register_all()?;

            let app_handle = app.handle().clone();

            if let Ok(Some(urls)) = app.deep_link().get_current() {
                for url in urls {
                    handle_auth_deep_link(&app_handle, url.as_str(), true);
                }
            }

            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    handle_auth_deep_link(&app_handle, url.as_str(), false);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            transcribe_file,
            transcribe_file_path,
            transcribe_url,
            env_health_check,
            pending_auth_deep_links
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use reqwest::multipart::{Form, Part};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    env,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};
use tauri::{path::BaseDirectory, Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;
use tokio::time::sleep;
use url::Url;

static YTDLP_PATH: OnceLock<Option<PathBuf>> = OnceLock::new();
static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

const GLADIA_API_BASE: &str = "https://api.gladia.io";
/// Files are buffered in memory before upload, so refuse anything that would risk
/// exhausting RAM. Surfaced to the user as a clear message instead of a crash.
const MAX_UPLOAD_BYTES: u64 = 500 * 1024 * 1024;
const POLL_INTERVAL: Duration = Duration::from_millis(2500);
/// Gladia needs roughly a tenth of the audio duration, so an hour of polling covers
/// files far longer than anything the 500 MB upload limit allows.
const MAX_POLL_DURATION: Duration = Duration::from_secs(60 * 60);
/// A dropped connection mid-transcription used to lose the whole job. Tolerate a run of
/// failures — the job keeps running on Gladia's side regardless of our polling.
const MAX_CONSECUTIVE_POLL_FAILURES: usize = 8;
const UPLOAD_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);
const EXTRACTION_TIMEOUT: Duration = Duration::from_secs(15 * 60);

/// Hides the console window yt-dlp would otherwise flash on every social link.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

static ENV_REPORT: OnceLock<EnvLoadReport> = OnceLock::new();
static PENDING_AUTH_DEEP_LINKS: OnceLock<Mutex<Vec<String>>> = OnceLock::new();

/// A failure the frontend can localize.
///
/// `code` is a stable identifier the UI maps to a translated sentence; `detail` carries
/// the raw technical text (Gladia body, yt-dlp stderr) for the log line under it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppError {
    code: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
}

impl AppError {
    fn new(code: &'static str) -> Self {
        Self { code, detail: None }
    }

    fn with(code: &'static str, detail: impl Into<String>) -> Self {
        let detail = detail.into();
        let trimmed = detail.trim();

        Self {
            code,
            detail: (!trimmed.is_empty()).then(|| truncate_detail(trimmed)),
        }
    }

    /// Transient failures are worth another poll; everything else ends the job.
    fn is_transient(&self) -> bool {
        matches!(self.code, "network" | "gladia_transient")
    }
}

/// Keeps a runaway error body (Gladia can return HTML) out of the UI and the log.
fn truncate_detail(value: &str) -> String {
    const LIMIT: usize = 300;

    if value.chars().count() <= LIMIT {
        return value.to_string();
    }

    let head: String = value.chars().take(LIMIT).collect();
    format!("{head}…")
}

type CommandResult<T> = Result<T, AppError>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressPayload {
    stage: &'static str,
}

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
    error_code: Option<serde_json::Value>,
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

/// Transcribes a file the OS handed us a path to — the native picker or a drag-and-drop.
///
/// There is deliberately no byte-array command: `invoke` serializes bytes as a JSON array
/// of numbers, so a large recording would be copied several times over before Rust could
/// touch it. Reading from the path keeps one copy.
#[tauri::command]
async fn transcribe_file_path(
    app: tauri::AppHandle,
    path: String,
    api_key: Option<String>,
) -> CommandResult<TranscriptPayload> {
    let path = PathBuf::from(path);
    if !path.is_file() {
        return Err(AppError::new("not_a_file"));
    }

    // Security: only an OS-provided path (drag/drop or the native picker) is read, and
    // only after validating it is a supported media file.
    let filename = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| AppError::new("invalid_filename"))?
        .to_string();

    validate_filename(&filename)?;
    validate_media_extension(&filename)?;

    // Check size from metadata first so an oversized file is never read into memory.
    let size_on_disk = std::fs::metadata(&path)
        .map_err(|error| AppError::with("file_read_failed", error.to_string()))?
        .len();
    validate_upload_size(size_on_disk)?;

    emit_progress(&app, "uploading");
    let bytes =
        std::fs::read(&path).map_err(|error| AppError::with("file_read_failed", error.to_string()))?;
    let mime_type = mime_type_from_filename(&filename).map(str::to_string);
    let api_key = resolve_api_key(api_key)?;
    let size_bytes = bytes.len();
    let audio_url = upload_file(&api_key, &filename, mime_type.as_deref(), bytes).await?;

    transcribe_audio_url(
        &app,
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
async fn transcribe_url(
    app: tauri::AppHandle,
    url: String,
    api_key: Option<String>,
) -> CommandResult<TranscriptPayload> {
    validate_url(&url)?;

    let api_key = resolve_api_key(api_key)?;

    if is_direct_media_url(&url) {
        // Gladia fetches direct media itself, so there is nothing to upload.
        return transcribe_audio_url(
            &app,
            &api_key,
            &url,
            TranscriptionSource::Url { url: url.clone() },
            title_from_url(&url),
        )
        .await;
    }

    emit_progress(&app, "extracting");
    let extracted = extract_audio(&app, &url).await?;

    emit_progress(&app, "uploading");
    let mime_type = mime_type_from_filename(&extracted.filename).unwrap_or("audio/mp4");
    let audio_url = upload_file(&api_key, &extracted.filename, Some(mime_type), extracted.bytes).await?;

    transcribe_audio_url(
        &app,
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

/// Checks whether a Gladia key is accepted, without spending transcription quota.
///
/// Only an explicit 401/403 is reported as a bad key. Any other non-success status
/// resolves to `unverified` so a Gladia outage or an endpoint change never tells the
/// user their key is invalid when it is not.
#[tauri::command]
async fn verify_gladia_key(api_key: String) -> CommandResult<String> {
    let key = api_key.trim();
    if key.is_empty() {
        return Err(AppError::new("no_api_key"));
    }

    let response = http_client()
        .get(format!("{GLADIA_API_BASE}/v2/pre-recorded"))
        .query(&[("limit", "1")])
        .header("x-gladia-key", key)
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|error| AppError::with("network", error.to_string()))?;

    match response.status().as_u16() {
        401 | 403 => Err(AppError::new("gladia_auth")),
        status if (200..300).contains(&status) => Ok("valid".to_string()),
        _ => Ok("unverified".to_string()),
    }
}

/// One client for the whole process: connection reuse plus timeouts that keep a stalled
/// socket from hanging a transcription forever.
fn http_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(20))
            .pool_idle_timeout(Duration::from_secs(90))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    })
}

fn emit_progress(app: &tauri::AppHandle, stage: &'static str) {
    if app.emit("transcription-progress", ProgressPayload { stage }).is_err() {
        eprintln!("[progress] failed to emit stage {stage}");
    }
}

/// A key supplied from the Settings screen wins; the `.env` value is the dev fallback.
fn resolve_api_key(user_key: Option<String>) -> CommandResult<String> {
    if let Some(key) = user_key {
        let trimmed = key.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    gladia_key()
}

fn gladia_key() -> CommandResult<String> {
    ensure_env_loaded();
    env::var("GLADIA_API_KEY").map_err(|_| AppError::new("no_api_key"))
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
        .or_else(|| candidates.iter().rfind(|path| path.is_file()).cloned())
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

fn path_to_string(path: impl AsRef<Path>) -> String {
    path.as_ref().display().to_string()
}

fn validate_filename(filename: &str) -> CommandResult<()> {
    // Security: only the browser-selected filename is used, never a local path from untrusted UI input.
    if filename.contains('/') || filename.contains('\\') || filename.trim().is_empty() {
        return Err(AppError::new("invalid_filename"));
    }
    Ok(())
}

fn validate_media_extension(filename: &str) -> CommandResult<()> {
    let extension = media_extension(filename);

    if SUPPORTED_MEDIA_EXTENSIONS.contains(&extension.as_str()) {
        Ok(())
    } else {
        Err(AppError::with("unsupported_extension", extension))
    }
}

const SUPPORTED_MEDIA_EXTENSIONS: [&str; 11] = [
    "mp3", "wav", "m4a", "aac", "ogg", "opus", "flac", "mp4", "mov", "webm", "mkv",
];

fn media_extension(filename: &str) -> String {
    filename
        .rsplit('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase()
}

fn mime_type_from_filename(filename: &str) -> Option<&'static str> {
    match media_extension(filename).as_str() {
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

fn validate_upload_size(size_bytes: u64) -> CommandResult<()> {
    if size_bytes == 0 {
        return Err(AppError::new("file_empty"));
    }

    if size_bytes > MAX_UPLOAD_BYTES {
        return Err(AppError::with(
            "file_too_large",
            format!(
                "{} / {}",
                format_bytes(size_bytes),
                format_bytes(MAX_UPLOAD_BYTES)
            ),
        ));
    }

    Ok(())
}

fn format_bytes(bytes: u64) -> String {
    let megabytes = bytes as f64 / (1024.0 * 1024.0);
    if megabytes >= 1024.0 {
        format!("{:.1} GB", megabytes / 1024.0)
    } else {
        format!("{megabytes:.0} MB")
    }
}

fn validate_url(value: &str) -> CommandResult<()> {
    let parsed = Url::parse(value).map_err(|_| AppError::new("invalid_url"))?;
    if parsed.scheme() != "https" && parsed.scheme() != "http" {
        return Err(AppError::new("unsupported_scheme"));
    }
    Ok(())
}

fn is_direct_media_url(value: &str) -> bool {
    Url::parse(value)
        .ok()
        .and_then(|url| {
            url.path_segments()
                .and_then(|mut segments| segments.next_back().map(str::to_lowercase))
        })
        .map(|last| {
            SUPPORTED_MEDIA_EXTENSIONS
                .iter()
                .any(|extension| last.ends_with(&format!(".{extension}")))
        })
        .unwrap_or(false)
}

/// Locates the bundled yt-dlp binary.
///
/// Must go through Tauri's resource resolver: the bundler installs resources into a
/// `resources/` directory beside the executable, so probing next to the exe misses them,
/// and `CARGO_MANIFEST_DIR` is a compile-time path that only exists on the build machine.
/// Getting this wrong fails only in the packaged app, never in `tauri dev`.
fn resolve_ytdlp_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    YTDLP_PATH
        .get_or_init(|| {
            if let Ok(resolved) = app
                .path()
                .resolve("resources/yt-dlp.exe", BaseDirectory::Resource)
            {
                if resolved.is_file() {
                    return Some(resolved);
                }
            }

            // Fallback for `cargo run` outside the bundler.
            let dev_candidate = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("resources")
                .join("yt-dlp.exe");

            dev_candidate.is_file().then_some(dev_candidate)
        })
        .clone()
}

struct ExtractedAudio {
    filename: String,
    bytes: Vec<u8>,
}

/// Pulls the audio track out of a page URL with yt-dlp.
///
/// Deliberately downloads an existing audio stream (`-f bestaudio`) instead of asking for
/// `--extract-audio --audio-format m4a`: the latter runs yt-dlp's FFmpeg post-processor,
/// and we do not ship ffmpeg, so on a clean machine every social link would fail. Gladia
/// accepts the container formats YouTube and friends already serve.
async fn extract_audio(app: &tauri::AppHandle, url: &str) -> CommandResult<ExtractedAudio> {
    let ytdlp = resolve_ytdlp_path(app).ok_or_else(|| AppError::new("ytdlp_missing"))?;
    let workdir = create_extraction_dir()?;
    let out_template = workdir.join("%(id)s.%(ext)s");

    let mut command = tokio::process::Command::new(&ytdlp);
    command
        .args([
            "-f",
            "bestaudio[ext=m4a]/bestaudio/best",
            "--no-playlist",
            "--no-warnings",
            "--no-progress",
            "--no-update",
            "--socket-timeout",
            "30",
            "--retries",
            "3",
            "--max-filesize",
            "500m",
            "--print",
            "after_move:filepath",
            "-o",
            &out_template.to_string_lossy(),
            url,
        ])
        .kill_on_drop(true);

    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    let result = tokio::time::timeout(EXTRACTION_TIMEOUT, command.output()).await;

    let output = match result {
        Ok(Ok(output)) => output,
        Ok(Err(error)) => {
            cleanup_extraction_dir(&workdir);
            return Err(AppError::with("ytdlp_failed", error.to_string()));
        }
        Err(_) => {
            cleanup_extraction_dir(&workdir);
            return Err(AppError::new("ytdlp_timeout"));
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        cleanup_extraction_dir(&workdir);
        return Err(AppError::with("ytdlp_failed", last_line(&stderr)));
    }

    let printed = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let extracted_path = printed
        .lines()
        .map(str::trim)
        .rfind(|line| !line.is_empty())
        .map(PathBuf::from);

    let Some(extracted_path) = extracted_path.filter(|path| path.is_file()) else {
        cleanup_extraction_dir(&workdir);
        // yt-dlp exits 0 when it skips a file for exceeding --max-filesize.
        return Err(AppError::new("ytdlp_no_audio"));
    };

    let filename = extracted_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("extracted.m4a")
        .to_string();

    let bytes = std::fs::read(&extracted_path)
        .map_err(|error| AppError::with("file_read_failed", error.to_string()));
    cleanup_extraction_dir(&workdir);
    let bytes = bytes?;

    validate_upload_size(bytes.len() as u64)?;

    Ok(ExtractedAudio { filename, bytes })
}

/// A private directory per extraction, so two links cannot collide in the shared temp dir
/// and a partial download never leaks into the next run.
fn create_extraction_dir() -> CommandResult<PathBuf> {
    let unique = format!(
        "quiet-transcript-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default()
    );
    let path = env::temp_dir().join(unique);

    std::fs::create_dir_all(&path)
        .map_err(|error| AppError::with("ytdlp_failed", error.to_string()))?;

    Ok(path)
}

fn cleanup_extraction_dir(path: &Path) {
    let _ = std::fs::remove_dir_all(path);
}

/// yt-dlp explains itself on the last line of stderr; the rest is noise.
fn last_line(value: &str) -> String {
    value
        .lines()
        .map(str::trim)
        .rfind(|line| !line.is_empty())
        .unwrap_or(value)
        .to_string()
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
    api_key: &str,
    filename: &str,
    mime_type: Option<&str>,
    bytes: Vec<u8>,
) -> CommandResult<String> {
    let part = Part::bytes(bytes)
        .file_name(filename.to_string())
        .mime_str(mime_type.unwrap_or("application/octet-stream"))
        .map_err(|error| AppError::with("gladia_failed", error.to_string()))?;
    let form = Form::new().part("audio", part);
    let response = http_client()
        .post(format!("{GLADIA_API_BASE}/v2/upload"))
        .header("x-gladia-key", api_key)
        .timeout(UPLOAD_TIMEOUT)
        .multipart(form)
        .send()
        .await
        .map_err(|error| AppError::with("network", error.to_string()))?;

    ensure_ok(response)
        .await?
        .json::<UploadResponse>()
        .await
        .map_err(|error| AppError::with("gladia_failed", error.to_string()))
        .map(|payload| payload.audio_url)
}

async fn transcribe_audio_url(
    app: &tauri::AppHandle,
    api_key: &str,
    audio_url: &str,
    source: TranscriptionSource,
    title: String,
) -> CommandResult<TranscriptPayload> {
    emit_progress(app, "sending");
    let job = create_job(api_key, audio_url).await?;

    emit_progress(app, "transcribing");
    let result = poll_job(api_key, &job).await?;

    emit_progress(app, "building");
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

    emit_progress(app, "done");

    Ok(TranscriptPayload {
        result: transcript,
        markdown,
    })
}

async fn create_job(api_key: &str, audio_url: &str) -> CommandResult<JobResponse> {
    let response = http_client()
        .post(format!("{GLADIA_API_BASE}/v2/pre-recorded"))
        .header("Content-Type", "application/json")
        .header("x-gladia-key", api_key)
        .timeout(REQUEST_TIMEOUT)
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
        .map_err(|error| AppError::with("network", error.to_string()))?;

    ensure_ok(response)
        .await?
        .json::<JobResponse>()
        .await
        .map_err(|error| AppError::with("gladia_failed", error.to_string()))
}

async fn poll_job(api_key: &str, job: &JobResponse) -> CommandResult<GladiaPollResponse> {
    let result_url = job
        .result_url
        .clone()
        .unwrap_or_else(|| format!("{GLADIA_API_BASE}/v2/pre-recorded/{}", job.id));
    let started = Instant::now();
    let mut consecutive_failures = 0usize;

    while started.elapsed() < MAX_POLL_DURATION {
        match poll_once(api_key, &result_url).await {
            Ok(payload) => {
                consecutive_failures = 0;

                match payload.status.as_deref() {
                    Some("done") => return Ok(payload),
                    Some("error") => {
                        let detail = payload
                            .error_code
                            .as_ref()
                            .map(|value| value.to_string())
                            .unwrap_or_default();
                        return Err(AppError::with("gladia_failed", detail));
                    }
                    _ => {}
                }
            }
            // The job keeps running on Gladia's side, so a dropped connection is worth
            // retrying rather than losing the whole transcription.
            Err(error) if error.is_transient() => {
                consecutive_failures += 1;

                if consecutive_failures >= MAX_CONSECUTIVE_POLL_FAILURES {
                    return Err(error);
                }
            }
            Err(error) => return Err(error),
        }

        sleep(POLL_INTERVAL).await;
    }

    Err(AppError::new("gladia_timeout"))
}

async fn poll_once(api_key: &str, result_url: &str) -> CommandResult<GladiaPollResponse> {
    let response = http_client()
        .get(result_url)
        .header("x-gladia-key", api_key)
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .map_err(|error| AppError::with("network", error.to_string()))?;

    ensure_ok(response)
        .await?
        .json::<GladiaPollResponse>()
        .await
        .map_err(|error| AppError::with("network", error.to_string()))
}

async fn ensure_ok(response: reqwest::Response) -> CommandResult<reqwest::Response> {
    if response.status().is_success() {
        return Ok(response);
    }

    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    let detail = format!("{status}: {body}");

    Err(match status.as_u16() {
        401 | 403 => AppError::with("gladia_auth", detail),
        402 => AppError::with("gladia_quota", detail),
        408 | 425 | 429 => AppError::with("gladia_transient", detail),
        status if (500..600).contains(&status) => AppError::with("gladia_transient", detail),
        _ => AppError::with("gladia_failed", detail),
    })
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
            transcribe_file_path,
            transcribe_url,
            verify_gladia_key,
            env_health_check,
            pending_auth_deep_links
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_result() -> TranscriptionResult {
        TranscriptionResult {
            id: Some("job-1".to_string()),
            title: "Interview".to_string(),
            source: TranscriptionSource::File {
                filename: "interview.mp3".to_string(),
                mime_type: Some("audio/mpeg".to_string()),
                size_bytes: 1024,
            },
            language: Some("en".to_string()),
            duration_seconds: Some(84.0),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            text: "Hello there.".to_string(),
            segments: Some(vec![TranscriptSegment {
                start_seconds: Some(1.2),
                end_seconds: Some(3.4),
                speaker: Some("Speaker 0".to_string()),
                text: "Hello there.".to_string(),
            }]),
            provider: "gladia".to_string(),
        }
    }

    #[test]
    fn rejects_filenames_with_path_separators() {
        assert!(validate_filename("clip.mp3").is_ok());
        assert!(validate_filename("../secrets.mp3").is_err());
        assert!(validate_filename("dir\\clip.mp3").is_err());
        assert!(validate_filename("   ").is_err());
    }

    #[test]
    fn accepts_every_supported_extension() {
        for extension in SUPPORTED_MEDIA_EXTENSIONS {
            assert!(
                validate_media_extension(&format!("clip.{extension}")).is_ok(),
                "{extension} should be accepted"
            );
        }

        assert!(validate_media_extension("notes.txt").is_err());
        assert!(validate_media_extension("clip.MP3").is_ok());
    }

    #[test]
    fn upload_size_rejects_empty_and_oversized_files() {
        assert!(validate_upload_size(1).is_ok());
        assert_eq!(validate_upload_size(0).unwrap_err().code, "file_empty");

        let error = validate_upload_size(MAX_UPLOAD_BYTES + 1).unwrap_err();
        assert_eq!(error.code, "file_too_large");
        assert!(error.detail.is_some_and(|detail| detail.contains("500 MB")));
    }

    #[test]
    fn only_http_urls_are_accepted() {
        assert!(validate_url("https://example.com/a.mp3").is_ok());
        assert_eq!(
            validate_url("file:///etc/passwd").unwrap_err().code,
            "unsupported_scheme"
        );
        assert_eq!(validate_url("not a url").unwrap_err().code, "invalid_url");
    }

    #[test]
    fn direct_media_detection_ignores_query_strings() {
        assert!(is_direct_media_url("https://example.com/audio.mp3"));
        assert!(is_direct_media_url("https://example.com/a/b/CLIP.M4A"));
        assert!(!is_direct_media_url("https://youtube.com/watch?v=x.mp3"));
        assert!(!is_direct_media_url("https://example.com/page"));
    }

    #[test]
    fn mime_types_cover_supported_extensions() {
        for extension in SUPPORTED_MEDIA_EXTENSIONS {
            assert!(
                mime_type_from_filename(&format!("clip.{extension}")).is_some(),
                "{extension} should map to a mime type"
            );
        }
    }

    #[test]
    fn sanitizes_titles_for_filesystem_use() {
        assert_eq!(sanitize_filename("a/b:c*d"), "a-b-c-d");
        assert_eq!(sanitize_filename("   "), "transcript");
        assert_eq!(sanitize_filename(&"x".repeat(200)).chars().count(), 120);
    }

    #[test]
    fn derives_title_from_url() {
        assert_eq!(title_from_url("https://example.com/talk.mp3"), "talk.mp3");
        assert_eq!(title_from_url("https://example.com/"), "example.com");
    }

    #[test]
    fn formats_duration_and_timestamps() {
        assert_eq!(format_duration(84.0), "1m 24s");
        assert_eq!(format_duration(3725.0), "1h 2m 5s");
        assert_eq!(format_timestamp(75.9), "[01:15]");
        assert_eq!(format_timestamp(-5.0), "[00:00]");
    }

    /// The Markdown shape is mirrored in packages/core/src/markdown.ts; a drift here is a
    /// drift between the desktop app and the bot.
    #[test]
    fn markdown_matches_the_shared_format() {
        let markdown = build_markdown(&sample_result());

        assert!(markdown.starts_with("# Interview\n"));
        assert!(markdown.contains("| Source | interview.mp3 |"));
        assert!(markdown.contains("| Duration | 1m 24s |"));
        assert!(markdown.contains("## Transcript\n\nHello there."));
        assert!(markdown.contains("- [00:01] **Speaker 0:** Hello there."));
    }

    #[test]
    fn markdown_marks_an_empty_transcript() {
        let mut result = sample_result();
        result.text = "   ".to_string();
        result.segments = None;

        let markdown = build_markdown(&result);

        assert!(markdown.contains("_No transcript text returned._"));
        assert!(!markdown.contains("## Timestamps"));
    }

    #[test]
    fn recognises_only_the_auth_deep_link() {
        assert!(is_auth_deep_link("quiet-transcript://auth?code=1"));
        assert!(!is_auth_deep_link("quiet-transcript://other"));
        assert!(!is_auth_deep_link("https://example.com/auth"));
    }

    #[test]
    fn transient_errors_are_worth_retrying() {
        assert!(AppError::new("network").is_transient());
        assert!(AppError::new("gladia_transient").is_transient());
        assert!(!AppError::new("gladia_auth").is_transient());
    }

    #[test]
    fn error_detail_is_truncated() {
        let error = AppError::with("gladia_failed", "x".repeat(500));
        let detail = error.detail.expect("detail");

        assert_eq!(detail.chars().count(), 301);
        assert!(detail.ends_with('…'));
    }

    #[test]
    fn empty_detail_is_dropped() {
        assert!(AppError::with("network", "   ").detail.is_none());
    }

    #[test]
    fn keeps_the_last_meaningful_stderr_line() {
        assert_eq!(last_line("warning\nERROR: nope\n\n"), "ERROR: nope");
        assert_eq!(last_line(""), "");
    }
}

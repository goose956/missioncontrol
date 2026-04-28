export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface Workflow {
  id: string;
  name: string;
  description: string;
  icon: string;
  output_folder: string;
  auto_save?: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  size: number;
  modified: number;
  readable: boolean;
}

export interface FolderGroup {
  folder: string;
  files: FileEntry[];
}

export async function getWorkflows(): Promise<Workflow[]> {
  const res = await fetch(`${API}/api/workflows`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load workflows");
  return res.json();
}

export async function saveWorkflowOutput(workflowId: string, content: string, filename?: string): Promise<{ saved_path: string }> {
  const res = await fetch(`${API}/api/chat/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflow_id: workflowId, content, filename: filename ?? "" }),
  });
  if (!res.ok) throw new Error("Failed to save");
  return res.json();
}

export async function deleteSavedOutput(path: string): Promise<void> {
  const res = await fetch(`${API}/api/chat/saved?path=${encodeURIComponent(path)}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete");
}

export async function deleteFile(path: string): Promise<void> {
  const res = await fetch(`${API}/api/files/delete?path=${encodeURIComponent(path)}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete file");
}

export async function getFiles(): Promise<FolderGroup[]> {
  const res = await fetch(`${API}/api/files`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load files");
  return res.json();
}

export async function readFile(path: string): Promise<string> {
  const res = await fetch(`${API}/api/files/read?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error("Failed to read file");
  return res.text();
}

export async function writeFile(path: string, content: string): Promise<void> {
  const res = await fetch(`${API}/api/files/write`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content }),
  });
  if (!res.ok) throw new Error("Failed to write file");
}

export async function uploadWorkspaceFile(folder: string, file: File): Promise<{ ok: boolean; name: string; path: string; size: number }> {
  const form = new FormData();
  form.append("folder", folder);
  form.append("file", file);

  const res = await fetch(`${API}/api/files/upload`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    try {
      const body = await res.json();
      throw new Error(body?.detail || body?.error || "Failed to upload file");
    } catch {
      throw new Error("Failed to upload file");
    }
  }

  return res.json();
}

export interface Idea {
  id: string;
  rank: number;
  title: string;
  category: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export async function getIdeas(): Promise<Idea[]> {
  const res = await fetch(`${API}/api/ideas`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load ideas");
  return res.json();
}

export async function createIdea(data: Pick<Idea, "title" | "category" | "description" | "status">): Promise<Idea> {
  const res = await fetch(`${API}/api/ideas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create idea");
  return res.json();
}

export async function updateIdea(id: string, data: Partial<Idea>): Promise<Idea> {
  const res = await fetch(`${API}/api/ideas/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update idea");
  return res.json();
}

export async function deleteIdea(id: string): Promise<void> {
  await fetch(`${API}/api/ideas/${id}`, { method: "DELETE" });
}

export async function reorderIdeas(ids: string[]): Promise<void> {
  await fetch(`${API}/api/ideas/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ids),
  });
}

export interface ProjectFile {
  name: string;
  path: string;
  size: number;
  uploaded_at: string;
  note?: string;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  status: string;
  idea_id?: string | null;
  spec_path?: string | null;
  files: ProjectFile[];
  created_at: string;
  updated_at: string;
}

export async function getProjects(): Promise<Project[]> {
  const res = await fetch(`${API}/api/projects`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load projects");
  return res.json();
}

export async function createProject(data: {
  title: string;
  description: string;
  status: string;
  idea_id?: string | null;
  spec_path?: string | null;
}): Promise<Project> {
  const res = await fetch(`${API}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create project");
  return res.json();
}

export async function updateProject(id: string, data: Partial<Project>): Promise<Project> {
  const res = await fetch(`${API}/api/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update project");
  return res.json();
}

export async function deleteProject(id: string): Promise<void> {
  await fetch(`${API}/api/projects/${id}`, { method: "DELETE" });
}

export async function uploadProjectFile(projectId: string, file: File, note?: string): Promise<ProjectFile> {
  const form = new FormData();
  form.append("file", file);
  if (note) form.append("note", note);
  const res = await fetch(`${API}/api/projects/${projectId}/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("Failed to upload file");
  return res.json();
}

export interface ApiKeysSettings {
  anthropic: string;
  openai: string;
  openrouter: string;
}

export interface WorkflowModelSetting {
  provider: string;
  model: string;
}

export interface SettingsWorkflowOption {
  id: string;
  name: string;
  default_provider: string;
  default_model: string;
}

export interface OllamaStatus {
  running: boolean;
  models: string[];
}

export interface LlmSettings {
  api_keys: ApiKeysSettings;
  workflow_settings: Record<string, WorkflowModelSetting>;
  model_options: Record<string, string[]>;
  providers: Record<string, string>;
  workflows: SettingsWorkflowOption[];
  ollama: OllamaStatus;
}

export async function getSettings(): Promise<LlmSettings> {
  const res = await fetch(`${API}/api/settings`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load settings");
  return res.json();
}

export async function updateSettings(settings: Pick<LlmSettings, "api_keys" | "workflow_settings">): Promise<LlmSettings> {
  const res = await fetch(`${API}/api/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error("Failed to save settings");
  return res.json();
}

export interface LandingPageSignup {
  email: string;
  name?: string | null;
  created_at: string;
}

export interface LandingPage {
  id: string;
  step_id: string;
  html_content: string | null;
  prompt_history: Array<{ role: string; type: string; content: string; timestamp: string }>;
  slug: string | null;
  collect_emails: boolean;
  stripe_payment_link?: string | null;
  stripe_button_text?: string | null;
  views: Array<{ viewed_at: string }>;
  signups: LandingPageSignup[];
  created_at: string;
  updated_at: string;
}

export interface LandingStep {
  id: string;
  funnel_id: string;
  type: "LANDING" | "UPSELL" | "THANKS";
  order: number;
  name: string;
  enabled: boolean;
  page: LandingPage;
}

export interface LandingFunnel {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  steps: LandingStep[];
}

async function landingApiError(res: Response, fallback: string): Promise<Error> {
  try {
    const body = await res.json();
    const detail = body?.detail || body?.error;
    if (typeof detail === "string" && detail.trim()) return new Error(detail);
  } catch {
    // Ignore parsing errors and return fallback.
  }
  return new Error(fallback);
}

export async function getLandingFunnels(): Promise<LandingFunnel[]> {
  const res = await fetch(`${API}/api/landing-pages/funnels`, { cache: "no-store" });
  if (!res.ok) throw await landingApiError(res, "Failed to load landing funnels");
  return res.json();
}

export async function getLandingFunnel(id: string): Promise<LandingFunnel> {
  const res = await fetch(`${API}/api/landing-pages/funnels/${id}`, { cache: "no-store" });
  if (!res.ok) throw await landingApiError(res, "Failed to load landing funnel");
  return res.json();
}

export async function getLandingPage(stepId: string): Promise<LandingPage> {
  const res = await fetch(`${API}/api/landing-pages/pages/${stepId}`, { cache: "no-store" });
  if (!res.ok) throw await landingApiError(res, "Failed to load landing page");
  return res.json();
}

export async function createLandingFunnel(data: { name: string; description: string }): Promise<LandingFunnel> {
  const res = await fetch(`${API}/api/landing-pages/funnels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await landingApiError(res, "Failed to create landing funnel");
  return res.json();
}

export async function updateLandingFunnel(id: string, data: { name: string; description: string }): Promise<LandingFunnel> {
  const res = await fetch(`${API}/api/landing-pages/funnels/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await landingApiError(res, "Failed to update landing funnel");
  return res.json();
}

export async function deleteLandingFunnel(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API}/api/landing-pages/funnels/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw await landingApiError(res, "Failed to delete landing funnel");
  return res.json();
}

export async function updateLandingStep(funnelId: string, stepId: string, enabled: boolean): Promise<LandingStep> {
  const res = await fetch(`${API}/api/landing-pages/funnels/${funnelId}/steps/${stepId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw await landingApiError(res, "Failed to update landing step");
  return res.json();
}

export async function generateLandingPage(data: { step_id: string; prompt: string; collect_emails?: boolean }): Promise<LandingPage> {
  const res = await fetch(`${API}/api/landing-pages/pages/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await landingApiError(res, "Failed to generate landing page");
  return res.json();
}

export async function editLandingPage(data: { step_id: string; edit_prompt: string }): Promise<LandingPage> {
  const res = await fetch(`${API}/api/landing-pages/pages/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await landingApiError(res, "Failed to edit landing page");
  return res.json();
}

export async function updateLandingPageSettings(stepId: string, data: {
  slug?: string;
  collect_emails?: boolean;
  stripe_payment_link?: string | null;
  stripe_button_text?: string | null;
}): Promise<LandingPage> {
  const res = await fetch(`${API}/api/landing-pages/pages/${stepId}/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await landingApiError(res, "Failed to update landing page settings");
  return res.json();
}

export async function getLandingAnalytics(pageId: string): Promise<{ view_count: number; signups: LandingPageSignup[] }> {
  const res = await fetch(`${API}/api/landing-pages/analytics/${pageId}`, { cache: "no-store" });
  if (!res.ok) throw await landingApiError(res, "Failed to load landing analytics");
  return res.json();
}

export interface LandingContact {
  id: string;
  page_id: string;
  page_slug: string | null;
  funnel_id: string | null;
  funnel_name: string | null;
  name: string;
  email: string;
  phone?: string | null;
  message?: string | null;
  read: boolean;
  created_at: string;
}

export async function getLandingContacts(funnelId?: string): Promise<LandingContact[]> {
  const url = funnelId
    ? `${API}/api/landing-pages/contacts?funnel_id=${encodeURIComponent(funnelId)}`
    : `${API}/api/landing-pages/contacts`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw await landingApiError(res, "Failed to load contacts");
  return res.json();
}

export async function markContactRead(contactId: string, read = true): Promise<LandingContact> {
  const res = await fetch(`${API}/api/landing-pages/contacts/${contactId}/read?read=${read}`, {
    method: "PATCH",
  });
  if (!res.ok) throw await landingApiError(res, "Failed to update contact");
  return res.json();
}

export async function deleteContact(contactId: string): Promise<void> {
  const res = await fetch(`${API}/api/landing-pages/contacts/${contactId}`, { method: "DELETE" });
  if (!res.ok) throw await landingApiError(res, "Failed to delete contact");
}

export async function pushToGitHub(): Promise<{ ok: boolean; message: string; slug: string }> {
  const res = await fetch(`${API}/api/landing-pages/push-to-github`, { method: "POST" });
  if (!res.ok) throw await landingApiError(res, "Push to GitHub failed");
  return res.json();
}

export interface MediaConfig {
  screenpipe_data_dir: string;
  screenpipe_api_url: string;
  external_media_dirs: string[];
  auto_index_on_start: boolean;
  updated_at?: string | null;
}

export interface MediaFileEntry {
  name: string;
  path: string;
  size_bytes: number;
  modified: string;
  duration_seconds?: number | null;
  width?: number | null;
  height?: number | null;
  codec?: string | null;
}

export interface MediaIndex {
  updated_at: string | null;
  media_files: MediaFileEntry[];
  stats: {
    count: number;
    total_size_bytes: number;
    indexed_dirs: string[];
    pymediainfo_enabled?: boolean;
  };
}

export interface MediaStatus {
  configured: boolean;
  config_updated_at: string | null;
  index_updated_at: string | null;
  stats: {
    count?: number;
    total_size_bytes?: number;
    indexed_dirs?: string[];
    pymediainfo_enabled?: boolean;
  };
}

export interface MediaHighlight {
  path: string;
  name: string;
  duration_seconds?: number | null;
  modified: string;
  reason: string;
}

export interface MediaHighlights {
  updated_at: string | null;
  items: MediaHighlight[];
}

export interface ScreenpipeTestResult {
  api_url: string;
  api_ok: boolean;
  api_error?: string | null;
  data_dir: string;
  data_dir_exists: boolean;
}

export interface MediaEvent {
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface MediaTimeline {
  updated_at: string;
  items: MediaEvent[];
}

export interface MediaThumbnailItem {
  source_path: string;
  thumbnail_path: string | null;
  ok: boolean;
  cached?: boolean;
  error?: string;
}

export interface MediaThumbnails {
  updated_at: string | null;
  ffmpeg_available: boolean;
  items: MediaThumbnailItem[];
}

async function mediaApiError(res: Response, fallback: string): Promise<Error> {
  try {
    const body = await res.json();
    const detail = body?.detail || body?.error;
    if (typeof detail === "string" && detail.trim()) return new Error(detail);
  } catch {
    // Ignore parsing errors and return fallback.
  }
  return new Error(fallback);
}

export async function getMediaConfig(): Promise<MediaConfig> {
  const res = await fetch(`${API}/api/media/config`, { cache: "no-store" });
  if (!res.ok) throw await mediaApiError(res, "Failed to load media config");
  return res.json();
}

export async function updateMediaConfig(config: Omit<MediaConfig, "updated_at">): Promise<MediaConfig> {
  const res = await fetch(`${API}/api/media/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw await mediaApiError(res, "Failed to save media config");
  return res.json();
}

export async function getMediaStatus(): Promise<MediaStatus> {
  const res = await fetch(`${API}/api/media/status`, { cache: "no-store" });
  if (!res.ok) throw await mediaApiError(res, "Failed to load media status");
  return res.json();
}

export async function getMediaIndex(): Promise<MediaIndex> {
  const res = await fetch(`${API}/api/media/index`, { cache: "no-store" });
  if (!res.ok) throw await mediaApiError(res, "Failed to load media index");
  return res.json();
}

export async function refreshMediaIndex(maxFiles = 2000): Promise<MediaIndex> {
  const res = await fetch(`${API}/api/media/index/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ max_files: maxFiles }),
  });
  if (!res.ok) throw await mediaApiError(res, "Failed to refresh media index");
  return res.json();
}

export async function testScreenpipeConnection(): Promise<ScreenpipeTestResult> {
  const res = await fetch(`${API}/api/media/screenpipe/test`, {
    method: "POST",
  });
  if (!res.ok) throw await mediaApiError(res, "Failed to test Screenpipe connection");
  return res.json();
}

export async function getMediaHighlights(): Promise<MediaHighlights> {
  const res = await fetch(`${API}/api/media/highlights`, { cache: "no-store" });
  if (!res.ok) throw await mediaApiError(res, "Failed to load highlights");
  return res.json();
}

export async function extractMediaHighlights(topN = 20, minDurationSeconds = 20, workflowId?: string): Promise<MediaHighlights> {
  const res = await fetch(`${API}/api/media/highlights/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ top_n: topN, min_duration_seconds: minDurationSeconds, workflow_id: workflowId || null }),
  });
  if (!res.ok) throw await mediaApiError(res, "Failed to extract highlights");
  return res.json();
}

export async function openMediaPath(path: string, target: "file" | "folder" = "file"): Promise<{ ok: boolean; opened: string }> {
  const res = await fetch(`${API}/api/media/open-path`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, target }),
  });
  if (!res.ok) throw await mediaApiError(res, "Failed to open media path");
  return res.json();
}

export async function getMediaTimeline(limit = 200, filters?: { eventType?: string; workflowId?: string }): Promise<MediaTimeline> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (filters?.eventType) params.set("event_type", filters.eventType);
  if (filters?.workflowId) params.set("workflow_id", filters.workflowId);
  const res = await fetch(`${API}/api/media/timeline?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) throw await mediaApiError(res, "Failed to load media timeline");
  return res.json();
}

export async function getMediaThumbnails(): Promise<MediaThumbnails> {
  const res = await fetch(`${API}/api/media/thumbnails`, { cache: "no-store" });
  if (!res.ok) throw await mediaApiError(res, "Failed to load media thumbnails");
  return res.json();
}

export async function generateMediaThumbnails(maxItems = 40): Promise<MediaThumbnails> {
  const res = await fetch(`${API}/api/media/thumbnails/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ max_items: maxItems }),
  });
  if (!res.ok) throw await mediaApiError(res, "Failed to generate media thumbnails");
  return res.json();
}

export async function openArtifactPath(path: string, target: "file" | "folder" = "file"): Promise<{ ok: boolean; opened: string }> {
  const res = await fetch(`${API}/api/media/open-artifact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, target }),
  });
  if (!res.ok) throw await mediaApiError(res, "Failed to open artifact path");
  return res.json();
}

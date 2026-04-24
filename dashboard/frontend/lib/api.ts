export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface Workflow {
  id: string;
  name: string;
  description: string;
  icon: string;
  output_folder: string;
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

export interface LlmSettings {
  api_keys: ApiKeysSettings;
  workflow_settings: Record<string, WorkflowModelSetting>;
  model_options: Record<string, string[]>;
  providers: Record<string, string>;
  workflows: SettingsWorkflowOption[];
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

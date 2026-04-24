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

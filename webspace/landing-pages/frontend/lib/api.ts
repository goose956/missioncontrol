// In production on Railway, the frontend and backend are separate services.
// NEXT_PUBLIC_API_URL should be set to the Railway backend URL (e.g. https://lp-backend.up.railway.app).
// Locally, it defaults to http://localhost:8000.
export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

async function apiError(res: Response, fallback: string): Promise<Error> {
  try {
    const body = await res.json();
    const detail = body?.detail || body?.error;
    if (typeof detail === "string" && detail.trim()) return new Error(detail);
  } catch { /* ignore */ }
  return new Error(fallback);
}

export async function getFunnels(): Promise<LandingFunnel[]> {
  const res = await fetch(`${API}/funnels`, { cache: "no-store" });
  if (!res.ok) throw await apiError(res, "Failed to load funnels");
  return res.json();
}

export async function getFunnel(id: string): Promise<LandingFunnel> {
  const res = await fetch(`${API}/funnels/${id}`, { cache: "no-store" });
  if (!res.ok) throw await apiError(res, "Failed to load funnel");
  return res.json();
}

export async function createFunnel(data: { name: string; description: string }): Promise<LandingFunnel> {
  const res = await fetch(`${API}/funnels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await apiError(res, "Failed to create funnel");
  return res.json();
}

export async function updateFunnel(id: string, data: { name: string; description: string }): Promise<LandingFunnel> {
  const res = await fetch(`${API}/funnels/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await apiError(res, "Failed to update funnel");
  return res.json();
}

export async function deleteFunnel(id: string): Promise<void> {
  const res = await fetch(`${API}/funnels/${id}`, { method: "DELETE" });
  if (!res.ok) throw await apiError(res, "Failed to delete funnel");
}

export async function getPage(stepId: string): Promise<LandingPage> {
  const res = await fetch(`${API}/pages/${stepId}`, { cache: "no-store" });
  if (!res.ok) throw await apiError(res, "Failed to load page");
  return res.json();
}

export async function generatePage(data: { step_id: string; prompt: string; collect_emails?: boolean }): Promise<LandingPage> {
  const res = await fetch(`${API}/pages/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await apiError(res, "Failed to generate page");
  return res.json();
}

export async function editPage(data: { step_id: string; edit_prompt: string }): Promise<LandingPage> {
  const res = await fetch(`${API}/pages/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await apiError(res, "Failed to edit page");
  return res.json();
}

export async function updatePageSettings(stepId: string, data: {
  slug?: string;
  collect_emails?: boolean;
  stripe_payment_link?: string | null;
  stripe_button_text?: string | null;
}): Promise<LandingPage> {
  const res = await fetch(`${API}/pages/${stepId}/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await apiError(res, "Failed to update page settings");
  return res.json();
}

export async function getContacts(funnelId?: string): Promise<LandingContact[]> {
  const url = funnelId
    ? `${API}/contacts?funnel_id=${encodeURIComponent(funnelId)}`
    : `${API}/contacts`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw await apiError(res, "Failed to load contacts");
  return res.json();
}

export async function markContactRead(id: string, read = true): Promise<LandingContact> {
  const res = await fetch(`${API}/contacts/${id}/read?read=${read}`, { method: "PATCH" });
  if (!res.ok) throw await apiError(res, "Failed to update contact");
  return res.json();
}

export async function deleteContact(id: string): Promise<void> {
  const res = await fetch(`${API}/contacts/${id}`, { method: "DELETE" });
  if (!res.ok) throw await apiError(res, "Failed to delete contact");
}

"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, RefreshCw, Send, Wand2 } from "lucide-react";
import { API, LandingFunnel, LandingPage, LandingStep, editPage, generatePage, getFunnel, updatePageSettings } from "@/lib/api";

const STEP_LABELS: Record<string, string> = { LANDING: "Landing Page", UPSELL: "Upsell Page", THANKS: "Thank You Page" };

export default function StepEditorPage() {
  const { id: funnelId, stepId } = useParams<{ id: string; stepId: string }>();
  const router = useRouter();

  const [funnel, setFunnel] = useState<LandingFunnel | null>(null);
  const [step, setStep] = useState<LandingStep | null>(null);
  const [page, setPage] = useState<LandingPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editor state
  const [prompt, setPrompt] = useState("");
  const [working, setWorking] = useState(false);
  const [workLabel, setWorkLabel] = useState("");

  // Share panel
  const [slug, setSlug] = useState("");
  const [savingSlug, setSavingSlug] = useState(false);
  const [slugMsg, setSlugMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [collectEmails, setCollectEmails] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load funnel
  useEffect(() => {
    setLoading(true);
    getFunnel(funnelId)
      .then((f) => {
        setFunnel(f);
        const steps = [...f.steps].sort((a, b) => a.order - b.order);
        const s = steps.find((s) => s.id === stepId) ?? null;
        setStep(s);
        if (s?.page) {
          setPage(s.page);
          setSlug(s.page.slug ?? "");
          setCollectEmails(s.page.collect_emails ?? false);
        }
        if (!s) setError("Step not found");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [funnelId, stepId]);

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white/40">Loading editor…</div>;

  if (error || !funnel || !step) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-red-300">{error || "Step not found"}</p>
        <p className="text-white/40 text-sm text-center max-w-sm">
          Make sure the backend is running at <code className="text-indigo-300">{API}</code>
        </p>
        <Link href={`/admin/${funnelId}`} className="text-white/50 hover:text-white text-sm underline">← Back to funnel</Link>
      </div>
    );
  }

  const steps = [...funnel.steps].sort((a, b) => a.order - b.order);
  const currentIdx = steps.findIndex((s) => s.id === stepId);
  const prevStep = currentIdx > 0 ? steps[currentIdx - 1] : null;
  const nextStep = currentIdx < steps.length - 1 ? steps[currentIdx + 1] : null;

  const history = page?.prompt_history ?? [];
  const hasPage = Boolean(page?.html_content);
  const previewUrl = `${API}/pages/${stepId}/preview`;

  async function handleGenerate() {
    if (!prompt.trim() || working) return;
    setWorking(true);
    setWorkLabel(hasPage ? "Regenerating…" : "Generating…");
    try {
      const updated = await generatePage({ step_id: stepId, prompt: prompt.trim(), collect_emails: collectEmails });
      setPage(updated);
      setSlug(updated.slug ?? "");
      setPrompt("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setWorking(false);
      setWorkLabel("");
    }
  }

  async function handleEdit() {
    if (!prompt.trim() || working || !hasPage) return;
    setWorking(true);
    setWorkLabel("Editing…");
    try {
      const updated = await editPage({ step_id: stepId, edit_prompt: prompt.trim() });
      setPage(updated);
      setPrompt("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Edit failed");
    } finally {
      setWorking(false);
      setWorkLabel("");
    }
  }

  async function handleSaveSlug() {
    setSavingSlug(true);
    setSlugMsg(null);
    try {
      const updated = await updatePageSettings(stepId, { slug: slug.trim(), collect_emails: collectEmails });
      setPage(updated);
      setSlug(updated.slug ?? "");
      setSlugMsg({ ok: true, text: "Saved!" });
    } catch (e) {
      setSlugMsg({ ok: false, text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSavingSlug(false);
      setTimeout(() => setSlugMsg(null), 3000);
    }
  }

  const liveUrl = page?.slug ? `${API}/p/${page.slug}` : null;

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-slate-900/80 backdrop-blur shrink-0">
        <Link href={`/admin/${funnelId}`} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-white/40 text-xs truncate">{funnel.name}</p>
          <h1 className="text-sm font-bold truncate">{STEP_LABELS[step.type]}</h1>
        </div>
        {/* Step navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => prevStep && router.push(`/admin/${funnelId}/steps/${prevStep.id}`)}
            disabled={!prevStep}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-white/30 text-xs px-1">{currentIdx + 1} / {steps.length}</span>
          <button
            onClick={() => nextStep && router.push(`/admin/${funnelId}/steps/${nextStep.id}`)}
            disabled={!nextStep}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        {liveUrl && (
          <a href={liveUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-xs font-semibold rounded-lg hover:bg-emerald-500/25 transition-colors">
            <ExternalLink size={12} /> Live
          </a>
        )}
      </div>

      {/* Main split layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Chat / Controls */}
        <div className="w-80 xl:w-96 shrink-0 flex flex-col border-r border-white/10 overflow-hidden">
          {/* Chat history */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {history.length === 0 && !hasPage && (
              <div className="text-white/30 text-sm text-center mt-8">
                <Wand2 size={28} className="mx-auto mb-3 text-white/20" />
                <p className="font-medium text-white/50 mb-1">Describe your page</p>
                <p className="text-xs leading-relaxed">Tell AI about your business, product, and target audience. Be specific for best results.</p>
              </div>
            )}
            {history.map((h, i) => (
              <div key={i} className={`rounded-xl px-3 py-2.5 text-sm ${h.type === "generate" ? "bg-indigo-500/15 border border-indigo-400/20 text-indigo-200" : "bg-white/5 border border-white/10 text-white/70"}`}>
                <p className="text-xs font-semibold mb-1 opacity-60">{h.type === "generate" ? "Generated" : "Edited"} · {new Date(h.timestamp).toLocaleTimeString()}</p>
                <p className="leading-relaxed">{h.content}</p>
              </div>
            ))}
            {working && (
              <div className="flex items-center gap-2 text-indigo-300 text-sm px-2 py-1">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                {workLabel}
              </div>
            )}
          </div>

          {/* Prompt input */}
          <div className="p-4 border-t border-white/10 space-y-3">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { hasPage ? handleEdit() : handleGenerate(); } }}
              placeholder={hasPage ? "Describe what to change…" : "Describe your business and page…"}
              rows={4}
              disabled={working}
              className="w-full bg-slate-800 border border-white/15 focus:border-indigo-400/60 rounded-xl px-3 py-2.5 text-white text-sm outline-none resize-none placeholder:text-white/25 disabled:opacity-50"
            />
            <div className="flex gap-2">
              {hasPage ? (
                <>
                  <button
                    onClick={handleEdit}
                    disabled={!prompt.trim() || working}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors"
                  >
                    <Send size={13} /> Edit
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={!prompt.trim() || working}
                    title="Regenerate full page"
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 disabled:opacity-40 border border-white/15 text-white/70 rounded-xl text-sm transition-colors"
                  >
                    <RefreshCw size={13} />
                  </button>
                </>
              ) : (
                <button
                  onClick={handleGenerate}
                  disabled={!prompt.trim() || working}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  <Wand2 size={13} /> Generate Page
                </button>
              )}
            </div>
          </div>

          {/* Share settings */}
          {hasPage && (
            <div className="border-t border-white/10 p-4 space-y-3">
              <p className="text-white/40 text-xs font-semibold uppercase tracking-wider">Share</p>
              <div className="flex gap-2">
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="page-slug"
                  className="flex-1 bg-slate-800 border border-white/15 focus:border-indigo-400/60 rounded-xl px-3 py-2 text-white text-xs outline-none min-w-0"
                />
                <button
                  onClick={handleSaveSlug}
                  disabled={savingSlug}
                  className="px-3 py-2 bg-white/10 hover:bg-white/15 text-white text-xs rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  {savingSlug ? "…" : "Save"}
                </button>
              </div>
              {slugMsg && <p className={`text-xs ${slugMsg.ok ? "text-emerald-400" : "text-red-400"}`}>{slugMsg.text}</p>}
              {liveUrl && (
                <a href={liveUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                  <ExternalLink size={11} />
                  <span className="truncate">{liveUrl}</span>
                </a>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={collectEmails}
                  onChange={(e) => setCollectEmails(e.target.checked)}
                  className="rounded border-white/20"
                />
                <span className="text-white/60 text-xs">Collect email signups</span>
              </label>
            </div>
          )}
        </div>

        {/* Right: Preview */}
        <div className="flex-1 bg-slate-900 overflow-hidden flex flex-col">
          {hasPage ? (
            <iframe
              key={page?.updated_at}
              src={previewUrl}
              className="flex-1 w-full border-0"
              title="Page preview"
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-white/20">
              <Wand2 size={48} />
              <p className="text-sm">Preview will appear here after generation</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

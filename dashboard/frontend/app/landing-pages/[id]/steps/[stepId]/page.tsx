"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BarChart2,
  Check,
  Copy,
  CreditCard,
  Mail,
  Maximize2,
  Monitor,
  RefreshCw,
  Send,
  Share2,
  Smartphone,
  Sparkles,
  Clock,
} from "lucide-react";
import {
  getLandingFunnel,
  generateLandingPage,
  editLandingPage,
  updateLandingPageSettings,
  LandingFunnel,
  LandingStep,
  LandingPage,
} from "@/lib/api";

const STEP_CONFIG: Record<string, { label: string; color: string; placeholder: string }> = {
  LANDING: {
    label: "Landing Page",
    color: "text-blue-400",
    placeholder:
      'Describe the landing page you want...\n\nExample: "Create a landing page for a graphic design agency called Pixel Studio. Modern dark theme, bold hero section, showcase services (branding, UI/UX, print), portfolio grid, and a strong CTA to book a free consultation."',
  },
  UPSELL: {
    label: "Upsell Page",
    color: "text-amber-400",
    placeholder:
      'Describe the upsell offer...\n\nExample: "Upsell a Premium Brand Package for £997. The visitor just signed up for a free brand audit. Offer includes full brand identity, 3 logo concepts, brand guidelines. Create urgency with a 48-hour discount."',
  },
  THANKS: {
    label: "Thank You Page",
    color: "text-emerald-400",
    placeholder:
      'Describe the thank you page...\n\nExample: "Thank you page after booking a free brand consultation. Confirm the booking, show what to expect next, and encourage them to follow on Instagram."',
  },
};

function PromptBubble({ entry }: { entry: { type: string; content: string; timestamp: string } }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-xs">
        <div className="bg-indigo-500/20 border border-indigo-500/20 rounded-2xl rounded-tr-sm px-4 py-3">
          <p className="text-white/90 text-sm leading-relaxed">{entry.content}</p>
        </div>
        <div className="flex items-center justify-end gap-2 mt-1.5 px-1">
          <span className="text-white/25 text-xs">{entry.type === "generate" ? "Generated" : "Edited"}</span>
          <Clock size={10} className="text-white/25" />
          <span className="text-white/25 text-xs">
            {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function StepEditorPage() {
  const params = useParams<{ id: string; stepId: string }>();
  const funnelId = params?.id || "";
  const stepId = params?.stepId || "";
  const router = useRouter();

  const [funnel, setFunnel] = useState<LandingFunnel | null>(null);
  const [step, setStep] = useState<LandingStep | null>(null);
  const [page, setPage] = useState<LandingPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [showShare, setShowShare] = useState(false);
  const [collectEmails, setCollectEmails] = useState(false);

  const [slugInput, setSlugInput] = useState("");
  const [slugError, setSlugError] = useState("");
  const [savingSlug, setSavingSlug] = useState(false);

  const [copied, setCopied] = useState(false);

  const [stripeLink, setStripeLink] = useState("");
  const [stripeBtnText, setStripeBtnText] = useState("");
  const [savingStripe, setSavingStripe] = useState(false);
  const [stripeSaved, setStripeSaved] = useState(false);

  const historyEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadData();
  }, [funnelId, stepId]);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [page?.prompt_history]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const funnelData = await getLandingFunnel(funnelId);
      setFunnel(funnelData);
      const currentStep = funnelData.steps.find((s) => s.id === stepId);
      if (!currentStep) throw new Error("Step not found");
      setStep(currentStep);
      const p = currentStep.page || null;
      setPage(p);
      setCollectEmails(p?.collect_emails || false);
      setSlugInput(p?.slug || "");
      setStripeLink(p?.stripe_payment_link || "");
      setStripeBtnText(p?.stripe_button_text || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load step");
    } finally {
      setLoading(false);
    }
  }

  const hasPage = !!page?.html_content;

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setError(null);
    try {
      let updated: LandingPage;
      if (!hasPage) {
        updated = await generateLandingPage({ step_id: stepId, prompt: prompt.trim(), collect_emails: collectEmails });
      } else {
        updated = await editLandingPage({ step_id: stepId, edit_prompt: prompt.trim() });
      }
      setPage(updated);
      setSlugInput(updated.slug || "");
      setPrompt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate page");
    } finally {
      setGenerating(false);
    }
  }

  async function handleRegenerate() {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const updated = await generateLandingPage({ step_id: stepId, prompt: prompt.trim(), collect_emails: collectEmails });
      setPage(updated);
      setSlugInput(updated.slug || "");
      setPrompt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to regenerate page");
    } finally {
      setGenerating(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  async function handleSaveSlug() {
    const clean = slugInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
    if (!clean) { setSlugError("Slug cannot be empty"); return; }
    setSavingSlug(true); setSlugError("");
    try {
      const updated = await updateLandingPageSettings(stepId, { slug: clean });
      setPage((prev) => prev ? { ...prev, slug: updated.slug } : prev);
      setSlugInput(updated.slug || "");
    } catch (e) {
      setSlugError(e instanceof Error ? e.message : "Failed to save slug");
    } finally {
      setSavingSlug(false);
    }
  }

  async function handleToggleCollectEmails(val: boolean) {
    setCollectEmails(val);
    if (page) {
      try {
        await updateLandingPageSettings(stepId, { collect_emails: val });
        setPage((prev) => prev ? { ...prev, collect_emails: val } : prev);
      } catch {
        setCollectEmails(!val);
      }
    }
  }

  async function handleSaveStripe() {
    const link = stripeLink.trim();
    if (link && !link.startsWith("https://")) return;
    setSavingStripe(true);
    try {
      const updated = await updateLandingPageSettings(stepId, {
        stripe_payment_link: link || null,
        stripe_button_text: stripeBtnText.trim() || null,
      });
      setPage((prev) => prev ? { ...prev, stripe_payment_link: updated.stripe_payment_link, stripe_button_text: updated.stripe_button_text } : prev);
      setStripeSaved(true);
      setTimeout(() => setStripeSaved(false), 2000);
    } catch { /* ignore */ } finally {
      setSavingStripe(false);
    }
  }

  async function handleCopyUrl() {
    if (!page?.slug) return;
    const url = `${window.location.protocol}//${window.location.hostname}:8000/api/landing-pages/public/${page.slug}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950 text-white/40">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-indigo-500/50 border-t-indigo-500 rounded-full animate-spin" />
          Loading editor...
        </div>
      </div>
    );
  }

  if (error || !step) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-950 gap-4 px-6 text-center">
        <p className="text-red-400 font-medium">{error || "Step not found"}</p>
        {error?.toLowerCase().includes("not found") || error?.toLowerCase().includes("failed") ? (
          <p className="text-white/30 text-sm max-w-sm">
            The backend may need a restart. Open a terminal and run:<br />
            <code className="mt-2 block bg-black/40 rounded px-3 py-2 text-xs text-white/60 text-left">
              cd dashboard/backend{"\n"}python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
            </code>
          </p>
        ) : null}
        <Link href={`/landing-pages/${funnelId}`} className="text-indigo-300 hover:underline text-sm mt-2">
          ← Back to funnel
        </Link>
      </div>
    );
  }

  const cfg = STEP_CONFIG[step?.type || "LANDING"] || STEP_CONFIG.LANDING;
  const history = Array.isArray(page?.prompt_history) ? page.prompt_history : [];
  const publicUrl = page?.slug
    ? `${typeof window !== "undefined" ? window.location.protocol : "http:"}//${typeof window !== "undefined" ? window.location.hostname : "localhost"}:8000/api/landing-pages/public/${page.slug}`
    : null;

  return (
    <div className="flex flex-col h-screen bg-slate-950">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center gap-4 px-5 py-3.5 bg-slate-900 border-b border-white/5">
        <Link
          href={`/landing-pages/${funnelId}`}
          className="flex items-center gap-1.5 text-white/40 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft size={14} />
          <span>{funnel?.name || "Funnel"}</span>
        </Link>
        <span className="text-white/20">/</span>
        <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>

        <div className="ml-auto flex items-center gap-2">
          {hasPage && (
            <button
              onClick={() => setShowShare((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                showShare ? "bg-indigo-500/20 text-indigo-400" : "text-white/40 hover:text-white hover:bg-white/5"
              }`}
            >
              <Share2 size={13} /> Share
            </button>
          )}
          {hasPage && (
            <button
              onClick={() => router.push(`/landing-pages/${funnelId}/analytics`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/40 hover:text-white hover:bg-white/5 transition-colors"
            >
              <BarChart2 size={13} /> Analytics
            </button>
          )}
          <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => setPreviewDevice("desktop")}
              className={`p-1.5 rounded-md transition-colors ${previewDevice === "desktop" ? "bg-slate-600 text-white" : "text-white/30 hover:text-white/60"}`}
            >
              <Monitor size={14} />
            </button>
            <button
              onClick={() => setPreviewDevice("mobile")}
              className={`p-1.5 rounded-md transition-colors ${previewDevice === "mobile" ? "bg-slate-600 text-white" : "text-white/30 hover:text-white/60"}`}
            >
              <Smartphone size={14} />
            </button>
          </div>
          {funnel?.steps && (
            <div className="flex items-center gap-1">
              {funnel.steps.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => router.push(`/landing-pages/${funnelId}/steps/${s.id}`)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    s.id === stepId ? "bg-indigo-500/20 text-indigo-400" : "text-white/30 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {["Landing", "Upsell", "Thanks"][i]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Share panel */}
      {showShare && (
        <div className="flex-shrink-0 bg-slate-900 border-b border-white/5 px-5 py-4">
          <div className="max-w-2xl flex flex-col gap-4">
            <div>
              <label className="block text-white/50 text-xs font-medium mb-1.5">Public URL slug</label>
              <div className="flex items-center gap-2">
                <span className="text-white/30 text-sm whitespace-nowrap">…/public/</span>
                <input
                  value={slugInput}
                  onChange={(e) => setSlugInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveSlug()}
                  placeholder="my-page-slug"
                  className="flex-1 bg-slate-800 border border-white/10 focus:border-indigo-500/40 rounded-lg px-3 py-1.5 text-white text-sm outline-none"
                />
                <button
                  onClick={handleSaveSlug}
                  disabled={savingSlug}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {savingSlug ? <div className="w-3.5 h-3.5 border border-white/50 border-t-white rounded-full animate-spin" /> : <Check size={13} />}
                  Save
                </button>
              </div>
              {slugError && <p className="text-red-400 text-xs mt-1">{slugError}</p>}
            </div>

            {publicUrl && (
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-white/50 text-sm truncate">{publicUrl}</div>
                <button
                  onClick={handleCopyUrl}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {copied ? <><Check size={13} className="text-emerald-400" /><span className="text-emerald-400">Copied!</span></> : <><Copy size={13} />Copy</>}
                </button>
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Open ↗
                </a>
              </div>
            )}

            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                <Mail size={14} className="text-white/40" />
                <div>
                  <p className="text-white/70 text-sm font-medium">Collect email signups</p>
                  <p className="text-white/30 text-xs">Intercepts form submits and saves emails to analytics</p>
                </div>
              </div>
              <button
                onClick={() => handleToggleCollectEmails(!collectEmails)}
                style={{ height: "22px", width: "40px" }}
                className={`relative rounded-full transition-colors ${collectEmails ? "bg-indigo-600" : "bg-slate-600"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${collectEmails ? "translate-x-[18px]" : "translate-x-0"}`} />
              </button>
            </div>

            <div className="border-t border-white/5 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <CreditCard size={14} className="text-white/40" />
                <div>
                  <p className="text-white/70 text-sm font-medium">Stripe payment button</p>
                  <p className="text-white/30 text-xs">Adds a floating "Buy Now" button linked to your Stripe Payment Link</p>
                </div>
              </div>
              <div className="space-y-2">
                <input
                  value={stripeLink}
                  onChange={(e) => setStripeLink(e.target.value)}
                  placeholder="https://buy.stripe.com/…"
                  className="w-full bg-slate-800 border border-white/10 focus:border-violet-500/40 rounded-lg px-3 py-1.5 text-white text-sm placeholder-white/20 outline-none"
                />
                {stripeLink && !stripeLink.startsWith("https://") && (
                  <p className="text-red-400 text-xs">Must start with https://</p>
                )}
                <div className="flex gap-2">
                  <input
                    value={stripeBtnText}
                    onChange={(e) => setStripeBtnText(e.target.value)}
                    placeholder="Button text (default: Buy Now)"
                    className="flex-1 bg-slate-800 border border-white/10 focus:border-violet-500/40 rounded-lg px-3 py-1.5 text-white text-sm placeholder-white/20 outline-none"
                  />
                  <button
                    onClick={handleSaveStripe}
                    disabled={savingStripe || !!(stripeLink && !stripeLink.startsWith("https://"))}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {savingStripe ? (
                      <div className="w-3.5 h-3.5 border border-white/50 border-t-white rounded-full animate-spin" />
                    ) : stripeSaved ? (
                      <><Check size={13} className="text-emerald-300" /><span className="text-emerald-300">Saved!</span></>
                    ) : (
                      <><Check size={13} />Save</>
                    )}
                  </button>
                </div>
                {page?.stripe_payment_link && <p className="text-white/25 text-xs">✓ Payment button active on published page</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main split */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left — AI editor */}
        <div className="w-96 flex-shrink-0 flex flex-col bg-slate-900 border-r border-white/5">
          <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-700 flex items-center justify-center">
              <Sparkles size={14} className="text-white" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">AI Editor</p>
              <p className="text-white/30 text-xs">Claude-powered page builder</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {history.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-4 py-8">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                  <Sparkles size={22} className="text-indigo-400" />
                </div>
                <div className="text-center px-4">
                  <p className="text-white/60 font-medium text-sm mb-1">Describe your {cfg.label.toLowerCase()}</p>
                  <p className="text-white/30 text-xs leading-relaxed">
                    Tell Claude what kind of page you want — industry, style, content, colors — and it will generate a beautiful page instantly.
                  </p>
                </div>
              </div>
            )}
            {history.map((entry, i) => (
              <PromptBubble key={i} entry={entry} />
            ))}
            {generating && (
              <div className="flex items-center gap-2.5 text-white/40">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
                <span className="text-xs">Claude is building your page...</span>
              </div>
            )}
            <div ref={historyEndRef} />
          </div>

          <div className="px-4 py-4 border-t border-white/5 space-y-3">
            {error && (
              <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-red-400 text-xs">{error}</p>
              </div>
            )}
            <form onSubmit={handleSubmit}>
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={hasPage ? 'Describe an edit...\n\nExample: "Make the headline bigger, change CTA to red, add a pricing section"' : cfg.placeholder}
                rows={5}
                disabled={generating}
                className="w-full bg-slate-800 border border-white/10 focus:border-indigo-500/40 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 outline-none transition-colors resize-none disabled:opacity-50"
              />
              <div className="flex items-center justify-between mt-2.5">
                <span className="text-white/25 text-xs">Ctrl+↵ to send</span>
                <div className="flex items-center gap-2">
                  {!hasPage && (
                    <button
                      type="button"
                      onClick={() => setCollectEmails((v) => !v)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        collectEmails ? "border-indigo-500/40 text-indigo-400 bg-indigo-500/10" : "border-white/10 text-white/30 hover:text-white/60"
                      }`}
                    >
                      <Mail size={11} />
                      {collectEmails ? "Email form on" : "Email form"}
                    </button>
                  )}
                  {hasPage && (
                    <button
                      type="button"
                      onClick={handleRegenerate}
                      disabled={!prompt.trim() || generating}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed text-xs transition-colors"
                    >
                      <RefreshCw size={12} /> Regenerate
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={!prompt.trim() || generating}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
                  >
                    <Send size={13} />
                    {hasPage ? "Apply Edit" : "Generate"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* Right — Preview */}
        <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
          <div className="flex-shrink-0 flex items-center gap-3 px-5 py-3 border-b border-white/5 bg-slate-900/50">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/50" />
              <div className="w-3 h-3 rounded-full bg-amber-500/50" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/50" />
            </div>
            <div className="flex-1 text-center">
              <span className="text-white/30 text-xs">
                {previewDevice === "mobile" ? "Mobile Preview (390px)" : "Desktop Preview"}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-hidden relative flex items-start justify-center bg-[#0d0d14]">
            {!hasPage && !generating ? (
              <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-8">
                <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-white/5 flex items-center justify-center">
                  <Monitor size={28} className="text-white/20" />
                </div>
                <div>
                  <p className="text-white/40 font-medium mb-1">No page generated yet</p>
                  <p className="text-white/20 text-sm max-w-xs">
                    Describe your page in the editor on the left and click Generate.
                  </p>
                </div>
              </div>
            ) : generating && !hasPage ? (
              <div className="flex flex-col items-center justify-center h-full gap-5">
                <div className="relative">
                  <div className="w-16 h-16 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles size={20} className="text-indigo-400" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-white/60 font-medium mb-1">Generating your page...</p>
                  <p className="text-white/30 text-sm">Claude is crafting something beautiful</p>
                </div>
              </div>
            ) : (
              <div
                className={`h-full transition-all duration-300 ${previewDevice === "mobile" ? "py-4" : "w-full"}`}
                style={{ width: previewDevice === "mobile" ? "390px" : "100%" }}
              >
                {generating && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-10 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                      <span className="text-white/60 text-sm">Updating page...</span>
                    </div>
                  </div>
                )}
                <iframe
                  key={page?.updated_at}
                  src={`http://localhost:8000/api/landing-pages/pages/${stepId}/preview`}
                  title="Page Preview"
                  className="w-full h-full border-0 rounded-lg"
                  style={{
                    background: "#0f0f1a",
                    boxShadow: previewDevice === "mobile" ? "0 0 0 1px rgba(255,255,255,0.05), 0 20px 60px rgba(0,0,0,0.5)" : "none",
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

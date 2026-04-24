"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart2,
  Check,
  CheckCircle2,
  Circle,
  Edit3,
  Eye,
  EyeOff,
  Pencil,
  X,
  Zap,
} from "lucide-react";
import { LandingFunnel, updateLandingFunnel, updateLandingStep, getLandingFunnel } from "@/lib/api";

const STEP_CONFIG: Record<string, { label: string; description: string; bg: string; border: string; text: string; gradient: string }> = {
  LANDING: {
    label: "Landing Page",
    description: "The first page visitors see. Capture attention and drive action.",
    bg: "bg-blue-500/10",
    border: "border-blue-500/25",
    text: "text-blue-300",
    gradient: "from-blue-500 to-cyan-500",
  },
  UPSELL: {
    label: "Upsell Page",
    description: "Shown after initial action. Offer a premium upgrade.",
    bg: "bg-amber-500/10",
    border: "border-amber-500/25",
    text: "text-amber-300",
    gradient: "from-amber-500 to-orange-500",
  },
  THANKS: {
    label: "Thank You Page",
    description: "Confirm success, delight the user, and set next steps.",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/25",
    text: "text-emerald-300",
    gradient: "from-emerald-500 to-teal-500",
  },
};

export default function LandingFunnelDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id || "";
  const router = useRouter();

  const [funnel, setFunnel] = useState<LandingFunnel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [togglingStep, setTogglingStep] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadFunnel();
    }, 0);
    return () => clearTimeout(timer);
  }, [id]);

  const generatedCount = useMemo(
    () => (funnel ? funnel.steps.filter((step) => Boolean(step.page?.html_content)).length : 0),
    [funnel],
  );

  async function loadFunnel() {
    setLoading(true);
    setError(null);
    try {
      const data = await getLandingFunnel(id);
      setFunnel(data);
      setNameValue(data.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load funnel");
    } finally {
      setLoading(false);
    }
  }

  async function saveName() {
    if (!funnel) return;
    if (!nameValue.trim() || nameValue.trim() === funnel.name) {
      setEditingName(false);
      setNameValue(funnel.name);
      return;
    }
    try {
      const updated = await updateLandingFunnel(id, {
        name: nameValue.trim(),
        description: funnel.description,
      });
      setFunnel((prev) => (prev ? { ...prev, name: updated.name, description: updated.description } : prev));
      setEditingName(false);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Failed to update funnel");
    }
  }

  async function toggleUpsell(stepId: string, enabled: boolean) {
    if (!funnel) return;
    setTogglingStep(stepId);
    try {
      await updateLandingStep(funnel.id, stepId, !enabled);
      setFunnel((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          steps: prev.steps.map((step) => (step.id === stepId ? { ...step, enabled: !enabled } : step)),
        };
      });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Failed to toggle step");
    } finally {
      setTogglingStep(null);
    }
  }

  if (loading) return <div className="min-h-screen bg-slate-950 text-white/60 p-8">Loading funnel...</div>;
  if (error || !funnel) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 text-red-300">
        <p>{error || "Funnel not found"}</p>
        <Link href="/landing-pages" className="text-indigo-300 underline">Back to funnels</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="border-b border-white/10 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-5">
          <Link href="/landing-pages" className="inline-flex items-center gap-1.5 text-white/50 hover:text-white text-sm mb-3 transition-colors">
            <ArrowLeft size={14} />Back to funnels
          </Link>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveName();
                      if (e.key === "Escape") {
                        setEditingName(false);
                        setNameValue(funnel.name);
                      }
                    }}
                    className="bg-slate-800 border border-indigo-400/40 rounded-lg px-3 py-1.5 text-white text-xl font-bold outline-none"
                  />
                  <button onClick={saveName} className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30">
                    <Check size={16} />
                  </button>
                  <button
                    onClick={() => {
                      setEditingName(false);
                      setNameValue(funnel.name);
                    }}
                    className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-white"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group">
                  <h1 className="text-xl font-bold truncate">{funnel.name}</h1>
                  <button onClick={() => setEditingName(true)} className="p-1 rounded opacity-0 group-hover:opacity-100 text-white/40 hover:text-white">
                    <Pencil size={14} />
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => router.push(`/landing-pages/${id}/analytics`)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 text-sm"
            >
              <BarChart2 size={15} />Analytics
            </button>
          </div>
          {!!funnel.description && <p className="text-white/50 text-sm mt-1">{funnel.description}</p>}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h2 className="text-white/70 text-sm font-medium uppercase tracking-wider mb-1">Funnel Flow</h2>
          <p className="text-white/40 text-sm">Click a step to open the AI page editor. Toggle the upsell step on or off as needed.</p>
        </div>

        <div className="flex flex-col lg:flex-row items-stretch gap-4">
          {funnel.steps.map((step, i) => {
            const cfg = STEP_CONFIG[step.type];
            const hasPage = !!step.page?.html_content;
            const isUpsell = step.type === "UPSELL";
            const disabled = step.enabled === false;
            return (
              <div key={step.id} className="flex-1 flex flex-col lg:flex-row items-stretch gap-4">
                <div className={`flex-1 rounded-2xl border ${cfg.border} ${disabled ? "opacity-40" : cfg.bg} p-6 relative overflow-hidden`}>
                  <div className={`absolute -top-8 -right-8 w-32 h-32 rounded-full bg-gradient-to-br ${cfg.gradient} opacity-10 blur-2xl`} />
                  <div className="relative">
                    <div className="flex items-center justify-between mb-4">
                      <span className={`text-xs font-semibold uppercase tracking-wider ${cfg.text}`}>Step {i + 1}</span>
                      <div className="flex items-center gap-2">
                        {isUpsell && (
                          <button
                            onClick={() => toggleUpsell(step.id, step.enabled)}
                            disabled={!!togglingStep}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                              disabled
                                ? "border-white/10 text-white/40 hover:text-white/60 hover:border-white/20"
                                : "border-amber-400/30 text-amber-300 hover:bg-amber-500/10"
                            }`}
                          >
                            {disabled ? <EyeOff size={11} /> : <Eye size={11} />}
                            {disabled ? "Skipped" : "Included"}
                          </button>
                        )}
                        {hasPage ? (
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 size={15} className="text-emerald-300" />
                            <span className="text-emerald-300 text-xs font-medium">Generated</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Circle size={15} className="text-white/30" />
                            <span className="text-white/40 text-xs">Not generated</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mb-2">
                      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br ${cfg.gradient} mb-3`}>
                        {step.type === "LANDING" && <Zap size={18} className="text-white" />}
                        {step.type === "UPSELL" && <ArrowRight size={18} className="text-white" />}
                        {step.type === "THANKS" && <CheckCircle2 size={18} className="text-white" />}
                      </div>
                      <h3 className={`font-bold text-lg ${disabled ? "text-white/50" : "text-white"}`}>{cfg.label}</h3>
                    </div>

                    <p className={`text-sm mb-4 ${cfg.text} opacity-90`}>{cfg.description}</p>

                    <button
                      onClick={() => router.push(`/landing-pages/${id}/steps/${step.id}`)}
                      className={`inline-flex items-center gap-2 text-sm font-semibold transition-all hover:gap-3 ${cfg.text}`}
                    >
                      <Edit3 size={14} />
                      {hasPage ? "Edit with AI" : "Generate with AI"}
                    </button>
                  </div>
                </div>

                {i < funnel.steps.length - 1 && (
                  <div className="hidden lg:flex items-center justify-center w-8 flex-shrink-0">
                    <ArrowRight size={20} className={funnel.steps[i + 1]?.enabled === false ? "text-white/10" : "text-white/25"} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-10 grid grid-cols-3 gap-4">
          <div className="bg-slate-900 border border-white/10 rounded-xl px-5 py-4">
            <p className="text-white/50 text-xs mb-1">Active Steps</p>
            <p className="text-white font-semibold text-lg">{funnel.steps.filter((s) => s.enabled !== false).length}/3</p>
          </div>
          <div className="bg-slate-900 border border-white/10 rounded-xl px-5 py-4">
            <p className="text-white/50 text-xs mb-1">Pages Generated</p>
            <p className="text-white font-semibold text-lg">{generatedCount}/3</p>
          </div>
          <div className="bg-slate-900 border border-white/10 rounded-xl px-5 py-4">
            <p className="text-white/50 text-xs mb-1">Created</p>
            <p className="text-white font-semibold text-lg">{new Date(funnel.created_at).toLocaleDateString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronRight, ExternalLink } from "lucide-react";
import { API, LandingFunnel, getFunnel } from "@/lib/api";

const STEP_LABELS: Record<string, string> = { LANDING: "Landing Page", UPSELL: "Upsell Page", THANKS: "Thank You Page" };
const STEP_COLORS: Record<string, string> = {
  LANDING: "bg-blue-500/15 text-blue-300 border-blue-400/30",
  UPSELL: "bg-amber-500/15 text-amber-300 border-amber-400/30",
  THANKS: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
};

export default function FunnelPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [funnel, setFunnel] = useState<LandingFunnel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFunnel(id)
      .then(setFunnel)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load funnel"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white/40">Loading…</div>;
  if (error || !funnel) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 text-red-300 p-8">
      <p>{error || "Funnel not found"}</p>
      <Link href="/admin" className="text-white/50 hover:text-white text-sm underline">← Back to funnels</Link>
    </div>
  );

  const steps = [...funnel.steps].sort((a, b) => a.order - b.order);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 py-4 flex items-center gap-4">
          <button onClick={() => router.push("/admin")} className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">{funnel.name}</h1>
            {funnel.description && <p className="text-white/40 text-xs truncate">{funnel.description}</p>}
          </div>
        </div>
      </div>

      {/* Funnel flow */}
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8">
        <h2 className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-6">Funnel Steps</h2>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-10">
          {steps.map((step, i) => (
            <div key={step.id} className="flex sm:flex-col items-center sm:items-start gap-3 sm:gap-0 flex-1">
              <div
                onClick={() => router.push(`/admin/${id}/steps/${step.id}`)}
                className="flex-1 w-full bg-slate-900 border border-white/10 hover:border-indigo-400/40 rounded-2xl p-5 cursor-pointer transition-all hover:-translate-y-0.5 group"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${STEP_COLORS[step.type]}`}>
                    {STEP_LABELS[step.type]}
                  </span>
                  <ChevronRight size={14} className="text-white/30 group-hover:text-indigo-300 transition-colors" />
                </div>
                {step.page?.html_content ? (
                  <>
                    <div className="w-full h-1.5 rounded-full bg-emerald-500/30 mb-3">
                      <div className="h-1.5 rounded-full bg-emerald-400 w-full" />
                    </div>
                    <p className="text-emerald-300 text-xs font-medium">✓ Page generated</p>
                    {step.page.slug && (
                      <a
                        href={`${API}/p/${step.page.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 mt-2"
                      >
                        View live <ExternalLink size={10} />
                      </a>
                    )}
                  </>
                ) : (
                  <>
                    <div className="w-full h-1.5 rounded-full bg-slate-700 mb-3" />
                    <p className="text-white/30 text-xs">Click to generate with AI</p>
                  </>
                )}
              </div>
              {i < steps.length - 1 && (
                <ArrowRight size={16} className="text-white/20 sm:hidden shrink-0" />
              )}
            </div>
          ))}
        </div>

        {/* Step flow arrows for desktop */}
        <div className="hidden sm:flex justify-between px-6 mb-4">
          {steps.slice(0, -1).map((_, i) => (
            <div key={i} className="flex-1 flex justify-end pr-6">
              <ArrowRight size={16} className="text-white/20" />
            </div>
          ))}
        </div>

        {/* View contacts */}
        <div className="mt-4">
          <Link href="/admin/contacts" className="text-sm text-white/40 hover:text-white underline underline-offset-4">
            View contacts &amp; enquiries →
          </Link>
        </div>
      </div>
    </div>
  );
}

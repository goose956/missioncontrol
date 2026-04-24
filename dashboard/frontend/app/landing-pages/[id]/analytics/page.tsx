"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, Eye, Mail, TrendingUp } from "lucide-react";
import { LandingFunnel, LandingPageSignup, getLandingAnalytics, getLandingFunnel } from "@/lib/api";

const STEP_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  LANDING: { label: "Landing Page", color: "text-blue-300", bg: "bg-blue-500/10", border: "border-blue-500/25" },
  UPSELL: { label: "Upsell Page", color: "text-amber-300", bg: "bg-amber-500/10", border: "border-amber-500/25" },
  THANKS: { label: "Thank You Page", color: "text-emerald-300", bg: "bg-emerald-500/10", border: "border-emerald-500/25" },
};

function downloadCsv(signups: LandingPageSignup[], stepLabel: string) {
  const rows = [["Email", "Name", "Date"], ...signups.map((s) => [s.email, s.name || "", new Date(s.created_at).toLocaleString()])];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${stepLabel.replaceAll(" ", "_")}_signups.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function LandingAnalyticsPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id || "";
  const router = useRouter();

  const [funnel, setFunnel] = useState<LandingFunnel | null>(null);
  const [analytics, setAnalytics] = useState<Record<string, { view_count: number; signups: LandingPageSignup[] }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      load();
    }, 0);
    return () => clearTimeout(timer);
  }, [id]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const funnelData = await getLandingFunnel(id);
      setFunnel(funnelData);

      const result = await Promise.all(
        funnelData.steps
          .filter((step) => step.page?.id)
          .map((step) =>
            getLandingAnalytics(step.page.id).then((data) => ({
              pageId: step.page.id,
              data,
            })),
          ),
      );

      const map: Record<string, { view_count: number; signups: LandingPageSignup[] }> = {};
      result.forEach((row) => {
        map[row.pageId] = row.data;
      });
      setAnalytics(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }

  const totalViews = useMemo(() => Object.values(analytics).reduce((sum, item) => sum + (item.view_count || 0), 0), [analytics]);
  const totalSignups = useMemo(() => Object.values(analytics).reduce((sum, item) => sum + (item.signups?.length || 0), 0), [analytics]);

  if (loading) return <div className="min-h-screen bg-slate-950 text-white/60 p-8">Loading analytics...</div>;
  if (error || !funnel) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 text-red-300">
        <p>{error || "Funnel not found"}</p>
        <button onClick={() => router.push(`/landing-pages/${id}`)} className="text-indigo-300 underline">
          Back to funnel
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="border-b border-white/10 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-5">
          <Link href={`/landing-pages/${id}`} className="inline-flex items-center gap-1.5 text-white/50 hover:text-white text-sm mb-3">
            <ArrowLeft size={14} />Back to funnel
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">{funnel.name}</h1>
              <p className="text-white/50 text-sm mt-0.5">Analytics</p>
            </div>
            <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 text-sm">
              <TrendingUp size={14} />Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-900 border border-white/10 rounded-xl px-6 py-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Eye size={18} className="text-blue-300" />
            </div>
            <div>
              <p className="text-white/50 text-xs mb-0.5">Total Page Views</p>
              <p className="text-white font-bold text-2xl">{totalViews.toLocaleString()}</p>
            </div>
          </div>
          <div className="bg-slate-900 border border-white/10 rounded-xl px-6 py-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Mail size={18} className="text-indigo-300" />
            </div>
            <div>
              <p className="text-white/50 text-xs mb-0.5">Email Signups</p>
              <p className="text-white font-bold text-2xl">{totalSignups.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {funnel.steps.map((step) => {
          const cfg = STEP_CONFIG[step.type];
          const stepAnalytics = step.page?.id ? analytics[step.page.id] : null;
          const views = stepAnalytics?.view_count || 0;
          const signups = stepAnalytics?.signups || [];
          const hasPage = !!step.page?.html_content;

          return (
            <div key={step.id} className={`bg-slate-900 border ${cfg.border} rounded-2xl overflow-hidden`}>
              <div className={`px-6 py-4 ${cfg.bg} border-b ${cfg.border} flex items-center justify-between`}>
                <div>
                  <p className={`text-xs font-semibold uppercase tracking-wider ${cfg.color}`}>{cfg.label}</p>
                  {step.page?.slug && <p className="text-white/40 text-xs mt-0.5">/public/{step.page.slug}</p>}
                </div>
                {!hasPage && <span className="text-white/30 text-xs">No page generated</span>}
              </div>

              {hasPage ? (
                <div className="px-6 py-5">
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <p className="text-white font-semibold text-lg">{views.toLocaleString()}</p>
                      <p className="text-white/50 text-xs">Page views</p>
                    </div>
                    <div>
                      <p className="text-white font-semibold text-lg">{signups.length.toLocaleString()}</p>
                      <p className="text-white/50 text-xs">Email signups</p>
                    </div>
                  </div>

                  {signups.length > 0 ? (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-white/70 text-sm font-medium">Subscribers</p>
                        <button
                          onClick={() => downloadCsv(signups, cfg.label)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white/70 hover:text-white text-xs font-medium"
                        >
                          <Download size={12} />Export CSV
                        </button>
                      </div>
                      <div className="rounded-xl border border-white/10 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-800/60 text-white/50 text-xs">
                              <th className="px-4 py-2.5 text-left font-medium">Email</th>
                              <th className="px-4 py-2.5 text-left font-medium">Name</th>
                              <th className="px-4 py-2.5 text-left font-medium">Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {signups.map((signup, idx) => (
                              <tr key={`${signup.email}-${signup.created_at}-${idx}`} className={`border-t border-white/10 ${idx % 2 ? "bg-slate-800/40" : ""}`}>
                                <td className="px-4 py-2.5 text-white/90">{signup.email}</td>
                                <td className="px-4 py-2.5 text-white/60">{signup.name || "-"}</td>
                                <td className="px-4 py-2.5 text-white/50 text-xs">{new Date(signup.created_at).toLocaleDateString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-white/35 text-sm">
                      {step.page?.collect_emails
                        ? "No signups yet. Share the page to start collecting emails."
                        : "Email collection is off. Enable it from the Share panel in the editor."}
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-6 py-8 text-center">
                  <p className="text-white/35 text-sm">Generate this page to start tracking views and signups.</p>
                  <button onClick={() => router.push(`/landing-pages/${id}/steps/${step.id}`)} className="mt-3 text-indigo-300 hover:text-indigo-200 text-sm underline">
                    Open editor ->
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronRight, GitBranch, Inbox, Plus, RefreshCw, Trash2, Zap } from "lucide-react";
import {
  LandingFunnel,
  createLandingFunnel,
  deleteLandingFunnel,
  getLandingContacts,
  getLandingFunnels,
  pushToGitHub,
  syncToProduction,
} from "@/lib/api";

const STEP_LABELS: Record<string, string> = { LANDING: "Landing", UPSELL: "Upsell", THANKS: "Thanks" };
const STEP_COLORS: Record<string, string> = {
  LANDING: "bg-blue-500/15 text-blue-300 border-blue-400/30",
  UPSELL: "bg-amber-500/15 text-amber-300 border-amber-400/30",
  THANKS: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
};

function generatedCount(funnel: LandingFunnel): number {
  return funnel.steps.filter((step) => Boolean(step.page?.html_content)).length;
}

export default function LandingPagesDashboard() {
  const router = useRouter();

  const [funnels, setFunnels] = useState<LandingFunnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [pushing, setPushing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pushResult, setPushResult] = useState<{ ok: boolean; message: string } | null>(null);

  const sortedFunnels = useMemo(
    () => [...funnels].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [funnels],
  );

  const loadFunnels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setFunnels(await getLandingFunnels());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load funnels");
    } finally {
      setLoading(false);
    }
    // Contacts count is non-critical — don't break the page if it fails
    try {
      const contacts = await getLandingContacts();
      setUnreadCount(contacts.filter((c) => !c.read).length);
    } catch {
      // backend may not have contacts endpoint yet
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(loadFunnels, 0);
    return () => clearTimeout(timer);
  }, [loadFunnels]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const funnel = await createLandingFunnel({ name: name.trim(), description: description.trim() });
      setFunnels((prev) => [funnel, ...prev]);
      setShowModal(false);
      setName("");
      setDescription("");
      router.push(`/landing-pages/${funnel.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create funnel");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!window.confirm("Delete this funnel and all its pages?")) return;
    setDeletingId(id);
    try {
      await deleteLandingFunnel(id);
      setFunnels((prev) => prev.filter((funnel) => funnel.id !== id));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to delete funnel");
    } finally {
      setDeletingId(null);
    }
  }

  async function handlePush() {
    setPushing(true);
    setPushResult(null);
    try {
      const result = await pushToGitHub();
      setPushResult({ ok: true, message: result.message });
    } catch (err) {
      setPushResult({ ok: false, message: err instanceof Error ? err.message : "Push failed" });
    } finally {
      setPushing(false);
      setTimeout(() => setPushResult(null), 8000);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setPushResult(null);
    try {
      const result = await syncToProduction();
      setPushResult({ ok: true, message: result.message });
    } catch (err) {
      setPushResult({ ok: false, message: err instanceof Error ? err.message : "Sync failed" });
    } finally {
      setSyncing(false);
      setTimeout(() => setPushResult(null), 8000);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-4 sm:py-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">My Funnels</h1>
            <p className="text-white/50 text-sm mt-0.5">Build AI-powered marketing funnels</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              title="Send all local pages directly to the live Railway app"
              className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-indigo-500/15 border border-white/10 hover:border-indigo-400/40 text-white/60 hover:text-indigo-300 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
            >
              <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Syncing…" : "Sync to Production"}
            </button>
            <button
              onClick={handlePush}
              disabled={pushing}
              title="Push code changes to GitHub"
              className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-emerald-500/15 border border-white/10 hover:border-emerald-400/40 text-white/60 hover:text-emerald-300 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
            >
              <GitBranch size={15} />
              {pushing ? "Pushing…" : "Push to GitHub"}
            </button>
            <Link
              href="/landing-pages/contacts"
              className="relative flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-semibold text-sm transition-colors"
            >
              <Inbox size={15} />
              Contacts
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-violet-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </Link>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-sm transition-colors"
            >
              <Plus size={16} />
              New Funnel
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
        {loading && <div className="text-white/50 py-12">Loading funnels...</div>}

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-red-300 text-sm">{error}</div>
        )}

        {!loading && !error && sortedFunnels.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-6">
            <div className="w-20 h-20 rounded-2xl bg-indigo-500/15 border border-indigo-400/25 flex items-center justify-center">
              <Zap size={36} className="text-indigo-300" />
            </div>
            <div className="text-center">
              <h2 className="text-white font-semibold text-lg mb-1">No funnels yet</h2>
              <p className="text-white/50 text-sm max-w-sm">
                Create your first funnel and let AI build stunning landing pages, upsell pages, and thank-you pages.
              </p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-sm transition-colors"
            >
              <Plus size={16} />
              Create your first funnel
            </button>
          </div>
        )}

        {!loading && !error && sortedFunnels.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Contacts admin card */}
            <Link
              href="/landing-pages/contacts"
              className="group bg-slate-900 border border-violet-500/20 hover:border-violet-400/50 rounded-2xl p-5 transition-all hover:-translate-y-0.5 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-400/20 flex items-center justify-center">
                  <Inbox size={20} className="text-violet-300" />
                </div>
                {unreadCount > 0 && (
                  <span className="px-2.5 py-1 bg-violet-500 text-white text-xs font-bold rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div>
                <h3 className="font-bold text-white">Contacts &amp; Enquiries</h3>
                <p className="text-white/40 text-sm mt-0.5">View all quote requests and form submissions across your pages</p>
              </div>
              <div className="flex items-center gap-1 text-violet-400 text-xs font-semibold mt-auto">
                Open admin <ArrowRight size={13} />
              </div>
            </Link>

            {sortedFunnels.map((funnel) => {
              const generated = generatedCount(funnel);
              return (
                <div
                  key={funnel.id}
                  onClick={() => router.push(`/landing-pages/${funnel.id}`)}
                  className="group relative bg-slate-900 border border-white/10 hover:border-indigo-400/40 rounded-2xl p-5 cursor-pointer transition-all hover:-translate-y-0.5"
                >
                  <button
                    onClick={(e) => handleDelete(e, funnel.id)}
                    disabled={deletingId === funnel.id}
                    className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-white/40 hover:text-red-300 hover:bg-red-500/10 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>

                  <h3 className="font-semibold text-white text-base pr-8 mb-1">{funnel.name}</h3>
                  {!!funnel.description && <p className="text-white/50 text-xs mb-4 line-clamp-2">{funnel.description}</p>}

                  <div className="flex items-center gap-1.5 mb-4 flex-wrap">
                    {funnel.steps.map((step, i) => (
                      <div key={step.id} className="flex items-center gap-1.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STEP_COLORS[step.type]}`}>
                          {STEP_LABELS[step.type]}
                        </span>
                        {i < funnel.steps.length - 1 && <ArrowRight size={10} className="text-white/25" />}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex-1 bg-slate-700 rounded-full h-1.5 mr-3">
                      <div
                        className="bg-gradient-to-r from-indigo-500 to-violet-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${(generated / 3) * 100}%` }}
                      />
                    </div>
                    <span className="text-white/50 text-xs whitespace-nowrap">{generated}/3 pages</span>
                  </div>

                  <div className="flex items-center justify-between mt-3">
                    <span className="text-white/30 text-xs">{new Date(funnel.created_at).toLocaleDateString()}</span>
                    <ChevronRight size={14} className="text-white/40 group-hover:text-indigo-300 transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8">
          <Link href="/projects" className="text-xs text-white/60 hover:text-white underline underline-offset-4">
            Open Mission Control Projects
          </Link>
        </div>
      </div>

      {/* Push to GitHub toast */}
      {pushResult && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border text-sm font-medium ${
            pushResult.ok
              ? "bg-emerald-900/90 border-emerald-500/40 text-emerald-200"
              : "bg-red-900/90 border-red-500/40 text-red-200"
          }`}
        >
          <span>{pushResult.ok ? "✓" : "✗"}</span>
          <span className="max-w-sm">{pushResult.message}</span>
        </div>
      )}

      {/* Create funnel modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
          onClick={(e) => e.target === e.currentTarget && setShowModal(false)}
        >
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
              <h2 className="text-white font-semibold text-lg">Create New Funnel</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10">
                ✕
              </button>
            </div>
            <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-white/70 text-sm font-medium mb-1.5">Funnel name *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Graphic Design Agency Funnel"
                  className="w-full bg-slate-800 border border-white/15 focus:border-indigo-400/60 rounded-xl px-4 py-2.5 text-white text-sm outline-none"
                />
              </div>
              <div>
                <label className="block text-white/70 text-sm font-medium mb-1.5">Description (optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Brief description of what this funnel is for..."
                  className="w-full bg-slate-800 border border-white/15 focus:border-indigo-400/60 rounded-xl px-4 py-2.5 text-white text-sm outline-none resize-none"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!name.trim() || creating}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold"
                >
                  {creating ? "Creating..." : "Create Funnel"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

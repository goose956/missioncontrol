"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Circle, Trash2 } from "lucide-react";
import { LandingContact, deleteContact, getContacts, markContactRead } from "@/lib/api";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<LandingContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setContacts(await getContacts());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }

  async function toggleRead(c: LandingContact) {
    try {
      const updated = await markContactRead(c.id, !c.read);
      setContacts((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch { /* ignore */ }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteContact(id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
    } catch { /* ignore */ }
    setDeletingId(null);
    setConfirmDeleteId(null);
  }

  // Funnel filter options
  const funnelNames = Array.from(new Set(contacts.map((c) => c.funnel_name).filter(Boolean))) as string[];

  const filtered = contacts.filter((c) => {
    if (filter === "all") return true;
    if (filter === "unread") return !c.read;
    return c.funnel_name === filter;
  });

  const unread = contacts.filter((c) => !c.read).length;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-8 py-4 sm:py-5 flex items-center gap-4">
          <Link href="/admin" className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold">Contacts &amp; Enquiries</h1>
            <p className="text-white/40 text-sm mt-0.5">
              {loading ? "Loading…" : `${contacts.length} total${unread > 0 ? ` · ${unread} unread` : ""}`}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
        {/* Filter bar */}
        {!loading && !error && contacts.length > 0 && (
          <div className="flex gap-2 mb-6 flex-wrap">
            {[
              { key: "all", label: `All (${contacts.length})` },
              { key: "unread", label: `Unread (${unread})` },
              ...funnelNames.map((n) => ({ key: n, label: n })),
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  filter === key
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : "bg-white/5 border-white/10 text-white/50 hover:text-white hover:border-white/25"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {loading && <p className="text-white/40 py-8">Loading contacts…</p>}

        {error && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-amber-300 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-20">
            <p className="text-white/20 text-4xl mb-4">📬</p>
            <p className="text-white/40">No contacts yet.</p>
            <p className="text-white/25 text-sm mt-1">Submissions from your landing pages will appear here.</p>
          </div>
        )}

        <div className="space-y-3">
          {filtered.map((c) => (
            <div
              key={c.id}
              className={`rounded-2xl border p-5 transition-all ${c.read ? "bg-slate-900 border-white/8" : "bg-slate-800/80 border-indigo-400/20"}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`font-semibold ${c.read ? "text-white/70" : "text-white"}`}>{c.name}</span>
                    {!c.read && <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />}
                    {c.funnel_name && (
                      <span className="text-xs px-2 py-0.5 bg-violet-500/15 border border-violet-400/20 text-violet-300 rounded-full">{c.funnel_name}</span>
                    )}
                  </div>
                  <a href={`mailto:${c.email}`} className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors">{c.email}</a>
                  {c.phone && <span className="text-white/40 text-sm ml-3">{c.phone}</span>}
                  {c.message && <p className="text-white/60 text-sm mt-2 leading-relaxed">{c.message}</p>}
                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    <span className="text-white/25 text-xs">{new Date(c.created_at).toLocaleString()}</span>
                    {c.page_slug && <span className="text-white/25 text-xs">/{c.page_slug}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleRead(c)}
                    title={c.read ? "Mark unread" : "Mark read"}
                    className={`p-2 rounded-lg transition-colors ${c.read ? "text-white/30 hover:text-white hover:bg-white/10" : "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"}`}
                  >
                    {c.read ? <Circle size={16} /> : <Check size={16} />}
                  </button>

                  {confirmDeleteId === c.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(c.id)}
                        disabled={deletingId === c.id}
                        className="px-2 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg font-medium transition-colors disabled:opacity-50"
                      >
                        {deletingId === c.id ? "…" : "Delete"}
                      </button>
                      <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-1 text-xs text-white/40 hover:text-white rounded-lg">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(c.id)}
                      className="p-2 rounded-lg text-white/20 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

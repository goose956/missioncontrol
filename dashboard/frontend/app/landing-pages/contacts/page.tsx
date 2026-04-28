"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Mail, Phone, MessageSquare, Trash2, Check, Circle, Filter, RefreshCw } from "lucide-react";
import { getLandingContacts, getLandingFunnels, markContactRead, deleteContact, LandingContact, LandingFunnel } from "@/lib/api";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<LandingContact[]>([]);
  const [funnels, setFunnels] = useState<LandingFunnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [funnelFilter, setFunnelFilter] = useState<string>("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [funnelFilter]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [c, f] = await Promise.all([
        getLandingContacts(funnelFilter || undefined),
        getLandingFunnels(),
      ]);
      setContacts(c);
      setFunnels(f);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }

  async function toggleRead(contact: LandingContact) {
    const updated = await markContactRead(contact.id, !contact.read);
    setContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteContact(id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
      setConfirmDelete(null);
    } finally {
      setDeletingId(null);
    }
  }

  const unread = contacts.filter((c) => !c.read).length;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-5">
          <Link href="/landing-pages" className="inline-flex items-center gap-1.5 text-white/50 hover:text-white text-sm mb-3 transition-colors">
            <ArrowLeft size={14} /> Back to funnels
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Contacts & Enquiries</h1>
              <p className="text-white/40 text-sm mt-0.5">
                {contacts.length} total{unread > 0 && <span className="ml-2 px-2 py-0.5 bg-violet-500/20 text-violet-300 rounded-full text-xs font-semibold">{unread} unread</span>}
              </p>
            </div>
            <button onClick={load} className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors">
              <RefreshCw size={15} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Filter bar */}
        <div className="flex items-center gap-3 mb-6">
          <Filter size={14} className="text-white/30" />
          <select
            value={funnelFilter}
            onChange={(e) => setFunnelFilter(e.target.value)}
            className="bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white outline-none"
          >
            <option value="">All funnels</option>
            {funnels.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-white/30 text-sm py-12 justify-center">
            <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            Loading...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-6 py-5 text-sm">
            <p className="text-amber-300 font-semibold mb-1">Backend needs a restart</p>
            <p className="text-amber-200/50">The contacts feature requires the latest backend. Open a terminal and run:</p>
            <pre className="mt-3 bg-black/30 rounded-lg px-4 py-3 text-xs text-white/70 overflow-x-auto">
{`cd "C:\\Users\\richard\\Desktop\\MISSION CONTROL\\dashboard\\backend"
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload`}
            </pre>
          </div>
        )}

        {!loading && contacts.length === 0 && (
          <div className="text-center py-20">
            <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-white/5 flex items-center justify-center mx-auto mb-4">
              <Mail size={24} className="text-white/20" />
            </div>
            <p className="text-white/40 font-medium">No enquiries yet</p>
            <p className="text-white/20 text-sm mt-1">When visitors click a quote/contact button on your pages, they'll appear here.</p>
          </div>
        )}

        <div className="space-y-3">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className={`rounded-2xl border p-5 transition-all ${
                contact.read
                  ? "border-white/5 bg-slate-900/50"
                  : "border-violet-500/20 bg-violet-500/5"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Name + unread dot */}
                  <div className="flex items-center gap-2 mb-1">
                    {!contact.read && (
                      <span className="w-2 h-2 rounded-full bg-violet-400 flex-shrink-0" />
                    )}
                    <span className="font-semibold text-white">{contact.name}</span>
                    {contact.funnel_name && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/40 border border-white/5">
                        {contact.funnel_name}
                      </span>
                    )}
                  </div>

                  {/* Contact details row */}
                  <div className="flex flex-wrap items-center gap-4 text-sm mb-3">
                    <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-indigo-300 hover:text-indigo-200 transition-colors">
                      <Mail size={13} /> {contact.email}
                    </a>
                    {contact.phone && (
                      <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors">
                        <Phone size={13} /> {contact.phone}
                      </a>
                    )}
                  </div>

                  {/* Message */}
                  {contact.message && (
                    <div className="flex gap-2 text-sm text-white/60 bg-white/[0.03] rounded-xl px-4 py-3 border border-white/5">
                      <MessageSquare size={14} className="text-white/25 flex-shrink-0 mt-0.5" />
                      <p className="leading-relaxed">{contact.message}</p>
                    </div>
                  )}

                  {/* Timestamp + source */}
                  <div className="flex items-center gap-3 mt-3 text-xs text-white/25">
                    <span>{new Date(contact.created_at).toLocaleString()}</span>
                    {contact.page_slug && (
                      <span>via <span className="font-mono text-white/35">{contact.page_slug}</span></span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => toggleRead(contact)}
                    title={contact.read ? "Mark as unread" : "Mark as read"}
                    className={`p-2 rounded-lg transition-colors ${
                      contact.read
                        ? "text-white/25 hover:text-white/60 hover:bg-white/5"
                        : "text-emerald-400 hover:bg-emerald-500/10"
                    }`}
                  >
                    {contact.read ? <Circle size={15} /> : <Check size={15} />}
                  </button>

                  {confirmDelete === contact.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(contact.id)}
                        disabled={deletingId === contact.id}
                        className="px-2.5 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
                      >
                        {deletingId === contact.id ? "…" : "Delete"}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="px-2.5 py-1.5 text-white/40 hover:text-white text-xs rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(contact.id)}
                      className="p-2 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 size={15} />
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

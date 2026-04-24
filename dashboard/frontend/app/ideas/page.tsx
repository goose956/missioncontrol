"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  API,
  Idea,
  getIdeas,
  createIdea,
  updateIdea,
  deleteIdea,
  reorderIdeas,
} from "@/lib/api";

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: "saas", label: "SaaS", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "skill", label: "Skill", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "landing-page", label: "Landing Page", color: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "ad-ideas", label: "Ad Ideas", color: "bg-pink-100 text-pink-700 border-pink-200" },
  { value: "misc", label: "Misc", color: "bg-gray-100 text-gray-600 border-gray-200" },
];

const STATUSES = [
  { value: "draft", label: "Draft", color: "bg-gray-100 text-gray-600 border-gray-200" },
  { value: "working", label: "Working", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "complete", label: "Complete", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "archived", label: "Archived", color: "bg-slate-100 text-slate-400 border-slate-200" },
];

function categoryMeta(value: string) {
  return CATEGORIES.find((c) => c.value === value) ?? CATEGORIES[CATEGORIES.length - 1];
}

function statusMeta(value: string) {
  return STATUSES.find((s) => s.value === value) ?? STATUSES[0];
}

function nextStatus(current: string) {
  const idx = STATUSES.findIndex((s) => s.value === current);
  return STATUSES[(idx + 1) % STATUSES.length].value;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface ModalState {
  mode: "create" | "edit";
  idea?: Idea;
}

function IdeaModal({
  state,
  onClose,
  onSave,
}: {
  state: ModalState;
  onClose: () => void;
  onSave: (idea: Idea) => void;
}) {
  const editing = state.mode === "edit" && state.idea;

  const [title, setTitle] = useState(editing ? state.idea!.title : "");
  const [category, setCategory] = useState(editing ? state.idea!.category : "saas");
  const [description, setDescription] = useState(editing ? state.idea!.description : "");
  const [status, setStatus] = useState(editing ? state.idea!.status : "draft");

  const [rewrite, setRewrite] = useState("");
  const [rewriting, setRewriting] = useState(false);
  const [rewriteDone, setRewriteDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);

  const handleRewrite = async () => {
    if (!description.trim()) return;
    setRewrite("");
    setRewriting(true);
    setRewriteDone(false);

    try {
      const res = await fetch(`${API}/api/ideas/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, category }),
      });
      if (!res.ok || !res.body) throw new Error("Rewrite failed");

      const reader = res.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === "text") setRewrite((r) => r + ev.text);
            if (ev.type === "done") setRewriteDone(true);
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      setRewrite("Error: could not reach backend.");
    } finally {
      setRewriting(false);
      setRewriteDone(true);
    }
  };

  const acceptRewrite = () => {
    setDescription(rewrite);
    setRewrite("");
    setRewriteDone(false);
  };

  const handleSave = async () => {
    if (!title.trim() || !description.trim()) return;
    setSaving(true);
    try {
      let idea: Idea;
      if (editing) {
        idea = await updateIdea(state.idea!.id, { title, category, description, status });
      } else {
        idea = await createIdea({ title, category, description, status });
      }
      onSave(idea);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="text-sm font-semibold text-gray-900">
            {editing ? "Edit Idea" : "New Idea"}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none transition-colors">×</button>
        </div>

        {/* Modal body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs text-gray-500 block mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give your idea a name"
              className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-colors"
            />
          </div>

          {/* Category + Status row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 transition-colors"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 transition-colors"
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">Description</label>
              <button
                onClick={handleRewrite}
                disabled={!description.trim() || rewriting}
                className="text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-indigo-200 hover:border-indigo-400 bg-indigo-50 px-2.5 py-1 rounded-md"
              >
                {rewriting ? "Enhancing…" : "✦ Enhance with AI"}
              </button>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your idea in a couple of sentences…"
              rows={4}
              className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-colors"
            />
          </div>

          {/* AI rewrite output */}
          {(rewriting || rewrite) && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
              <div className="text-xs text-indigo-500 font-medium mb-2">AI rewrite</div>
              <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                {rewrite}
                {rewriting && (
                  <span className="inline-block w-1.5 h-4 bg-indigo-400 animate-pulse ml-0.5 align-middle" />
                )}
              </div>
              {rewriteDone && rewrite && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={acceptRewrite}
                    className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => { setRewrite(""); setRewriteDone(false); }}
                    className="text-xs text-gray-500 hover:text-gray-700 transition-colors px-3 py-1.5"
                  >
                    Discard
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-700 transition-colors px-4 py-2">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || !description.trim() || saving}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-5 py-2 rounded-lg transition-colors"
          >
            {saving ? "Saving…" : editing ? "Save changes" : "Add idea"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterCat, setFilterCat] = useState<string>("all");

  const load = useCallback(async () => {
    try {
      const data = await getIdeas();
      setIdeas(data);
    } catch {
      setError("Backend offline — start the API server to load ideas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = (idea: Idea) => {
    setIdeas((prev) => {
      const exists = prev.find((i) => i.id === idea.id);
      if (exists) return prev.map((i) => (i.id === idea.id ? idea : i));
      return [...prev, idea];
    });
    setModal(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this idea?")) return;
    await deleteIdea(id);
    setIdeas((prev) => {
      const next = prev.filter((i) => i.id !== id);
      return next.map((i, idx) => ({ ...i, rank: idx + 1 }));
    });
  };

  const handleStatusClick = async (idea: Idea) => {
    const newStatus = nextStatus(idea.status);
    const updated = await updateIdea(idea.id, { status: newStatus });
    setIdeas((prev) => prev.map((i) => (i.id === idea.id ? updated : i)));
  };

  const move = async (idea: Idea, direction: -1 | 1) => {
    const sorted = [...ideas].sort((a, b) => a.rank - b.rank);
    const idx = sorted.findIndex((i) => i.id === idea.id);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= sorted.length) return;

    // Swap ranks
    const copy = sorted.map((i) => ({ ...i }));
    const tmp = copy[idx].rank;
    copy[idx].rank = copy[newIdx].rank;
    copy[newIdx].rank = tmp;

    setIdeas(copy);
    await reorderIdeas(copy.sort((a, b) => a.rank - b.rank).map((i) => i.id));
  };

  const sorted = [...ideas]
    .sort((a, b) => a.rank - b.rank)
    .filter((i) => filterStatus === "all" || i.status === filterStatus)
    .filter((i) => filterCat === "all" || i.category === filterCat);

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading…</div>;
  if (error) return <div className="p-8 text-red-500 text-sm">{error}</div>;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white shrink-0 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-sm font-semibold text-gray-900">Ideas Lab</div>
          <div className="text-xs text-gray-500">{ideas.length} idea{ideas.length !== 1 ? "s" : ""} — ranked by priority</div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-white border border-gray-300 text-gray-700 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-400"
          >
            <option value="all">All statuses</option>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>

          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            className="bg-white border border-gray-300 text-gray-700 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-400"
          >
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>

          <button
            onClick={() => setModal({ mode: "create" })}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors shadow-sm"
          >
            + New Idea
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 text-sm gap-2">
            <div className="text-3xl">💡</div>
            <div>{ideas.length === 0 ? "No ideas yet — click New Idea to add your first." : "No ideas match the current filters."}</div>
          </div>
        )}

        <div className="divide-y divide-gray-100">
          {sorted.map((idea) => {
            const cat = categoryMeta(idea.category);
            const sta = statusMeta(idea.status);

            return (
              <div key={idea.id} className="flex items-start gap-4 px-6 py-4 hover:bg-white transition-colors group bg-gray-50">
                {/* Rank + arrows */}
                <div className="flex flex-col items-center gap-0.5 shrink-0 pt-0.5">
                  <span className="text-xs font-bold text-gray-300 w-6 text-center tabular-nums">
                    {idea.rank}
                  </span>
                  <button
                    onClick={() => move(idea, -1)}
                    disabled={idea.rank === Math.min(...ideas.map((i) => i.rank))}
                    className="text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-default text-xs leading-none transition-colors"
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => move(idea, 1)}
                    disabled={idea.rank === Math.max(...ideas.map((i) => i.rank))}
                    className="text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-default text-xs leading-none transition-colors"
                    title="Move down"
                  >
                    ▼
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${cat.color}`}>
                      {cat.label}
                    </span>
                    <span className="text-sm font-semibold text-gray-900">{idea.title}</span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{idea.description}</p>
                </div>

                {/* Status + date + actions */}
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <button
                    onClick={() => handleStatusClick(idea)}
                    className={`text-xs px-2.5 py-0.5 rounded-md border font-medium transition-colors hover:opacity-75 ${sta.color}`}
                    title="Click to change status"
                  >
                    {sta.label}
                  </button>
                  <div className="text-xs text-gray-400">{fmtDate(idea.created_at)}</div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setModal({ mode: "edit", idea })}
                      className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(idea.id)}
                      className="text-xs text-gray-300 hover:text-red-500 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <IdeaModal
          state={modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

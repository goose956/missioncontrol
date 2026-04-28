"use client";
import { useEffect, useState } from "react";
import { getFiles, readFile, deleteFile, API, FolderGroup, FileEntry } from "@/lib/api";
import MarkdownRenderer from "@/components/MarkdownRenderer";

export default function FilesPage() {
  const [groups, setGroups] = useState<FolderGroup[]>([]);
  const [selected, setSelected] = useState<FileEntry | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    getFiles()
      .then(setGroups)
      .catch(() => setError("Backend offline"))
      .finally(() => setLoading(false));
  }, []);

  const openFile = async (file: FileEntry) => {
    if (!file.readable) return;
    setSelected(file);
    setReading(true);
    setContent("");
    setConfirmDelete(false);
    try {
      const text = await readFile(file.path);
      setContent(text);
    } catch {
      setContent("Error reading file.");
    } finally {
      setReading(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      await deleteFile(selected.path);
      setGroups((prev) =>
        prev.map((g) => ({ ...g, files: g.files.filter((f) => f.path !== selected.path) }))
      );
      setSelected(null);
      setContent("");
      setConfirmDelete(null);
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  };

  const totalFiles = groups.reduce((a, g) => a + g.files.length, 0);

  return (
    <div className="flex h-screen">
      {/* File tree */}
      <div className="w-72 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-gray-200">
          <div className="text-sm font-semibold text-gray-900">Files</div>
          <div className="text-xs text-gray-500">{totalFiles} file{totalFiles !== 1 ? "s" : ""}</div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="p-4 text-xs text-gray-400">Loading…</div>
          )}
          {error && (
            <div className="p-4 text-xs text-red-500">{error}</div>
          )}
          {groups.map((group) => (
            <div key={group.folder}>
              <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50 sticky top-0">
                {group.folder}
              </div>
              {group.files.length === 0 && (
                <div className="px-4 py-2 text-xs text-gray-300">empty</div>
              )}
              {group.files.map((file) => (
                <div
                  key={file.path}
                  className={`group flex items-center gap-2 px-4 py-2 text-xs transition-colors ${
                    selected?.path === file.path
                      ? "bg-indigo-50 text-indigo-700"
                      : file.readable
                      ? "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      : "text-gray-300"
                  }`}
                >
                  <button
                    onClick={() => openFile(file)}
                    disabled={!file.readable}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left disabled:cursor-default"
                  >
                    <span>{fileIcon(file.name)}</span>
                    <span className="truncate">{file.name}</span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(confirmDelete === file.path ? null : file.path); }}
                    className="text-gray-300 hover:text-red-500 transition-colors shrink-0 px-1 text-sm leading-none"
                    title="Delete file"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* File viewer */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {!selected && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Select a file to view
          </div>
        )}
        {selected && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
              <div>
                <div className="text-sm font-semibold text-gray-900">{selected.name}</div>
                <div className="text-xs text-gray-400 font-mono">{selected.path}</div>
              </div>
              <div className="flex items-center gap-3">
                {selected.name.endsWith(".md") && (
                  <a
                    href={`${API}/api/files/print?path=${encodeURIComponent(selected.path)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-500 px-3 py-1 rounded-lg transition-colors bg-white"
                  >
                    Export PDF
                  </a>
                )}
                <div className="text-xs text-gray-400">
                  {(selected.size / 1024).toFixed(1)} KB
                </div>
                {confirmDelete === selected.path ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-500">Delete this file?</span>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="text-xs px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-40"
                    >
                      {deleting ? "Deleting…" : "Yes, delete"}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="text-xs px-3 py-1 border border-gray-300 text-gray-600 hover:border-gray-400 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(selected.path)}
                    className="text-xs px-3 py-1 border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-400 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>

            {reading && (
              <div className="text-xs text-gray-400">Loading…</div>
            )}

            {!reading && content && (
              selected.name.endsWith(".md") ? (
                <div className="prose-dark text-sm leading-relaxed bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <MarkdownRenderer content={content} />
                </div>
              ) : (
                <pre className="text-xs text-gray-700 bg-white rounded-xl p-4 border border-gray-200 overflow-x-auto whitespace-pre-wrap shadow-sm">
                  {content}
                </pre>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function fileIcon(name: string): string {
  if (name.endsWith(".md")) return "📄";
  if (name.endsWith(".yaml") || name.endsWith(".yml")) return "⚙️";
  if (name.endsWith(".json")) return "{}";
  if (name.endsWith(".py")) return "🐍";
  if (name.endsWith(".ts") || name.endsWith(".tsx")) return "📘";
  return "📃";
}

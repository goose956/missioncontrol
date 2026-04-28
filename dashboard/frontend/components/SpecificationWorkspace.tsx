"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ChatInterface from "@/components/ChatInterface";
import { FileEntry, Workflow, getFiles, readFile, writeFile, deleteFile } from "@/lib/api";

const SPEC_FOLDER = "shared/specs";

function isSpecDoc(file: FileEntry): boolean {
  return file.path.startsWith(`${SPEC_FOLDER}/`) && (file.name.endsWith(".txt") || file.name.endsWith(".md"));
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SpecificationWorkspace({ workflow }: { workflow: Workflow }) {
  const [docs, setDocs] = useState<FileEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [editorText, setEditorText] = useState("");
  const [lastSavedText, setLastSavedText] = useState("");
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [confirmDeletePath, setConfirmDeletePath] = useState<string | null>(null);

  const refreshDocs = useCallback(async () => {
    setLoadingDocs(true);
    try {
      const groups = await getFiles();
      const specs = groups
        .flatMap((group) => group.files)
        .filter(isSpecDoc)
        .sort((a, b) => b.modified - a.modified);
      setDocs(specs);
      if (!selectedPath && specs.length > 0) {
        setSelectedPath(specs[0].path);
      }
    } catch {
      setStatus("Could not load spec documents. Is backend running?");
    } finally {
      setLoadingDocs(false);
    }
  }, [selectedPath]);

  const loadDoc = useCallback(async (path: string) => {
    setLoadingDoc(true);
    setStatus("");
    try {
      const text = await readFile(path);
      setSelectedPath(path);
      setEditorText(text);
      setLastSavedText(text);
    } catch {
      setStatus("Failed to open document.");
    } finally {
      setLoadingDoc(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      refreshDocs();
    }, 0);
    return () => clearTimeout(timer);
  }, [refreshDocs]);

  useEffect(() => {
    if (!selectedPath) return;
    const timer = setTimeout(() => {
      loadDoc(selectedPath);
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedPath, loadDoc]);

  const hasUnsavedChanges = useMemo(() => editorText !== lastSavedText, [editorText, lastSavedText]);

  const saveCurrent = async () => {
    if (!selectedPath || saving) return;
    setSaving(true);
    setStatus("");
    try {
      await writeFile(selectedPath, editorText);
      setLastSavedText(editorText);
      setStatus("Saved");
      await refreshDocs();
    } catch {
      setStatus("Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleChatSaved = (path: string) => {
    if (!path.startsWith(`${SPEC_FOLDER}/`)) return;
    refreshDocs();
    setSelectedPath(path);
  };

  return (
    <div className="h-screen flex flex-col lg:flex-row bg-gray-50">
      <section className="w-full lg:w-1/3 min-w-0 border-b lg:border-b-0 lg:border-r border-gray-200 h-[55vh] lg:h-full">
        <ChatInterface workflow={workflow} onSavedPath={handleChatSaved} />
      </section>

      <section className="w-full lg:w-2/3 min-w-0 h-[45vh] lg:h-full flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-900">Specification Documents</div>
              <div className="text-xs text-gray-500">Saved in `{SPEC_FOLDER}/` as text files.</div>
            </div>
            <button
              onClick={refreshDocs}
              className="text-xs border border-gray-300 bg-white hover:bg-gray-50 px-3 py-1.5 rounded-lg text-gray-600"
            >
              Refresh
            </button>
          </div>

          <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
            {loadingDocs && <div className="text-xs text-gray-400">Loading docs...</div>}
            {!loadingDocs && docs.length === 0 && (
              <div className="text-xs text-gray-400">No spec docs yet. Send a message in chat to generate one.</div>
            )}
            {docs.map((doc) => (
              <div
                key={doc.path}
                className={`relative shrink-0 w-56 rounded-xl border transition-colors overflow-hidden ${
                  confirmDeletePath === doc.path
                    ? "border-red-300 bg-red-50"
                    : selectedPath === doc.path
                    ? "border-indigo-400 bg-indigo-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                {confirmDeletePath === doc.path ? (
                  <div className="p-3 flex flex-col gap-2">
                    <div className="text-xs font-medium text-red-700">Delete this spec?</div>
                    <div className="text-xs text-red-500 truncate">{doc.name}</div>
                    <div className="flex gap-2 mt-1">
                      <button
                        onClick={async () => {
                          await deleteFile(doc.path);
                          setDocs((prev) => prev.filter((d) => d.path !== doc.path));
                          if (selectedPath === doc.path) { setSelectedPath(""); setEditorText(""); setLastSavedText(""); }
                          setConfirmDeletePath(null);
                        }}
                        className="flex-1 text-xs bg-red-500 hover:bg-red-600 text-white py-1.5 rounded-lg transition-colors font-medium"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setConfirmDeletePath(null)}
                        className="flex-1 text-xs border border-gray-300 text-gray-600 hover:bg-gray-100 py-1.5 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button onClick={() => loadDoc(doc.path)} className="w-full text-left p-3">
                      <div className="text-xs text-gray-400 mb-1">Spec Doc</div>
                      <div className="text-sm font-medium text-gray-900 truncate pr-5">{doc.name}</div>
                      <div className="text-xs text-gray-500 mt-2">{formatDate(doc.modified)}</div>
                      <div className="text-[11px] text-gray-400 mt-1 truncate">{doc.path}</div>
                    </button>
                    <button
                      onClick={() => setConfirmDeletePath(doc.path)}
                      className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors text-xs"
                      title="Delete spec"
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 p-4 bg-gray-50">
          {!selectedPath && !loadingDocs && (
            <div className="h-full rounded-xl border border-dashed border-gray-300 bg-white flex items-center justify-center text-sm text-gray-400">
              Select a document thumbnail to edit.
            </div>
          )}

          {selectedPath && (
            <div className="h-full rounded-xl border border-gray-200 bg-white shadow-sm flex flex-col">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate">{selectedPath.split("/").pop()}</div>
                  <div className="text-xs text-gray-400 font-mono truncate">{selectedPath}</div>
                </div>
                <div className="flex items-center gap-2">
                  {status && <span className="text-xs text-gray-500">{status}</span>}
                  <button
                    onClick={saveCurrent}
                    disabled={saving || !hasUnsavedChanges}
                    className="text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>

              <div className="flex-1 p-3">
                {loadingDoc ? (
                  <div className="text-xs text-gray-400">Loading...</div>
                ) : (
                  <textarea
                    value={editorText}
                    onChange={(e) => {
                      setEditorText(e.target.value);
                      if (status) setStatus("");
                    }}
                    className="w-full h-full resize-none border border-gray-200 rounded-lg p-3 font-mono text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                    placeholder="Document contents"
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

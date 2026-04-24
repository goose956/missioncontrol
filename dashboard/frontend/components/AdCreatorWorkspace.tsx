"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChatInterface from "@/components/ChatInterface";
import { API, FileEntry, FolderGroup, Workflow, getFiles, uploadWorkspaceFile } from "@/lib/api";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

function ext(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

function imageFiles(groups: FolderGroup[], outputFolder: string): FileEntry[] {
  const prefix = outputFolder.endsWith("/") ? outputFolder : `${outputFolder}/`;
  return groups
    .flatMap((group) => group.files)
    .filter((file) => file.path.startsWith(prefix) && IMAGE_EXTENSIONS.has(ext(file.name)))
    .sort((a, b) => b.modified - a.modified);
}

export default function AdCreatorWorkspace({ workflow }: { workflow: Workflow }) {
  const [groups, setGroups] = useState<FolderGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(async () => {
    try {
      const data = await getFiles();
      setGroups(data);
      setStatus("");
    } catch {
      setStatus("Could not load ad images from workspace files.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadFiles();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadFiles]);

  useEffect(() => {
    const poll = setInterval(() => {
      loadFiles();
    }, 4000);
    return () => clearInterval(poll);
  }, [loadFiles]);

  const images = useMemo(() => imageFiles(groups, workflow.output_folder), [groups, workflow.output_folder]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!images.length) {
        setSelectedPath("");
        return;
      }
      if (!selectedPath || !images.some((img) => img.path === selectedPath)) {
        setSelectedPath(images[0].path);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [images, selectedPath]);

  const selected = images.find((img) => img.path === selectedPath) || null;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const allowed = Array.from(files).filter((file) => IMAGE_EXTENSIONS.has(ext(file.name)));
    if (allowed.length === 0) {
      setStatus("No supported images selected. Use PNG, JPG, WEBP, GIF, or SVG.");
      return;
    }

    setUploading(true);
    setStatus("");
    try {
      for (const file of allowed) {
        await uploadWorkspaceFile(workflow.output_folder, file);
      }
      await loadFiles();
      setStatus(`Uploaded ${allowed.length} image${allowed.length > 1 ? "s" : ""}.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }, [loadFiles, workflow.output_folder]);

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (uploading) return;
    await uploadFiles(e.dataTransfer.files);
  };

  return (
    <div className="h-screen flex flex-col xl:flex-row bg-gray-50">
      <section className="w-full xl:w-1/2 min-w-0 border-b xl:border-b-0 xl:border-r border-gray-200 h-[50vh] xl:h-full">
        <ChatInterface workflow={workflow} onSavedPath={loadFiles} />
      </section>

      <section className="w-full xl:w-1/2 min-w-0 h-[50vh] xl:h-full flex flex-col">
        <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-gray-900">Ad Image Viewer</div>
            <div className="text-xs text-gray-500">Large thumbnails from `{workflow.output_folder}/` auto-refresh every 4s.</div>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.gif,.svg"
              multiple
              className="hidden"
              onChange={async (e) => {
                if (!e.target.files) return;
                await uploadFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-xs border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg text-indigo-700 disabled:opacity-40"
            >
              {uploading ? "Uploading..." : "Upload Images"}
            </button>
            <button
              onClick={loadFiles}
              className="text-xs border border-gray-300 bg-white hover:bg-gray-50 px-3 py-1.5 rounded-lg text-gray-600"
            >
              Refresh
            </button>
          </div>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!dragOver) setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
          onDrop={onDrop}
          className={`mx-3 mt-3 rounded-xl border-2 border-dashed px-3 py-2 text-xs transition-colors ${
            dragOver ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-gray-300 bg-white text-gray-500"
          }`}
        >
          Drop images here to upload into `{workflow.output_folder}/`
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1.2fr,0.8fr] gap-3 p-3">
          <div className="min-h-0 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex items-center justify-center">
            {selected ? (
              <button
                onClick={() => setLightboxOpen(true)}
                className="w-full h-full p-3 flex items-center justify-center bg-white hover:bg-gray-50 transition-colors"
                title="Open full-screen preview"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${API}/api/files/raw?path=${encodeURIComponent(selected.path)}`}
                  alt={selected.name}
                  className="max-h-full max-w-full object-contain"
                />
              </button>
            ) : (
              <div className="text-xs text-gray-400 px-5 text-center">
                {loading ? "Scanning for ad images..." : "No images found yet. Generate or place images into the workflow output folder."}
              </div>
            )}
          </div>

          <div className="min-h-0 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-gray-200 text-xs font-semibold text-gray-600">
              Large Thumbnails ({images.length})
            </div>
            <div className="flex-1 overflow-y-auto p-2 grid grid-cols-1 gap-2">
              {images.map((img) => (
                <button
                  key={img.path}
                  onClick={() => setSelectedPath(img.path)}
                  className={`rounded-lg border p-2 text-left ${selectedPath === img.path ? "border-indigo-300 bg-indigo-50" : "border-gray-200 bg-gray-50"}`}
                >
                  <div className="rounded-md overflow-hidden bg-white border border-gray-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${API}/api/files/raw?path=${encodeURIComponent(img.path)}`}
                      alt={img.name}
                      className="w-full h-40 object-cover"
                    />
                  </div>
                  <div className="text-xs font-medium text-gray-800 mt-2 truncate">{img.name}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{new Date(img.modified * 1000).toLocaleString()}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {status && <div className="px-4 pb-3 text-xs text-amber-700">{status}</div>}

        {lightboxOpen && selected && (
          <div
            className="fixed inset-0 z-50 bg-black/85 flex flex-col"
            onClick={() => setLightboxOpen(false)}
          >
            <div className="px-4 py-3 flex items-center justify-between text-white/90">
              <div className="text-sm truncate pr-3">{selected.name}</div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxOpen(false);
                }}
                className="text-xs border border-white/30 rounded-lg px-3 py-1.5 hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <div className="flex-1 min-h-0 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${API}/api/files/raw?path=${encodeURIComponent(selected.path)}`}
                alt={selected.name}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Idea,
  FileEntry,
  Project,
  createProject,
  deleteProject,
  getFiles,
  getIdeas,
  getProjects,
  updateProject,
  uploadProjectFile,
} from "@/lib/api";

const STATUSES = [
  { value: "draft", label: "Draft", color: "bg-slate-100 text-slate-700 border-slate-200" },
  { value: "active", label: "Active", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "blocked", label: "Blocked", color: "bg-rose-100 text-rose-700 border-rose-200" },
  { value: "complete", label: "Complete", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "archived", label: "Archived", color: "bg-gray-100 text-gray-500 border-gray-200" },
];

interface ProjectModalState {
  mode: "create" | "edit";
  project?: Project;
}

function statusMeta(status: string) {
  return STATUSES.find((s) => s.value === status) ?? STATUSES[0];
}

function ProjectModal({
  state,
  ideas,
  specFiles,
  onClose,
  onSave,
}: {
  state: ProjectModalState;
  ideas: Idea[];
  specFiles: FileEntry[];
  onClose: () => void;
  onSave: (project: Project) => void;
}) {
  const editing = state.mode === "edit" && state.project;

  const [title, setTitle] = useState(editing ? state.project!.title : "");
  const [description, setDescription] = useState(editing ? state.project!.description : "");
  const [status, setStatus] = useState(editing ? state.project!.status : "draft");
  const [ideaId, setIdeaId] = useState(editing ? state.project!.idea_id ?? "" : "");
  const [specPath, setSpecPath] = useState(editing ? state.project!.spec_path ?? "" : "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      let project: Project;
      if (editing) {
        project = await updateProject(state.project!.id, {
          title,
          description,
          status,
          idea_id: ideaId || null,
          spec_path: specPath || null,
        });
      } else {
        project = await createProject({
          title,
          description,
          status,
          idea_id: ideaId || null,
          spec_path: specPath || null,
        });
      }
      onSave(project);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white border border-gray-200 rounded-2xl shadow-2xl">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-900">{editing ? "Edit Project" : "New Project"}</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">x</button>
        </div>

        <div className="p-6 grid gap-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Project Name</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-300 bg-white text-gray-900 placeholder-gray-400 rounded-lg px-3 py-2 text-sm"
              placeholder="Project title"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 bg-white text-gray-900 placeholder-gray-400 rounded-lg px-3 py-2 text-sm"
              placeholder="What is this project about?"
            />
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full border border-gray-300 bg-white text-gray-900 rounded-lg px-3 py-2 text-sm">
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Attach Idea</label>
              <select value={ideaId} onChange={(e) => setIdeaId(e.target.value)} className="w-full border border-gray-300 bg-white text-gray-900 rounded-lg px-3 py-2 text-sm">
                <option value="">None</option>
                {ideas.map((idea) => <option key={idea.id} value={idea.id}>{idea.title}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Attach Spec Doc</label>
              <select value={specPath} onChange={(e) => setSpecPath(e.target.value)} className="w-full border border-gray-300 bg-white text-gray-900 rounded-lg px-3 py-2 text-sm">
                <option value="">None</option>
                {specFiles.map((spec) => <option key={spec.path} value={spec.path}>{spec.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button onClick={onClose} className="text-xs text-gray-500 px-3 py-2">Cancel</button>
          <button
            onClick={save}
            disabled={saving || !title.trim()}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg"
          >
            {saving ? "Saving..." : editing ? "Save Changes" : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [specFiles, setSpecFiles] = useState<FileEntry[]>([]);
  const [modal, setModal] = useState<ProjectModalState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadProjectId, setUploadProjectId] = useState("");
  const [uploadNote, setUploadNote] = useState("");
  const [showUploadPrompt, setShowUploadPrompt] = useState(false);
  const [uploading, setUploading] = useState(false);

  const pickerRef = useRef<HTMLInputElement>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [projectData, ideaData, fileGroups] = await Promise.all([getProjects(), getIdeas(), getFiles()]);
      setProjects(projectData);
      setIdeas(ideaData);
      setSpecFiles(
        fileGroups
          .flatMap((group) => group.files)
          .filter((file) => file.path.startsWith("shared/specs/") && (file.name.endsWith(".txt") || file.name.endsWith(".md")))
          .sort((a, b) => b.modified - a.modified)
      );
    } catch {
      setError("Could not load projects. Is backend running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadAll();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadAll]);

  const ideaMap = useMemo(() => Object.fromEntries(ideas.map((idea) => [idea.id, idea])), [ideas]);

  const handleModalSave = (project: Project) => {
    setProjects((prev) => {
      const exists = prev.some((p) => p.id === project.id);
      if (!exists) return [project, ...prev];
      return prev.map((p) => (p.id === project.id ? project : p));
    });
    setModal(null);
  };

  const askProjectForFiles = (files: File[]) => {
    if (projects.length === 0) {
      setError("Create a project first, then upload files.");
      return;
    }
    setPendingFiles(files);
    setUploadProjectId(projects[0].id);
    setShowUploadPrompt(true);
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) askProjectForFiles(files);
  };

  const uploadPendingFiles = async () => {
    if (!uploadProjectId || pendingFiles.length === 0) return;
    setUploading(true);
    try {
      for (const file of pendingFiles) {
        await uploadProjectFile(uploadProjectId, file, uploadNote || undefined);
      }
      setPendingFiles([]);
      setUploadNote("");
      setShowUploadPrompt(false);
      await loadAll();
    } catch {
      setError("Upload failed for one or more files.");
    } finally {
      setUploading(false);
    }
  };

  const removeProject = async (projectId: string) => {
    if (!confirm("Delete this project?")) return;
    await deleteProject(projectId);
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
  };

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading projects...</div>;
  if (error && projects.length === 0) return <div className="p-8 text-sm text-red-500">{error}</div>;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-sm font-semibold text-gray-900">Projects</div>
          <div className="text-xs text-gray-500">Keep ideas, specs, and files organized by project.</div>
        </div>
        <button
          onClick={() => setModal({ mode: "create" })}
          className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg"
        >
          + New Project
        </button>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-200">
        {projects.length === 0 && (
          <div className="h-full flex items-center justify-center text-sm text-gray-400">No projects yet.</div>
        )}

        {projects.map((project) => {
          const meta = statusMeta(project.status);
          const linkedIdea = project.idea_id ? ideaMap[project.idea_id] : undefined;
          return (
            <div key={project.id} className="px-6 py-4 bg-white hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${meta.color}`}>{meta.label}</span>
                    <span className="text-sm font-semibold text-gray-900">{project.title}</span>
                  </div>
                  <div className="text-xs text-gray-600 leading-relaxed">{project.description || "No description"}</div>

                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700">
                      Idea: {linkedIdea ? linkedIdea.title : "None"}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded border border-indigo-200 bg-indigo-50 text-indigo-700">
                      Spec: {project.spec_path ? project.spec_path.split("/").pop() : "None"}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700">
                      Files: {(project.files || []).length}
                    </span>
                  </div>

                  {(project.files || []).length > 0 && (
                    <div className="mt-2 text-xs text-gray-500">
                      Recent upload: {(project.files || [])[project.files.length - 1].name}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setModal({ mode: "edit", project })}
                    className="text-xs text-gray-500 hover:text-gray-800"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => removeProject(project.id)}
                    className="text-xs text-gray-300 hover:text-red-500"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-6 py-4 border-t border-gray-200 bg-white shrink-0">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/60 px-4 py-4"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-medium text-indigo-800">Attach files to a project</div>
              <div className="text-xs text-indigo-600 mt-1">Drop documents here or choose files, then pick which project they belong to.</div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <input
                ref={pickerRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) askProjectForFiles(files);
                  e.currentTarget.value = "";
                }}
              />
              <button
                onClick={() => pickerRef.current?.click()}
                className="text-xs px-3 py-1.5 rounded-lg border border-indigo-400 text-indigo-700 bg-white hover:bg-indigo-100"
              >
                Choose Files
              </button>
            </div>
          </div>
        </div>
      </div>

      {modal && (
        <ProjectModal
          state={modal}
          ideas={ideas}
          specFiles={specFiles}
          onClose={() => setModal(null)}
          onSave={handleModalSave}
        />
      )}

      {showUploadPrompt && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-gray-200 shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="text-sm font-semibold text-gray-900">Save Uploads To Project</div>
              <div className="text-xs text-gray-500 mt-1">{pendingFiles.length} file(s) selected</div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Project</label>
                <select
                  value={uploadProjectId}
                  onChange={(e) => setUploadProjectId(e.target.value)}
                  className="w-full border border-gray-300 bg-white text-gray-900 rounded-lg px-3 py-2 text-sm"
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Note (optional)</label>
                <input
                  value={uploadNote}
                  onChange={(e) => setUploadNote(e.target.value)}
                  className="w-full border border-gray-300 bg-white text-gray-900 placeholder-gray-400 rounded-lg px-3 py-2 text-sm"
                  placeholder="What are these files for?"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowUploadPrompt(false);
                  setPendingFiles([]);
                  setUploadNote("");
                }}
                className="text-xs text-gray-500 px-3 py-2"
              >
                Cancel
              </button>
              <button
                onClick={uploadPendingFiles}
                disabled={uploading || !uploadProjectId}
                className="text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg"
              >
                {uploading ? "Uploading..." : "Save Files"}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && projects.length > 0 && (
        <div className="fixed bottom-4 right-4 text-xs bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}
    </div>
  );
}

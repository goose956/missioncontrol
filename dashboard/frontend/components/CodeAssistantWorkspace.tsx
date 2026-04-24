"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChatInterface from "@/components/ChatInterface";
import { FolderGroup, Idea, Project, Workflow, getFiles, getIdeas, getProjects, readFile } from "@/lib/api";

interface ComposerSeed {
  id: string;
  text: string;
}

interface SoftwareItem {
  name: string;
  fileCount: number;
  samplePath: string;
}

function deriveSoftwareInventory(groups: FolderGroup[]): SoftwareItem[] {
  const items = new Map<string, SoftwareItem>();

  for (const group of groups) {
    for (const file of group.files) {
      if (!file.path.startsWith("webspace/")) continue;
      const parts = file.path.split("/");
      const name = parts[1] || file.name;
      const existing = items.get(name);
      if (existing) {
        existing.fileCount += 1;
      } else {
        items.set(name, {
          name,
          fileCount: 1,
          samplePath: file.path,
        });
      }
    }
  }

  return Array.from(items.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function fmtProjectTime(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function CodeAssistantWorkspace({ workflow }: { workflow: Workflow }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [fileGroups, setFileGroups] = useState<FolderGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [draftSeed, setDraftSeed] = useState<ComposerSeed | null>(null);
  const [previewInput, setPreviewInput] = useState("http://localhost:3001");
  const [previewUrl, setPreviewUrl] = useState("");
  const seedVersionRef = useRef(0);

  const loadWorkspaceData = useCallback(async () => {
    setLoading(true);
    setStatus("");
    try {
      const [projectData, ideaData, files] = await Promise.all([getProjects(), getIdeas(), getFiles()]);
      setProjects(projectData);
      setIdeas(ideaData);
      setFileGroups(files);
      if (!selectedProjectId && projectData.length > 0) {
        setSelectedProjectId(projectData[0].id);
      }
    } catch {
      setStatus("Could not load projects and software inventory.");
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadWorkspaceData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadWorkspaceData]);

  const ideaMap = useMemo(() => Object.fromEntries(ideas.map((idea) => [idea.id, idea])), [ideas]);
  const selectedProject = useMemo(() => projects.find((project) => project.id === selectedProjectId) ?? null, [projects, selectedProjectId]);
  const softwareInventory = useMemo(() => deriveSoftwareInventory(fileGroups), [fileGroups]);
  const coderArtifacts = useMemo(
    () => fileGroups.flatMap((group) => group.files).filter((file) => file.path.startsWith("workspaces/coder/")),
    [fileGroups]
  );

  const loadProjectIntoChat = async (project: Project) => {
    setSelectedProjectId(project.id);
    setStatus("");

    const linkedIdea = project.idea_id ? ideaMap[project.idea_id] : undefined;
    let specContent = "";

    if (project.spec_path) {
      try {
        specContent = await readFile(project.spec_path);
      } catch {
        setStatus("Project loaded, but its spec document could not be read.");
      }
    }

    const parts = [
      `Load this project into the coding session.`,
      `Project: ${project.title}`,
      `Status: ${project.status}`,
      `Description: ${project.description || "No description provided."}`,
    ];

    if (linkedIdea) {
      parts.push(`Linked idea: ${linkedIdea.title}`);
      parts.push(`Idea description: ${linkedIdea.description}`);
    }

    if (project.spec_path) {
      parts.push(`Specification file: ${project.spec_path}`);
    }

    if (specContent.trim()) {
      parts.push("Specification contents:");
      parts.push(specContent.trim());
    }

    if ((project.files || []).length > 0) {
      parts.push(
        `Project files: ${(project.files || []).map((file) => file.name).join(", ")}`
      );
    }

    seedVersionRef.current += 1;
    setDraftSeed({
      id: `${project.id}-${seedVersionRef.current}`,
      text: parts.join("\n\n"),
    });
  };

  const handleSavedPath = () => {
    loadWorkspaceData();
  };

  return (
    <div className="h-screen flex flex-col xl:flex-row bg-gray-50">
      <section className="w-full xl:w-1/3 min-w-0 border-b xl:border-b-0 xl:border-r border-gray-200 h-[56vh] xl:h-full">
        <ChatInterface workflow={workflow} onSavedPath={handleSavedPath} draftSeed={draftSeed} />
      </section>

      <section className="w-full xl:w-2/3 min-w-0 h-[44vh] xl:h-full flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-semibold text-gray-900">Build Preview</div>
              <div className="text-xs text-gray-500">Preview the app you are building while loading project context into Code Assistant.</div>
            </div>
            <button
              onClick={loadWorkspaceData}
              className="text-xs border border-gray-300 bg-white hover:bg-gray-50 px-3 py-1.5 rounded-lg text-gray-600"
            >
              Refresh
            </button>
          </div>

          <div className="mt-3 flex gap-2 flex-wrap">
            <input
              value={previewInput}
              onChange={(e) => setPreviewInput(e.target.value)}
              className="flex-1 min-w-[240px] border border-gray-300 bg-white text-gray-900 rounded-lg px-3 py-2 text-sm"
              placeholder="http://localhost:3001"
            />
            <button
              onClick={() => setPreviewUrl(previewInput.trim())}
              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg"
            >
              Load Preview
            </button>
            {previewUrl && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-lg"
              >
                Open Tab
              </a>
            )}
          </div>

          {selectedProject && (
            <div className="mt-3 text-xs text-gray-500">
              Loaded project: <span className="font-medium text-gray-700">{selectedProject.title}</span>
            </div>
          )}
        </div>

        <div className="flex-1 grid grid-cols-1 xl:grid-cols-[1.35fr,0.95fr] gap-4 p-4 overflow-hidden">
          <div className="min-h-0 flex flex-col gap-4">
            <div className="min-h-[280px] xl:flex-1 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              {previewUrl ? (
                <iframe
                  title="App preview"
                  src={previewUrl}
                  className="w-full h-full border-0"
                />
              ) : (
                <div className="h-full flex items-center justify-center text-center px-8 text-sm text-gray-400">
                  Enter a local app URL and click Load Preview to see the software you are building here.
                </div>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white shadow-sm flex flex-col min-h-0">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900">Projects</div>
                  <div className="text-xs text-gray-500">Load any project into the chat composer with its linked idea and spec.</div>
                </div>
                {loading && <div className="text-xs text-gray-400">Loading...</div>}
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {!loading && projects.length === 0 && (
                  <div className="text-xs text-gray-400">No projects yet. Create one in the Projects tab.</div>
                )}
                {projects.map((project) => {
                  const linkedIdea = project.idea_id ? ideaMap[project.idea_id] : undefined;
                  const selected = selectedProjectId === project.id;
                  return (
                    <div
                      key={project.id}
                      className={`rounded-xl border p-3 transition-colors ${selected ? "border-indigo-300 bg-indigo-50" : "border-gray-200 bg-white"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">{project.title}</div>
                          <div className="text-xs text-gray-500 mt-1 line-clamp-2">{project.description || "No description"}</div>
                        </div>
                        <button
                          onClick={() => loadProjectIntoChat(project)}
                          className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg shrink-0"
                        >
                          Load
                        </button>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="text-[11px] px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-700">
                          {project.status}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700">
                          Idea: {linkedIdea ? linkedIdea.title : "None"}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded border border-indigo-200 bg-indigo-50 text-indigo-700">
                          Spec: {project.spec_path ? project.spec_path.split("/").pop() : "None"}
                        </span>
                      </div>

                      <div className="mt-2 text-[11px] text-gray-400">Updated {fmtProjectTime(project.updated_at)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex flex-col gap-4">
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm flex flex-col min-h-0">
              <div className="px-4 py-3 border-b border-gray-200">
                <div className="text-sm font-semibold text-gray-900">Created Software</div>
                <div className="text-xs text-gray-500">Apps detected from the `webspace/` folder appear here.</div>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {softwareInventory.length === 0 && (
                  <div className="text-xs text-gray-400">No deployed or scaffolded app folders detected yet.</div>
                )}
                {softwareInventory.map((item) => (
                  <div key={item.name} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <div className="text-sm font-semibold text-gray-900">{item.name}</div>
                    <div className="text-xs text-gray-500 mt-1">{item.fileCount} tracked file{item.fileCount !== 1 ? "s" : ""}</div>
                    <div className="text-[11px] text-gray-400 mt-2 truncate">{item.samplePath}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white shadow-sm flex flex-col min-h-0">
              <div className="px-4 py-3 border-b border-gray-200">
                <div className="text-sm font-semibold text-gray-900">Saved Code Sessions</div>
                <div className="text-xs text-gray-500">Recent files saved by the Code Assistant workflow.</div>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {coderArtifacts.length === 0 && (
                  <div className="text-xs text-gray-400">No saved coder outputs yet.</div>
                )}
                {coderArtifacts.slice(0, 12).map((file) => (
                  <div key={file.path} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                    <div className="text-xs font-medium text-gray-900 truncate">{file.name}</div>
                    <div className="text-[11px] text-gray-400 truncate mt-1">{file.path}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {status && (
          <div className="px-4 pb-4 text-xs text-amber-700">{status}</div>
        )}
      </section>
    </div>
  );
}

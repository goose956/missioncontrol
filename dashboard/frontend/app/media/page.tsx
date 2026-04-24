"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  API,
  MediaConfig,
  MediaEvent,
  MediaFileEntry,
  MediaHighlight,
  MediaStatus,
  MediaThumbnailItem,
  ScreenpipeTestResult,
  extractMediaHighlights,
  generateMediaThumbnails,
  getMediaConfig,
  getMediaHighlights,
  getMediaIndex,
  getMediaStatus,
  getMediaThumbnails,
  getMediaTimeline,
  openArtifactPath,
  openMediaPath,
  refreshMediaIndex,
  testScreenpipeConnection,
  updateMediaConfig,
} from "@/lib/api";

const FILTER_STORAGE_KEY = "media-page-filters-v1";
const AUTO_REFRESH_STORAGE_KEY = "media-page-auto-refresh-enabled";
const AUTO_REFRESH_INTERVAL_MS = 30000;

function formatBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = n;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
}

function fmtDuration(seconds?: number | null): string {
  if (!seconds) return "-";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function exportCsv(files: MediaFileEntry[]) {
  const rows = [
    ["Name", "Path", "DurationSeconds", "Width", "Height", "Codec", "SizeBytes", "Modified"],
    ...files.map((f) => [
      f.name,
      f.path,
      String(f.duration_seconds ?? ""),
      String(f.width ?? ""),
      String(f.height ?? ""),
      String(f.codec ?? ""),
      String(f.size_bytes),
      f.modified,
    ]),
  ];

  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `media_index_${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function eventLabel(e: MediaEvent): string {
  const payload = e.payload || {};
  if (e.type === "workflow_save") {
    const wf = typeof payload.workflow_id === "string" ? payload.workflow_id : "workflow";
    return `Workflow save (${wf})`;
  }
  if (e.type === "media_index_refresh") return "Media index refreshed";
  if (e.type === "highlights_extract") return "Highlights extracted";
  if (e.type === "thumbnails_generate") return "Thumbnails generated";
  return e.type;
}

function eventDetails(e: MediaEvent): string | null {
  const payload = e.payload || {};
  if (e.type === "workflow_save") {
    const fileName = typeof payload.file_name === "string" ? payload.file_name : null;
    return fileName ? `Saved ${fileName}` : null;
  }
  if (e.type === "media_index_refresh") {
    const count = typeof payload.count === "number" ? payload.count : null;
    return count !== null ? `${count} indexed files` : null;
  }
  if (e.type === "highlights_extract") {
    const selected = typeof payload.selected === "number" ? payload.selected : null;
    const topN = typeof payload.top_n === "number" ? payload.top_n : null;
    return selected !== null && topN !== null ? `${selected} of ${topN} candidates selected` : null;
  }
  if (e.type === "thumbnails_generate") {
    const ok = typeof payload.ok === "number" ? payload.ok : null;
    const attempted = typeof payload.attempted === "number" ? payload.attempted : null;
    return ok !== null && attempted !== null ? `${ok}/${attempted} thumbnails ready` : null;
  }
  return null;
}

export default function MediaPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [setupRunning, setSetupRunning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [generatingThumbs, setGeneratingThumbs] = useState(false);
  const [statusText, setStatusText] = useState("");

  const [screenpipeDir, setScreenpipeDir] = useState("");
  const [screenpipeApiUrl, setScreenpipeApiUrl] = useState("http://localhost:3030");
  const [externalDirsInput, setExternalDirsInput] = useState("");
  const [autoIndexOnStart, setAutoIndexOnStart] = useState(false);

  const [indexUpdatedAt, setIndexUpdatedAt] = useState<string | null>(null);
  const [files, setFiles] = useState<MediaFileEntry[]>([]);
  const [highlights, setHighlights] = useState<MediaHighlight[]>([]);
  const [events, setEvents] = useState<MediaEvent[]>([]);
  const [eventCatalog, setEventCatalog] = useState<MediaEvent[]>([]);
  const [thumbnails, setThumbnails] = useState<MediaThumbnailItem[]>([]);
  const [ffmpegAvailable, setFfmpegAvailable] = useState(false);
  const [mediaStatus, setMediaStatus] = useState<MediaStatus | null>(null);
  const [screenpipeTestResult, setScreenpipeTestResult] = useState<ScreenpipeTestResult | null>(null);

  const [stats, setStats] = useState<{ count: number; total_size_bytes: number; indexed_dirs: string[]; pymediainfo_enabled?: boolean }>({
    count: 0,
    total_size_bytes: 0,
    indexed_dirs: [],
    pymediainfo_enabled: false,
  });

  const [query, setQuery] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(`${FILTER_STORAGE_KEY}:query`) || "";
  });
  const [minDurationFilter, setMinDurationFilter] = useState(() => {
    if (typeof window === "undefined") return 0;
    const value = Number(window.localStorage.getItem(`${FILTER_STORAGE_KEY}:minDuration`) || "0");
    return Number.isFinite(value) ? value : 0;
  });
  const [timelineEventType, setTimelineEventType] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(`${FILTER_STORAGE_KEY}:timelineEventType`) || "";
  });
  const [timelineWorkflowId, setTimelineWorkflowId] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(`${FILTER_STORAGE_KEY}:timelineWorkflowId`) || "";
  });
  const [highlightWorkflowId, setHighlightWorkflowId] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(`${FILTER_STORAGE_KEY}:highlightWorkflowId`) || "";
  });
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    const raw = window.localStorage.getItem(AUTO_REFRESH_STORAGE_KEY);
    return raw === null ? true : raw === "true";
  });
  const [autoRefreshing, setAutoRefreshing] = useState(false);
  const [lastAutoRefreshAt, setLastAutoRefreshAt] = useState<string | null>(null);

  const thumbnailMap = useMemo(
    () => new Map(thumbnails.filter((t) => t.ok && t.thumbnail_path).map((t) => [t.source_path, t.thumbnail_path as string])),
    [thumbnails],
  );

  const externalDirs = useMemo(
    () => externalDirsInput.split("\n").map((d) => d.trim()).filter(Boolean),
    [externalDirsInput],
  );

  const filteredFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter((f) => {
      const duration = f.duration_seconds || 0;
      if (duration < minDurationFilter) return false;
      if (!q) return true;
      return f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q) || (f.codec || "").toLowerCase().includes(q);
    });
  }, [files, minDurationFilter, query]);

  const workflowIds = useMemo(() => {
    const values = new Set<string>();
    for (const event of eventCatalog) {
      const workflowId = event.payload?.workflow_id;
      if (typeof workflowId === "string" && workflowId.trim()) values.add(workflowId);
    }
    return Array.from(values).sort();
  }, [eventCatalog]);

  const groupedEvents = useMemo(() => {
    const groups: Array<{ label: string; items: MediaEvent[] }> = [];
    const index = new Map<string, number>();

    for (const event of events) {
      const label = new Date(event.timestamp).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const existing = index.get(label);
      if (existing === undefined) {
        index.set(label, groups.length);
        groups.push({ label, items: [event] });
      } else {
        groups[existing].items.push(event);
      }
    }

    return groups;
  }, [events]);

  const setupChecklist = useMemo(() => {
    const captureFolderConfigured = Boolean(screenpipeDir.trim());
    const captureFolderExists = Boolean(screenpipeTestResult?.data_dir_exists);
    const apiReachable = Boolean(screenpipeTestResult?.api_ok);
    const hasIndexedCaptures = stats.count > 0;

    return [
      {
        key: "folder-configured",
        label: "Capture folder configured",
        done: captureFolderConfigured,
        hint: captureFolderConfigured ? screenpipeDir.trim() : "Set the Screenpipe data directory.",
      },
      {
        key: "folder-exists",
        label: "Capture folder exists",
        done: captureFolderExists,
        hint: captureFolderConfigured ? (captureFolderExists ? "Folder found on disk." : "Folder path does not exist yet.") : "Cannot verify until a folder is configured.",
      },
      {
        key: "api-reachable",
        label: "Screenpipe reachable",
        done: apiReachable,
        hint: screenpipeTestResult ? (apiReachable ? `Connected at ${screenpipeTestResult.api_url}` : `Not reachable at ${screenpipeTestResult.api_url}`) : "Run a setup check to verify the recorder.",
      },
      {
        key: "captures-indexed",
        label: "Captures found",
        done: hasIndexedCaptures,
        hint: hasIndexedCaptures ? `${stats.count} indexed media files available.` : "No recordings indexed yet. Record in Screenpipe, then refresh index.",
      },
    ];
  }, [screenpipeDir, screenpipeTestResult, stats.count]);

  const setupReadyCount = setupChecklist.filter((item) => item.done).length;
  const noCapturesYet = Boolean(screenpipeTestResult?.api_ok && screenpipeTestResult?.data_dir_exists && stats.count === 0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(`${FILTER_STORAGE_KEY}:query`, query);
    window.localStorage.setItem(`${FILTER_STORAGE_KEY}:minDuration`, String(minDurationFilter));
    window.localStorage.setItem(`${FILTER_STORAGE_KEY}:timelineEventType`, timelineEventType);
    window.localStorage.setItem(`${FILTER_STORAGE_KEY}:timelineWorkflowId`, timelineWorkflowId);
    window.localStorage.setItem(`${FILTER_STORAGE_KEY}:highlightWorkflowId`, highlightWorkflowId);
  }, [highlightWorkflowId, minDurationFilter, query, timelineEventType, timelineWorkflowId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, String(autoRefreshEnabled));
  }, [autoRefreshEnabled]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setStatusText("");
    try {
      const [cfg, idx, st, hl, tl, th, timelineCatalogResult] = await Promise.all([
        getMediaConfig(),
        getMediaIndex(),
        getMediaStatus(),
        getMediaHighlights(),
        getMediaTimeline(200, {
          eventType: timelineEventType || undefined,
          workflowId: timelineWorkflowId || undefined,
        }),
        getMediaThumbnails(),
        getMediaTimeline(500),
      ]);
      setScreenpipeDir(cfg.screenpipe_data_dir || "");
      setScreenpipeApiUrl(cfg.screenpipe_api_url || "http://localhost:3030");
      setExternalDirsInput((cfg.external_media_dirs || []).join("\n"));
      setAutoIndexOnStart(Boolean(cfg.auto_index_on_start));
      setMediaStatus(st);

      setFiles(idx.media_files || []);
      setStats({
        count: idx.stats?.count || 0,
        total_size_bytes: idx.stats?.total_size_bytes || 0,
        indexed_dirs: idx.stats?.indexed_dirs || [],
        pymediainfo_enabled: idx.stats?.pymediainfo_enabled,
      });
      setIndexUpdatedAt(idx.updated_at || null);
      setHighlights(hl.items || []);
      setEvents(tl.items || []);
      setEventCatalog(timelineCatalogResult.items || []);
      setThumbnails(th.items || []);
      setFfmpegAvailable(Boolean(th.ffmpeg_available));

      if (!st.configured) {
        setStatusText("Configure Screenpipe and media folders, then click Refresh Index.");
      }
    } catch (e) {
      setStatusText(e instanceof Error ? e.message : "Failed to load media config");
    } finally {
      setLoading(false);
    }
  }, [timelineEventType, timelineWorkflowId]);

  const refreshDerivedState = useCallback(async () => {
    const [statusResult, testResult, timeline, timelineCatalogResult] = await Promise.all([
      getMediaStatus(),
      testScreenpipeConnection(),
      getMediaTimeline(200, {
        eventType: timelineEventType || undefined,
        workflowId: timelineWorkflowId || undefined,
      }),
      getMediaTimeline(500),
    ]);
    setMediaStatus(statusResult);
    setScreenpipeTestResult(testResult);
    setEvents(timeline.items || []);
    setEventCatalog(timelineCatalogResult.items || []);
  }, [timelineEventType, timelineWorkflowId]);

  const autoRefreshIndex = useCallback(async () => {
    if (!screenpipeDir.trim() && externalDirs.length === 0) return;
    if (document.visibilityState !== "visible") return;
    if (saving || setupRunning || refreshing || extracting || generatingThumbs || testing || loading) return;

    setAutoRefreshing(true);
    try {
      const idx = await refreshMediaIndex(3000);
      setFiles(idx.media_files || []);
      setStats({
        count: idx.stats?.count || 0,
        total_size_bytes: idx.stats?.total_size_bytes || 0,
        indexed_dirs: idx.stats?.indexed_dirs || [],
        pymediainfo_enabled: idx.stats?.pymediainfo_enabled,
      });
      setIndexUpdatedAt(idx.updated_at || null);
      await refreshDerivedState();
      setLastAutoRefreshAt(new Date().toISOString());
    } catch {
      // Keep silent during background polling; explicit actions still report errors.
    } finally {
      setAutoRefreshing(false);
    }
  }, [externalDirs.length, extracting, generatingThumbs, loading, refreshDerivedState, refreshing, saving, screenpipeDir, setupRunning, testing]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadAll();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadAll]);

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    const intervalId = window.setInterval(() => {
      void autoRefreshIndex();
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [autoRefreshEnabled, autoRefreshIndex]);

  const saveConfig = async () => {
    setSaving(true);
    setStatusText("");
    const payload: Omit<MediaConfig, "updated_at"> = {
      screenpipe_data_dir: screenpipeDir.trim(),
      screenpipe_api_url: screenpipeApiUrl.trim() || "http://localhost:3030",
      external_media_dirs: externalDirs,
      auto_index_on_start: autoIndexOnStart,
    };
    try {
      await updateMediaConfig(payload);
      setStatusText("Media config saved.");
      await loadAll();
      await refreshDerivedState();
    } catch (e) {
      setStatusText(e instanceof Error ? e.message : "Failed to save config");
    } finally {
      setSaving(false);
    }
  };

  const refreshIndex = async () => {
    setRefreshing(true);
    setStatusText("");
    try {
      const idx = await refreshMediaIndex(3000);
      setFiles(idx.media_files || []);
      setStats({
        count: idx.stats?.count || 0,
        total_size_bytes: idx.stats?.total_size_bytes || 0,
        indexed_dirs: idx.stats?.indexed_dirs || [],
        pymediainfo_enabled: idx.stats?.pymediainfo_enabled,
      });
      setIndexUpdatedAt(idx.updated_at || null);
      setStatusText("Media index refreshed.");
      const [timeline, timelineCatalogResult] = await Promise.all([
        getMediaTimeline(200, {
          eventType: timelineEventType || undefined,
          workflowId: timelineWorkflowId || undefined,
        }),
        getMediaTimeline(500),
      ]);
      setEvents(timeline.items || []);
      setEventCatalog(timelineCatalogResult.items || []);
    } catch (e) {
      setStatusText(e instanceof Error ? e.message : "Failed to refresh index");
    } finally {
      setRefreshing(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setStatusText("");
    try {
      const result = await testScreenpipeConnection();
      setScreenpipeTestResult(result);
      const apiState = result.api_ok ? "API reachable" : `API not reachable (${result.api_error || "unknown"})`;
      const dirState = result.data_dir ? (result.data_dir_exists ? "data dir exists" : "data dir missing") : "data dir not set";
      setStatusText(`Screenpipe test: ${apiState}; ${dirState}.`);
    } catch (e) {
      setStatusText(e instanceof Error ? e.message : "Screenpipe test failed");
    } finally {
      setTesting(false);
    }
  };

  const saveConfigPayload = (): Omit<MediaConfig, "updated_at"> => ({
    screenpipe_data_dir: screenpipeDir.trim(),
    screenpipe_api_url: screenpipeApiUrl.trim() || "http://localhost:3030",
    external_media_dirs: externalDirs,
    auto_index_on_start: autoIndexOnStart,
  });

  const runSetupCheck = async () => {
    setSetupRunning(true);
    setStatusText("");
    try {
      await updateMediaConfig(saveConfigPayload());
      const result = await testScreenpipeConnection();
      setScreenpipeTestResult(result);
      const idx = await refreshMediaIndex(3000);
      setFiles(idx.media_files || []);
      setStats({
        count: idx.stats?.count || 0,
        total_size_bytes: idx.stats?.total_size_bytes || 0,
        indexed_dirs: idx.stats?.indexed_dirs || [],
        pymediainfo_enabled: idx.stats?.pymediainfo_enabled,
      });
      setIndexUpdatedAt(idx.updated_at || null);
      const [statusResult, timeline, timelineCatalogResult] = await Promise.all([
        getMediaStatus(),
        getMediaTimeline(200, {
          eventType: timelineEventType || undefined,
          workflowId: timelineWorkflowId || undefined,
        }),
        getMediaTimeline(500),
      ]);
      setMediaStatus(statusResult);
      setScreenpipeTestResult(result);
      setEvents(timeline.items || []);
      setEventCatalog(timelineCatalogResult.items || []);

      if (result.api_ok && result.data_dir_exists && (idx.stats?.count || 0) > 0) {
        setStatusText("Recorder check passed. Screenpipe is reachable and captures were indexed.");
      } else if (result.api_ok && result.data_dir_exists) {
        setStatusText("Recorder check passed, but no captures were indexed yet. Start recording in Screenpipe and run Refresh Index again.");
      } else {
        setStatusText("Recorder check completed. Review the checklist below to see what is still missing.");
      }
    } catch (e) {
      setStatusText(e instanceof Error ? e.message : "Failed to run setup check");
    } finally {
      setSetupRunning(false);
    }
  };

  const extractHighlights = async () => {
    setExtracting(true);
    setStatusText("");
    try {
      const result = await extractMediaHighlights(20, 20, highlightWorkflowId || undefined);
      setHighlights(result.items || []);
      setStatusText("Highlights extracted from current index.");
      const [timeline, timelineCatalogResult] = await Promise.all([
        getMediaTimeline(200, {
          eventType: timelineEventType || undefined,
          workflowId: timelineWorkflowId || undefined,
        }),
        getMediaTimeline(500),
      ]);
      setEvents(timeline.items || []);
      setEventCatalog(timelineCatalogResult.items || []);
    } catch (e) {
      setStatusText(e instanceof Error ? e.message : "Failed to extract highlights");
    } finally {
      setExtracting(false);
    }
  };

  const generateThumbs = async () => {
    setGeneratingThumbs(true);
    setStatusText("");
    try {
      const result = await generateMediaThumbnails(50);
      setThumbnails(result.items || []);
      setFfmpegAvailable(Boolean(result.ffmpeg_available));
      setStatusText("Thumbnails generated or refreshed.");
      const [timeline, timelineCatalogResult] = await Promise.all([
        getMediaTimeline(200, {
          eventType: timelineEventType || undefined,
          workflowId: timelineWorkflowId || undefined,
        }),
        getMediaTimeline(500),
      ]);
      setEvents(timeline.items || []);
      setEventCatalog(timelineCatalogResult.items || []);
    } catch (e) {
      setStatusText(e instanceof Error ? e.message : "Failed to generate thumbnails");
    } finally {
      setGeneratingThumbs(false);
    }
  };

  const openPathAction = async (path: string, target: "file" | "folder") => {
    setStatusText("");
    try {
      await openMediaPath(path, target);
      setStatusText(`Opened ${target}: ${path}`);
    } catch (e) {
      setStatusText(e instanceof Error ? e.message : `Failed to open ${target}`);
    }
  };

  const openArtifactAction = async (path: string, target: "file" | "folder") => {
    setStatusText("");
    try {
      await openArtifactPath(path, target);
      setStatusText(`Opened ${target}: ${path}`);
    } catch (e) {
      setStatusText(e instanceof Error ? e.message : `Failed to open ${target}`);
    }
  };

  const openConfiguredCaptureFolder = async () => {
    if (!screenpipeDir.trim()) {
      setStatusText("Set a Screenpipe data directory first.");
      return;
    }
    await openPathAction(screenpipeDir.trim(), "folder");
  };

  const openScreenpipeUrl = () => {
    const target = screenpipeApiUrl.trim() || "http://localhost:3030";
    window.open(target, "_blank", "noopener,noreferrer");
  };

  const recommendationText = useMemo(() => {
    if (!screenpipeDir.trim()) return "Set the Screenpipe data directory first.";
    if (!screenpipeTestResult) return "Run Setup Check to verify Screenpipe and index any existing captures.";
    if (!screenpipeTestResult.api_ok) return "Start Screenpipe, then run Setup Check again.";
    if (!screenpipeTestResult.data_dir_exists) return "Fix the capture folder path so Screenpipe and the dashboard point to the same location.";
    if (stats.count === 0) return autoRefreshEnabled
      ? "You are connected, but no captures are indexed yet. Start recording in Screenpipe and this page will keep checking automatically."
      : "You are connected, but no captures are indexed yet. Start recording in Screenpipe, then refresh the index.";
    return "Recording pipeline looks healthy. Capture in Screenpipe, then use this page for indexing, highlights, and review.";
  }, [autoRefreshEnabled, screenpipeDir, screenpipeTestResult, stats.count]);

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      <div className="px-6 py-4 border-b border-gray-200 bg-white">
        <div className="text-sm font-semibold text-gray-900">Media Capture</div>
        <div className="text-xs text-gray-500">Screenpipe + external drive indexing, milestones timeline, and optional thumbnail generation.</div>
      </div>

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-[460px,1fr] gap-4 p-4 min-h-0">
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 overflow-y-auto">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-amber-900">How this works</div>
                <div className="text-xs text-amber-800 mt-1">This page does not start or stop recording yet. Recording is expected to happen in Screenpipe itself, and this dashboard then indexes, searches, and links those captures to workflow events.</div>
              </div>
              <div className="text-[10px] px-2 py-1 rounded-full border border-amber-300 bg-white text-amber-800 whitespace-nowrap">No record button yet</div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] text-amber-900">
              <div>1. Run Screenpipe separately so it writes captures into your Screenpipe data directory.</div>
              <div>2. Point this page at that folder, then click Test Screenpipe and Refresh Index.</div>
              <div>3. Use highlights, thumbnails, and timeline filters here after recordings exist.</div>
            </div>
            <div className="mt-3 flex gap-2 flex-wrap">
              <button onClick={runSetupCheck} disabled={setupRunning} className="text-xs px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white">
                {setupRunning ? "Checking..." : "Setup Check"}
              </button>
              <button onClick={openConfiguredCaptureFolder} disabled={!screenpipeDir.trim()} className="text-xs px-3 py-2 rounded-lg border border-amber-300 bg-white hover:bg-amber-100 disabled:opacity-40 text-amber-900">
                Open Capture Folder
              </button>
              <button onClick={openScreenpipeUrl} className="text-xs px-3 py-2 rounded-lg border border-amber-300 bg-white hover:bg-amber-100 text-amber-900">
                Open Screenpipe
              </button>
              <button onClick={testConnection} disabled={testing} className="text-xs px-3 py-2 rounded-lg border border-amber-300 bg-white hover:bg-amber-100 disabled:opacity-40 text-amber-900">
                {testing ? "Testing..." : "Check Screenpipe Connection"}
              </button>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {setupChecklist.map((item) => (
                <div key={item.key} className={`rounded-lg border px-3 py-2 ${item.done ? "border-emerald-200 bg-emerald-50" : "border-white/70 bg-white/70"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-gray-900">{item.label}</div>
                    <div className={`text-[10px] px-2 py-1 rounded-full ${item.done ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-700"}`}>{item.done ? "Ready" : "Pending"}</div>
                  </div>
                  <div className="text-[11px] text-gray-600 mt-1">{item.hint}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg border border-white/80 bg-white/80 px-3 py-2">
              <div className="text-[11px] font-semibold text-gray-800">Recording Readiness</div>
              <div className="text-xs text-gray-700 mt-1">{setupReadyCount}/4 checks ready. {recommendationText}</div>
            </div>
            {noCapturesYet && (
              <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-3">
                <div className="text-xs font-semibold text-sky-900">Screenpipe is connected, but no captures have been found yet.</div>
                <div className="text-[11px] text-sky-800 mt-1">That usually means Screenpipe is running but has not produced recordings in the configured folder yet. Start recording there, then this page will {autoRefreshEnabled ? "pick up new captures automatically" : "show them after you refresh the index"}.</div>
              </div>
            )}
          </div>

          <div className="text-sm font-semibold text-gray-900 mb-3">Capture Sources</div>

          <label className="block text-xs font-medium text-gray-600 mb-1">Screenpipe Data Directory</label>
          <input
            value={screenpipeDir}
            onChange={(e) => setScreenpipeDir(e.target.value)}
            placeholder="D:\\screenpipe-data"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white"
          />

          <label className="block text-xs font-medium text-gray-600 mt-3 mb-1">Screenpipe API URL</label>
          <input
            value={screenpipeApiUrl}
            onChange={(e) => setScreenpipeApiUrl(e.target.value)}
            placeholder="http://localhost:3030"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white"
          />

          <label className="block text-xs font-medium text-gray-600 mt-4 mb-1">External Media Directories (one per line)</label>
          <textarea
            value={externalDirsInput}
            onChange={(e) => setExternalDirsInput(e.target.value)}
            rows={5}
            placeholder={"E:\\YouTube\nF:\\RawCapture"}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white"
          />

          <label className="mt-3 flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={autoIndexOnStart}
              onChange={(e) => setAutoIndexOnStart(e.target.checked)}
              className="accent-indigo-600"
            />
            Auto-index on backend startup (config flag)
          </label>

          <div className="mt-4 flex gap-2 flex-wrap">
            <button onClick={saveConfig} disabled={saving} className="text-xs px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white">
              {saving ? "Saving..." : "Save Config"}
            </button>
            <button onClick={testConnection} disabled={testing} className="text-xs px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-800 disabled:opacity-40 text-white">
              {testing ? "Testing..." : "Test Screenpipe"}
            </button>
            <button onClick={refreshIndex} disabled={refreshing} className="text-xs px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white">
              {refreshing ? "Indexing..." : "Refresh Index"}
            </button>
            <button onClick={extractHighlights} disabled={extracting} className="text-xs px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white">
              {extracting ? "Extracting..." : "Extract Highlights"}
            </button>
            <button onClick={generateThumbs} disabled={generatingThumbs || !ffmpegAvailable} className="text-xs px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:opacity-40 text-white">
              {generatingThumbs ? "Generating..." : ffmpegAvailable ? "Generate Thumbnails" : "ffmpeg Required"}
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <div className="text-[11px] font-semibold text-gray-700">API</div>
              <div className={`text-xs mt-1 ${screenpipeTestResult?.api_ok ? "text-emerald-700" : "text-gray-500"}`}>{screenpipeTestResult ? (screenpipeTestResult.api_ok ? "Connected" : "Not reachable") : "Not checked"}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <div className="text-[11px] font-semibold text-gray-700">Index</div>
              <div className={`text-xs mt-1 ${(mediaStatus?.stats?.count || 0) > 0 ? "text-emerald-700" : "text-gray-500"}`}>{(mediaStatus?.stats?.count || 0) > 0 ? `${mediaStatus?.stats?.count} files indexed` : "No captures indexed"}</div>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold text-gray-700">Auto Refresh Index</div>
                <div className="text-xs text-gray-500 mt-1">Re-scan the configured capture folders every 30 seconds while this page is open.</div>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={autoRefreshEnabled}
                  onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
                  className="accent-indigo-600"
                />
                Enabled
              </label>
            </div>
            <div className="text-[11px] text-gray-500 mt-2">
              {autoRefreshing ? "Checking for new captures..." : lastAutoRefreshAt ? `Last automatic refresh: ${new Date(lastAutoRefreshAt).toLocaleTimeString()}` : "Automatic refresh has not run yet in this session."}
            </div>
          </div>

          <div className="mt-5 border-t border-gray-100 pt-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="text-xs font-semibold text-gray-700">Highlight Candidates</div>
              <select value={highlightWorkflowId} onChange={(e) => setHighlightWorkflowId(e.target.value)} className="border border-gray-300 rounded-md px-2 py-1 text-[11px] text-gray-800 bg-white">
                <option value="">All workflows</option>
                {workflowIds.map((workflowId) => (
                  <option key={workflowId} value={workflowId}>{workflowId}</option>
                ))}
              </select>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-2">
              {highlights.length === 0 && <div className="text-xs text-gray-400">No highlights extracted yet.</div>}
              {highlights.map((item) => (
                <div key={`${item.path}-${item.modified}`} className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                  <div className="text-xs font-medium text-gray-800 truncate" title={item.path}>{item.name}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{fmtDuration(item.duration_seconds)} • {item.reason}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 border-t border-gray-100 pt-4">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <div className="text-xs font-semibold text-gray-700">Timeline</div>
              <select value={timelineEventType} onChange={(e) => setTimelineEventType(e.target.value)} className="border border-gray-300 rounded-md px-2 py-1 text-[11px] text-gray-800 bg-white">
                <option value="">All events</option>
                <option value="workflow_save">workflow_save</option>
                <option value="media_index_refresh">media_index_refresh</option>
                <option value="highlights_extract">highlights_extract</option>
                <option value="thumbnails_generate">thumbnails_generate</option>
              </select>
              <select value={timelineWorkflowId} onChange={(e) => setTimelineWorkflowId(e.target.value)} className="border border-gray-300 rounded-md px-2 py-1 text-[11px] text-gray-800 bg-white">
                <option value="">All workflows</option>
                {workflowIds.map((workflowId) => (
                  <option key={workflowId} value={workflowId}>{workflowId}</option>
                ))}
              </select>
              <button onClick={() => {
                setTimelineEventType("");
                setTimelineWorkflowId("");
              }} className="text-[11px] px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700">Clear Filters</button>
            </div>
            <div className="max-h-44 overflow-y-auto space-y-2">
              {events.length === 0 && <div className="text-xs text-gray-400">No timeline events yet.</div>}
              {groupedEvents.map((group) => (
                <div key={group.label} className="space-y-2">
                  <div className="sticky top-0 z-10 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 bg-white/95 py-1">{group.label}</div>
                  {group.items.map((event, idx) => (
                    <div key={`${event.timestamp}-${idx}`} className="rounded-lg border border-gray-200 bg-white p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-medium text-gray-800">{eventLabel(event)}</div>
                          <div className="text-[11px] text-gray-500 mt-0.5">{new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                        </div>
                        {typeof event.payload?.workflow_id === "string" && event.payload.workflow_id && (
                          <div className="text-[10px] px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">{event.payload.workflow_id}</div>
                        )}
                      </div>
                      {eventDetails(event) && <div className="mt-1 text-[11px] text-gray-600">{eventDetails(event)}</div>}
                      {typeof event.payload?.saved_path === "string" && (
                        <div className="mt-2 flex gap-1">
                          <button onClick={() => openArtifactAction(event.payload.saved_path as string, "file")} className="text-[11px] px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700">Open Artifact</button>
                          <button onClick={() => openArtifactAction(event.payload.saved_path as string, "folder")} className="text-[11px] px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700">Open Artifact Folder</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {statusText && <div className="mt-3 text-xs text-amber-700">{statusText}</div>}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden min-h-0 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200 bg-white">
            <div className="text-sm font-semibold text-gray-900">Indexed Media</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {loading ? "Loading..." : `${stats.count} files • ${formatBytes(stats.total_size_bytes)} • Metadata parser ${stats.pymediainfo_enabled ? "enabled" : "disabled"}`}
            </div>
            <div className="text-[11px] text-gray-400 mt-1">Last index: {indexUpdatedAt ? new Date(indexUpdatedAt).toLocaleString() : "Never"}</div>
          </div>

          <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 flex flex-wrap items-center gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name/path/codec" className="border border-gray-300 rounded-md px-2 py-1 text-xs text-gray-800 bg-white min-w-[220px]" />
            <select value={String(minDurationFilter)} onChange={(e) => setMinDurationFilter(Number(e.target.value))} className="border border-gray-300 rounded-md px-2 py-1 text-xs text-gray-800 bg-white">
              <option value="0">Any duration</option>
              <option value="30">30s+</option>
              <option value="60">1m+</option>
              <option value="300">5m+</option>
              <option value="600">10m+</option>
            </select>
            <button onClick={() => exportCsv(filteredFiles)} className="text-xs px-2.5 py-1 rounded-md border border-gray-300 bg-white hover:bg-gray-100 text-gray-700">Export CSV</button>
          </div>

          <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500">
            Indexed dirs: {stats.indexed_dirs.length ? stats.indexed_dirs.join(" | ") : "None"}
          </div>

          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white border-b border-gray-200 text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2">Preview</th>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Duration</th>
                  <th className="text-left px-3 py-2">Resolution</th>
                  <th className="text-left px-3 py-2">Size</th>
                  <th className="text-left px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.length === 0 && !loading && (
                  <tr>
                    <td className="px-3 py-4 text-gray-400" colSpan={6}>No matching media files.</td>
                  </tr>
                )}
                {filteredFiles.map((file) => {
                  const thumb = thumbnailMap.get(file.path);
                  return (
                    <tr key={file.path} className="border-b border-gray-100">
                      <td className="px-3 py-2">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`${API}/api/files/raw?path=${encodeURIComponent(thumb)}`}
                            alt={file.name}
                            className="w-20 h-12 object-cover rounded border border-gray-200"
                          />
                        ) : (
                          <div className="w-20 h-12 rounded border border-gray-200 bg-gray-100 text-[10px] text-gray-400 flex items-center justify-center">No thumb</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-gray-800 font-medium truncate max-w-[360px]" title={file.path}>{file.name}</div>
                        <div className="text-gray-400 truncate max-w-[360px]" title={file.path}>{file.path}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">{new Date(file.modified).toLocaleString()} • {file.codec || "unknown codec"}</div>
                      </td>
                      <td className="px-3 py-2 text-gray-600">{fmtDuration(file.duration_seconds)}</td>
                      <td className="px-3 py-2 text-gray-600">{file.width && file.height ? `${file.width}x${file.height}` : "-"}</td>
                      <td className="px-3 py-2 text-gray-600">{formatBytes(file.size_bytes)}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button onClick={() => openPathAction(file.path, "file")} className="text-[11px] px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700">Open File</button>
                          <button onClick={() => openPathAction(file.path, "folder")} className="text-[11px] px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700">Open Folder</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

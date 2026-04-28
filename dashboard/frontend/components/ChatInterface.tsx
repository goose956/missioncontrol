"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { Workflow, API, getIdeas, Idea } from "@/lib/api";
import MarkdownRenderer from "./MarkdownRenderer";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AttachedFile {
  name: string;
  content: string;
}

interface ChatInterfaceProps {
  workflow: Workflow;
  onSavedPath?: (path: string) => void;
  draftSeed?: {
    id: string;
    text: string;
  } | null;
}

export default function ChatInterface({ workflow, onSavedPath, draftSeed }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [showIdeasMenu, setShowIdeasMenu] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ideasMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  // Load ideas for the picker (silently — don't block if backend is slow)
  useEffect(() => {
    getIdeas().then(setIdeas).catch(() => {});
  }, []);

  useEffect(() => {
    if (!draftSeed) return;
    const timer = setTimeout(() => {
      setInput(draftSeed.text);
      textareaRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [draftSeed]);

  // Close ideas dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ideasMenuRef.current && !ideasMenuRef.current.contains(e.target as Node)) {
        setShowIdeasMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAttachedFile({ name: file.name, content: ev.target?.result as string ?? "" });
    };
    reader.readAsText(file);
    // Reset so the same file can be re-selected
    e.target.value = "";
  };

  const pickIdea = (idea: Idea) => {
    setInput(`${idea.title}\n\n${idea.description}`);
    setShowIdeasMenu(false);
    textareaRef.current?.focus();
  };

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    // Build the message content — include file content if attached
    const messageContent = attachedFile
      ? `[Attached: ${attachedFile.name}]\n\n${attachedFile.content}\n\n---\n\n${text}`
      : text;

    // Display label shown to the user (just their typed text + filename hint)
    const displayContent = attachedFile
      ? `📎 ${attachedFile.name}\n\n${text}`
      : text;

    const userMsg: Message = { role: "user", content: displayContent };
    const apiMsg: Message = { role: "user", content: messageContent };
    const nextMessages = [...messages, userMsg];
    const apiMessages = [...messages, apiMsg];

    setMessages(nextMessages);
    setInput("");
    setAttachedFile(null);
    setSavedPath(null);
    setStreaming(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch(`${API}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflow_id: workflow.id,
          messages: apiMessages,
          save: true,
        }),
      });

      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader = res.body.getReader();
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
          const json = line.slice(6).trim();
          if (!json) continue;
          try {
            const event = JSON.parse(json);
            if (event.type === "text") {
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: updated[updated.length - 1].content + event.text,
                };
                return updated;
              });
            } else if (event.type === "saved") {
              setSavedPath(event.path);
              onSavedPath?.(event.path);
            }
          } catch { /* ignore malformed SSE */ }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
        };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  }, [input, messages, streaming, workflow.id, attachedFile, onSavedPath]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setSavedPath(null);
    setAttachedFile(null);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xl">{workflow.icon}</span>
          <div>
            <div className="text-sm font-semibold text-gray-900">{workflow.name}</div>
            <div className="text-xs text-gray-500">{workflow.description}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {savedPath && (
            <span className="text-xs text-emerald-600">
              ✓ saved → <span className="font-mono">{savedPath}</span>
            </span>
          )}
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-4xl mb-4">{workflow.icon}</div>
            <div className="text-gray-500 text-sm max-w-sm">
              {workflow.description}
              <br />
              <span className="text-gray-400 text-xs mt-2 block">
                Outputs saved to <code>{workflow.output_folder}/</code>
              </span>
            </div>
            {ideas.length > 0 && (
              <div className="mt-4 text-xs text-gray-400">
                💡 Use the <span className="font-medium text-indigo-500">From Ideas</span> button below to import a saved idea
              </div>
            )}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-sm shrink-0 mt-0.5">
                {workflow.icon}
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "bg-white border border-gray-200 text-gray-800 shadow-sm"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="prose-dark">
                  <MarkdownRenderer content={msg.content} />
                  {streaming && i === messages.length - 1 && (
                    <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-middle" />
                  )}
                </div>
              ) : (
                <div className="whitespace-pre-wrap">{msg.content}</div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="px-6 py-4 border-t border-gray-200 bg-white shrink-0">

        {/* Toolbar: attach + ideas */}
        <div className="flex items-center gap-2 mb-2">
          {/* File attach */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.csv,.json,.yaml,.yml"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 hover:border-gray-400 bg-gray-50 hover:bg-white px-2.5 py-1.5 rounded-lg transition-colors"
            title="Attach a text file"
          >
            <span>📎</span>
            <span>Attach file</span>
          </button>

          {/* Ideas picker */}
          {ideas.length > 0 && (
            <div className="relative" ref={ideasMenuRef}>
              <button
                onClick={() => setShowIdeasMenu((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition-colors"
              >
                <span>💡</span>
                <span>From Ideas</span>
                <span className="text-indigo-400">▾</span>
              </button>

              {showIdeasMenu && (
                <div className="absolute bottom-full left-0 mb-1 w-72 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Saved Ideas
                  </div>
                  <div className="max-h-52 overflow-y-auto">
                    {ideas.map((idea) => (
                      <button
                        key={idea.id}
                        onClick={() => pickIdea(idea)}
                        className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 transition-colors border-b border-gray-50 last:border-0"
                      >
                        <div className="text-xs font-medium text-gray-900 truncate">{idea.title}</div>
                        <div className="text-xs text-gray-400 truncate mt-0.5">{idea.description}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Attached file chip */}
          {attachedFile && (
            <div className="flex items-center gap-1.5 text-xs bg-amber-50 border border-amber-200 text-amber-700 px-2.5 py-1.5 rounded-lg">
              <span>📄</span>
              <span className="font-medium max-w-32 truncate">{attachedFile.name}</span>
              <button
                onClick={() => setAttachedFile(null)}
                className="text-amber-400 hover:text-amber-700 ml-0.5 font-bold leading-none"
              >
                ×
              </button>
            </div>
          )}
        </div>

        {/* Textarea + send */}
        <div className="flex gap-3 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              attachedFile
                ? `Explain what ${attachedFile.name} is and what you need…`
                : "Message… (Enter to send, Shift+Enter for newline)"
            }
            rows={2}
            disabled={streaming}
            className="flex-1 bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 disabled:opacity-50 transition-colors"
          />
          <button
            onClick={send}
            disabled={!input.trim() || streaming}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-sm font-medium text-white transition-colors shrink-0"
          >
            {streaming ? "…" : "Send"}
          </button>
        </div>

        <div className="text-xs text-gray-400 mt-2">
          Auto-saves to <code>{workflow.output_folder}/</code>
        </div>
      </div>
    </div>
  );
}

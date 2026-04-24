"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiKeysSettings, LlmSettings, WorkflowModelSetting, getSettings, updateSettings } from "@/lib/api";

const KEY_FIELDS: Array<{ key: keyof ApiKeysSettings; label: string; hint: string }> = [
  { key: "anthropic", label: "Anthropic API Key", hint: "Used for Claude models" },
  { key: "openai", label: "OpenAI API Key", hint: "Used for GPT models" },
  { key: "openrouter", label: "OpenRouter API Key", hint: "Used for routed third-party models" },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<LlmSettings | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeysSettings>({ anthropic: "", openai: "", openrouter: "" });
  const [workflowSettings, setWorkflowSettings] = useState<Record<string, WorkflowModelSetting>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setStatus("");
    try {
      const data = await getSettings();
      setSettings(data);
      setApiKeys(data.api_keys);
      setWorkflowSettings(data.workflow_settings);
    } catch {
      setStatus("Could not load settings. Is backend running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const workflows = useMemo(() => settings?.workflows ?? [], [settings]);
  const providers = settings?.providers ?? {};
  const modelOptions = settings?.model_options ?? {};

  const changeProvider = (workflowId: string, provider: string) => {
    const fallbackModel = modelOptions[provider]?.[0] ?? "";
    setWorkflowSettings((prev) => ({
      ...prev,
      [workflowId]: {
        provider,
        model: fallbackModel,
      },
    }));
  };

  const changeModel = (workflowId: string, model: string) => {
    setWorkflowSettings((prev) => ({
      ...prev,
      [workflowId]: {
        ...(prev[workflowId] ?? { provider: "anthropic", model: "" }),
        model,
      },
    }));
  };

  const save = async () => {
    setSaving(true);
    setStatus("");
    try {
      const updated = await updateSettings({
        api_keys: apiKeys,
        workflow_settings: workflowSettings,
      });
      setSettings(updated);
      setApiKeys(updated.api_keys);
      setWorkflowSettings(updated.workflow_settings);
      setStatus("Settings saved.");
    } catch {
      setStatus("Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading settings...</div>;

  return (
    <div className="h-screen overflow-y-auto bg-gray-50">
      <div className="max-w-6xl mx-auto p-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Manage LLM API keys and choose which provider/model each workflow should use.</p>
        </div>

        <section className="bg-white border border-gray-200 rounded-2xl shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="text-sm font-semibold text-gray-900">API Keys</div>
            <div className="text-xs text-gray-500 mt-1">Keys are stored locally in a gitignored file on this machine.</div>
          </div>
          <div className="p-6 grid gap-4 md:grid-cols-3">
            {KEY_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="text-xs text-gray-500 block mb-1">{field.label}</label>
                <input
                  type="password"
                  value={apiKeys[field.key]}
                  onChange={(e) => setApiKeys((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  className="w-full border border-gray-300 bg-white text-gray-900 rounded-lg px-3 py-2 text-sm"
                  placeholder={`Enter ${field.label}`}
                />
                <div className="text-[11px] text-gray-400 mt-1">{field.hint}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-2xl shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="text-sm font-semibold text-gray-900">Workflow Models</div>
            <div className="text-xs text-gray-500 mt-1">Select the provider and model each dashboard workflow should use.</div>
          </div>

          <div className="divide-y divide-gray-100">
            {workflows.map((workflow) => {
              const current = workflowSettings[workflow.id] ?? {
                provider: workflow.default_provider,
                model: workflow.default_model,
              };
              const providerModels = modelOptions[current.provider] ?? [];

              return (
                <div key={workflow.id} className="px-6 py-5 grid gap-4 lg:grid-cols-[1.1fr,0.7fr,1fr] items-start">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{workflow.name}</div>
                    <div className="text-xs text-gray-500 mt-1">Default: {workflow.default_provider} / {workflow.default_model}</div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Provider</label>
                    <select
                      value={current.provider}
                      onChange={(e) => changeProvider(workflow.id, e.target.value)}
                      className="w-full border border-gray-300 bg-white text-gray-900 rounded-lg px-3 py-2 text-sm"
                    >
                      {Object.entries(providers).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-2">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Model</label>
                      <select
                        value={providerModels.includes(current.model) ? current.model : "__custom__"}
                        onChange={(e) => {
                          if (e.target.value !== "__custom__") {
                            changeModel(workflow.id, e.target.value);
                          }
                        }}
                        className="w-full border border-gray-300 bg-white text-gray-900 rounded-lg px-3 py-2 text-sm"
                      >
                        {providerModels.map((model) => (
                          <option key={model} value={model}>{model}</option>
                        ))}
                        <option value="__custom__">Custom model</option>
                      </select>
                    </div>

                    <input
                      value={current.model}
                      onChange={(e) => changeModel(workflow.id, e.target.value)}
                      className="w-full border border-gray-300 bg-white text-gray-900 rounded-lg px-3 py-2 text-sm"
                      placeholder="Enter model name"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="flex items-center justify-between gap-3 pb-8">
          <div className="text-sm text-gray-500">{status}</div>
          <button
            onClick={save}
            disabled={saving || !settings}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-medium"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

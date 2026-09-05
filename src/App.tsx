import React, { useState, useEffect } from "react";
import { Bot, Layers, Database, Code2, BookOpen, Shield, Zap, Sparkles, Activity, CheckCircle2 } from "lucide-react";
import { DiscordSimulator } from "./components/DiscordSimulator";
import { FallbackVisualizer } from "./components/FallbackVisualizer";
import { MemoryInspector } from "./components/MemoryInspector";
import { CodeViewer } from "./components/CodeViewer";
import { SetupGuide } from "./components/SetupGuide";
import { ConfigSummary } from "./types";

export default function App() {
  const [activeTab, setActiveTab] = useState<"simulator" | "architecture" | "memory" | "code" | "guide">("simulator");
  const [config, setConfig] = useState<ConfigSummary | null>(null);
  const [memoryRefreshCounter, setMemoryRefreshCounter] = useState(0);

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      setConfig(data);
    } catch (e) {
      console.error("Failed to load config:", e);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-indigo-500/20">
              IRP
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base sm:text-lg text-slate-100 tracking-tight">
                  IRP Discord AI Bot
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold">
                  v1.0.0
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Python discord.py • Turso libSQL Memory • Groq/Gemini/OpenRouter Chain • Tavily Tool
              </p>
            </div>
          </div>

          {/* Quick status pill */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 text-xs font-mono bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-slate-300">Silent-Trigger: @IRP / \birp\b</span>
              <span className="text-slate-600">•</span>
              <span className="text-amber-400 font-semibold">{config?.cooldownSeconds || 12}s Cooldown</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-1 overflow-x-auto text-xs sm:text-sm font-medium border-t border-slate-800/60 pt-1">
          <button
            onClick={() => setActiveTab("simulator")}
            className={`px-3.5 py-2.5 rounded-t-lg transition flex items-center gap-2 border-b-2 font-medium cursor-pointer ${
              activeTab === "simulator"
                ? "border-indigo-500 text-indigo-400 bg-slate-900/60"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30"
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>Discord Simulator</span>
          </button>

          <button
            onClick={() => setActiveTab("architecture")}
            className={`px-3.5 py-2.5 rounded-t-lg transition flex items-center gap-2 border-b-2 font-medium cursor-pointer ${
              activeTab === "architecture"
                ? "border-indigo-500 text-indigo-400 bg-slate-900/60"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>LLM Fallback & Tools</span>
          </button>

          <button
            onClick={() => setActiveTab("memory")}
            className={`px-3.5 py-2.5 rounded-t-lg transition flex items-center gap-2 border-b-2 font-medium cursor-pointer ${
              activeTab === "memory"
                ? "border-indigo-500 text-indigo-400 bg-slate-900/60"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30"
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Turso Memory (150 Cap)</span>
          </button>

          <button
            onClick={() => setActiveTab("code")}
            className={`px-3.5 py-2.5 rounded-t-lg transition flex items-center gap-2 border-b-2 font-medium cursor-pointer ${
              activeTab === "code"
                ? "border-indigo-500 text-indigo-400 bg-slate-900/60"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30"
            }`}
          >
            <Code2 className="w-4 h-4" />
            <span>Python Codebase</span>
          </button>

          <button
            onClick={() => setActiveTab("guide")}
            className={`px-3.5 py-2.5 rounded-t-lg transition flex items-center gap-2 border-b-2 font-medium cursor-pointer ${
              activeTab === "guide"
                ? "border-indigo-500 text-indigo-400 bg-slate-900/60"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Deployment Guide</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === "simulator" && (
          <div className="space-y-6">
            <DiscordSimulator
              config={config}
              onRefreshMemory={() => setMemoryRefreshCounter(c => c + 1)}
            />
            <FallbackVisualizer config={config} />
          </div>
        )}

        {activeTab === "architecture" && (
          <div className="space-y-6">
            <FallbackVisualizer config={config} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <h4 className="font-semibold text-sm text-slate-100 flex items-center gap-2 mb-2">
                  <Shield className="w-4 h-4 text-amber-400" />
                  Anti-Spam & Repetition Guardrails
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  IRP incorporates two layers of protection: a strict system prompt instruction prohibiting repeated words or phrase spam, and a deterministic code-level regex sanitizer that collapses repeating phrases and truncates runaway output safely under Discord's 2000-character ceiling.
                </p>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-[11px] text-slate-300">
                  <code>max_tokens: 800<br />cooldown: 10-15s per-user<br />repetition_filter: active</code>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <h4 className="font-semibold text-sm text-slate-100 flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-purple-400" />
                  Autonomous Tavily Function Calling
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  Rather than forcing search on every request, the model uses JSON Schema function calling (<code className="text-purple-300 font-mono">tavily_search</code>). The LLM autonomously inspects whether the query demands fresh web facts or can be answered directly from context.
                </p>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-[11px] text-slate-300">
                  <code>tool_choice: "auto"<br />tool: tavily_search(query, max_results=3)<br />two_turn_resolution: enabled</code>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "memory" && (
          <div className="space-y-6">
            <MemoryInspector channelId="general-chat" key={memoryRefreshCounter} />
          </div>
        )}

        {activeTab === "code" && (
          <div className="space-y-6">
            <CodeViewer />
          </div>
        )}

        {activeTab === "guide" && (
          <div className="space-y-6">
            <SetupGuide />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-4 text-center text-xs text-slate-500">
        IRP Discord AI Bot • Powered by discord.py, Turso libSQL, Groq, Google Gemini, OpenRouter & Tavily Search
      </footer>
    </div>
  );
}

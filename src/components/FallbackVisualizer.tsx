import React from "react";
import { Bot, Shield, Database, Search, ArrowRight, CheckCircle2, Zap, AlertTriangle, Layers } from "lucide-react";
import { ConfigSummary } from "../types";

interface FallbackVisualizerProps {
  config: ConfigSummary | null;
}

export const FallbackVisualizer: React.FC<FallbackVisualizerProps> = ({ config }) => {
  return (
    <div id="fallback-visualizer-container" className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100">
      <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-base text-slate-100">IRP Fallback & Processing Architecture</h3>
            <p className="text-xs text-slate-400">Multi-provider resilience with automatic failover, Turso memory & Tavily tool use</p>
          </div>
        </div>
        <span className="text-xs font-mono px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          discord.py v2.3+ Engine
        </span>
      </div>

      {/* Pipeline Steps Grid */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
        {/* Step 1: Trigger Filter */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-3 relative">
          <div className="text-[11px] font-mono uppercase text-indigo-400 font-semibold mb-1 flex items-center justify-between">
            <span>1. Trigger Filter</span>
            <Bot className="w-3.5 h-3.5" />
          </div>
          <div className="text-xs text-slate-300 font-medium mb-1">Silent by Default</div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Responds ONLY to <span className="text-indigo-300 font-mono">@IRP</span> or <span className="text-indigo-300 font-mono">\birp\b</span>. Ignores all other chat.
          </p>
        </div>

        {/* Step 2: Anti-Spam Gate */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-3 relative">
          <div className="text-[11px] font-mono uppercase text-amber-400 font-semibold mb-1 flex items-center justify-between">
            <span>2. Anti-Spam Gate</span>
            <Shield className="w-3.5 h-3.5" />
          </div>
          <div className="text-xs text-slate-300 font-medium mb-1">{config?.cooldownSeconds || 12}s Per-User Cooldown</div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Suppresses rapid repeat mentions silently within the cooldown window.
          </p>
        </div>

        {/* Step 3: Turso Memory */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-3 relative">
          <div className="text-[11px] font-mono uppercase text-cyan-400 font-semibold mb-1 flex items-center justify-between">
            <span>3. Turso Memory</span>
            <Database className="w-3.5 h-3.5" />
          </div>
          <div className="text-xs text-slate-300 font-medium mb-1">150-Msg Rolling Cap</div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Persistent libSQL SQLite store tagged with <span className="text-cyan-300 font-mono">[User]: text</span>.
          </p>
        </div>

        {/* Step 4: Fallback LLMs */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-3 relative">
          <div className="text-[11px] font-mono uppercase text-emerald-400 font-semibold mb-1 flex items-center justify-between">
            <span>4. LLM Chain</span>
            <Zap className="w-3.5 h-3.5" />
          </div>
          <div className="text-xs text-slate-300 font-medium mb-1">3-Tier Fallback</div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Groq (Primary) ➔ Gemini (Fallback) ➔ OpenRouter (Tertiary).
          </p>
        </div>

        {/* Step 5: Tavily Tool & Guardrail */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-3 relative">
          <div className="text-[11px] font-mono uppercase text-purple-400 font-semibold mb-1 flex items-center justify-between">
            <span>5. Search & Guard</span>
            <Search className="w-3.5 h-3.5" />
          </div>
          <div className="text-xs text-slate-300 font-medium mb-1">Tool Use + Cap</div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Autonomous web search & loop-sanitization backstop before Discord send.
          </p>
        </div>
      </div>

      {/* Provider Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
        {/* Groq Card */}
        <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-200">Tier 1: Groq</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${config?.groqKeySet ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>
                {config?.groqKeySet ? "Active" : "Key in .env"}
              </span>
            </div>
            <div className="text-[11px] font-mono text-indigo-400 truncate">llama-3.3-70b-versatile</div>
            <div className="text-[10px] text-slate-500 mt-1">Ultra-low latency inference</div>
          </div>
        </div>

        {/* Gemini Card */}
        <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-200">Tier 2: Gemini</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${config?.geminiKeySet ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>
                {config?.geminiKeySet ? "Ready" : "Key in .env"}
              </span>
            </div>
            <div className="text-[11px] font-mono text-cyan-400 truncate">gemini-2.5-flash</div>
            <div className="text-[10px] text-slate-500 mt-1">Deep context & fast failover</div>
          </div>
        </div>

        {/* OpenRouter Card */}
        <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-200">Tier 3: OpenRouter</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${config?.openrouterKeySet ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>
                {config?.openrouterKeySet ? "Ready" : "Key in .env"}
              </span>
            </div>
            <div className="text-[11px] font-mono text-amber-400 truncate">llama-3.3-70b:free</div>
            <div className="text-[10px] text-slate-500 mt-1">Tertiary free redundancy</div>
          </div>
        </div>

        {/* Tavily Search Card */}
        <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-200">Tool: Tavily</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${config?.tavilyKeySet ? "bg-purple-500/20 text-purple-300" : "bg-slate-800 text-slate-400"}`}>
                {config?.tavilyKeySet ? "Ready" : "Key in .env"}
              </span>
            </div>
            <div className="text-[11px] font-mono text-purple-400 truncate">tavily_search tool</div>
            <div className="text-[10px] text-slate-500 mt-1">Live web grounding</div>
          </div>
        </div>

        {/* Turso DB Card */}
        <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-200">Storage: Turso</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-cyan-500/20 text-cyan-300">
                {config?.tursoConfigured ? "Remote libSQL" : "Local SQLite Mode"}
              </span>
            </div>
            <div className="text-[11px] font-mono text-cyan-400 truncate">libsql-client (150 cap)</div>
            <div className="text-[10px] text-slate-500 mt-1">Persistent channel history</div>
          </div>
        </div>
      </div>
    </div>
  );
};

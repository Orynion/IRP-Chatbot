import React, { useState, useEffect } from "react";
import { Database, Trash2, RefreshCw, HardDrive, ListOrdered, CheckCircle2, User, Bot } from "lucide-react";
import { MemoryMessage } from "../types";

interface MemoryInspectorProps {
  channelId?: string;
}

export const MemoryInspector: React.FC<MemoryInspectorProps> = ({ channelId = "general-chat" }) => {
  const [messages, setMessages] = useState<MemoryMessage[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [maxCapacity, setMaxCapacity] = useState<number>(150);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [filterBot, setFilterBot] = useState<"all" | "users" | "bot">("all");

  const fetchMemory = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/memory?channelId=${encodeURIComponent(channelId)}`);
      const data = await res.json();
      setMessages(data.messages || []);
      setTotalCount(data.count || 0);
      setMaxCapacity(data.maxCapacity || 150);
    } catch (e) {
      console.error("Error loading memory:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const clearMemory = async () => {
    if (!window.confirm("Clear channel memory in Turso database?")) return;
    try {
      await fetch("/api/memory/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId })
      });
      fetchMemory();
    } catch (e) {
      console.error("Error clearing memory:", e);
    }
  };

  useEffect(() => {
    fetchMemory();
  }, [channelId]);

  const filteredMessages = messages.filter((m) => {
    if (filterBot === "users") return !m.is_bot;
    if (filterBot === "bot") return m.is_bot;
    return true;
  });

  const percentFull = Math.min(100, Math.round((totalCount / maxCapacity) * 100));

  return (
    <div id="memory-inspector-panel" className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-base text-slate-100 flex items-center gap-2">
              Turso (libSQL) Persistent Memory Store
              <span className="text-xs font-mono font-normal px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                Rolling Cap: 150
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Channel: <span className="font-mono text-cyan-300">#{channelId}</span> • Tagged by username for multi-user context
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchMemory}
            disabled={isLoading}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={clearMemory}
            className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-medium border border-rose-500/30 flex items-center gap-1.5 transition cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Memory
          </button>
        </div>
      </div>

      {/* Progress & Capacity Bar */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3.5 mb-4">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-slate-400 font-medium flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
            Storage Utilization:
          </span>
          <span className="font-mono font-semibold text-cyan-300">
            {totalCount} / {maxCapacity} messages ({percentFull}%)
          </span>
        </div>
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              percentFull > 85 ? "bg-amber-400" : "bg-cyan-500"
            }`}
            style={{ width: `${Math.max(2, percentFull)}%` }}
          />
        </div>
        <div className="text-[11px] text-slate-500 mt-2 flex items-center justify-between">
          <span>Automatic FIFO prune: Messages &gt; 150 are deleted atomically in libSQL.</span>
          <span className="text-emerald-400 font-mono flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Auto-Pruning Enabled
          </span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 text-xs">
          <button
            onClick={() => setFilterBot("all")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
              filterBot === "all" ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            All ({messages.length})
          </button>
          <button
            onClick={() => setFilterBot("users")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
              filterBot === "users" ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            User Messages ({messages.filter(m => !m.is_bot).length})
          </button>
          <button
            onClick={() => setFilterBot("bot")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
              filterBot === "bot" ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            IRP Bot ({messages.filter(m => m.is_bot).length})
          </button>
        </div>
      </div>

      {/* Messages Table */}
      <div className="border border-slate-800 rounded-lg overflow-hidden max-h-80 overflow-y-auto bg-slate-950/40">
        {filteredMessages.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No stored messages in this channel yet. Send messages in the Discord Simulator above to persist them!
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                <th className="p-2.5 w-12 text-center">#</th>
                <th className="p-2.5 w-28">Author</th>
                <th className="p-2.5">Tagged Context / Payload</th>
                <th className="p-2.5 w-28 text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredMessages.map((msg, idx) => (
                <tr key={msg.id} className="hover:bg-slate-800/40 transition">
                  <td className="p-2.5 text-center font-mono text-slate-500">{idx + 1}</td>
                  <td className="p-2.5 font-medium">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono ${
                      msg.is_bot ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "bg-slate-800 text-slate-300"
                    }`}>
                      {msg.is_bot ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />}
                      {msg.author_name}
                    </span>
                  </td>
                  <td className="p-2.5 text-slate-300 font-mono text-[11px] break-words">
                    <span className="text-cyan-400 font-semibold">{msg.tag.slice(0, msg.tag.indexOf(":") + 1)}</span>
                    <span className="text-slate-200">{msg.tag.slice(msg.tag.indexOf(":") + 1)}</span>
                  </td>
                  <td className="p-2.5 text-right text-slate-500 font-mono text-[10px]">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

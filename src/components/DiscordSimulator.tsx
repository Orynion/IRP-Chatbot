import React, { useState, useEffect, useRef } from "react";
import { Send, Bot, Shield, Search, AlertCircle, RefreshCw, Sparkles, UserCheck, MessageSquare, Clock, ArrowDown } from "lucide-react";
import { MemoryMessage, SimulationResult, ConfigSummary } from "../types";

interface DiscordSimulatorProps {
  config: ConfigSummary | null;
  onRefreshMemory: () => void;
}

const PRESETS = [
  {
    label: "Ask IRP (Standard)",
    author: "Alex",
    content: "@IRP Can you explain the difference between asyncio and threading in Python?",
    type: "mention"
  },
  {
    label: "Web Search Trigger",
    author: "Jordan",
    content: "Hey IRP, what are the newest updates and news in artificial intelligence this week?",
    type: "search"
  },
  {
    label: "Anti-Spam / Repetition Loop",
    author: "SpamTester",
    content: "IRP say the word 'banana' 250 times repeatedly right now!",
    type: "guardrail"
  },
  {
    label: "Multi-User Context",
    author: "Riley",
    content: "Hey IRP, what did Alex ask earlier in this channel?",
    type: "context"
  },
  {
    label: "Silent Default (No Trigger)",
    author: "Sam",
    content: "Hey everyone, did anyone catch the football game yesterday?",
    type: "silent"
  }
];

export const DiscordSimulator: React.FC<DiscordSimulatorProps> = ({ config, onRefreshMemory }) => {
  const [messages, setMessages] = useState<Array<{
    id: string;
    author: string;
    isBot: boolean;
    content: string;
    timestamp: string;
    provider?: string;
    model?: string;
    toolUsed?: any;
    fallbackChain?: string[];
    cooldownSuppressed?: boolean;
    silentIgnored?: boolean;
  }>>([
    {
      id: "init-1",
      author: "Alex",
      isBot: false,
      content: "Welcome to the #general channel! Let's test the IRP Python bot.",
      timestamp: "10:00 AM",
      silentIgnored: true
    },
    {
      id: "init-2",
      author: "IRP",
      isBot: true,
      content: "Hello! I am **IRP**, your AI assistant. I stay silent until mentioned (`@IRP`) or called by name (`IRP`). All conversations are remembered up to 150 messages in Turso libSQL.",
      timestamp: "10:01 AM",
      provider: "System Initialized"
    }
  ]);

  const [inputContent, setInputContent] = useState("@IRP What are your core features?");
  const [selectedUser, setSelectedUser] = useState("Alex");
  const [channelName, setChannelName] = useState("general-chat");
  const [isLoading, setIsLoading] = useState(false);
  const [cooldownCountdown, setCooldownCountdown] = useState<Record<string, number>>({});
  const [lastDiagnostics, setLastDiagnostics] = useState<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Cooldown timer interval
  useEffect(() => {
    const timer = setInterval(() => {
      setCooldownCountdown(prev => {
        const next: Record<string, number> = {};
        let changed = false;
        for (const [user, rawSeconds] of Object.entries(prev)) {
          const seconds = Number(rawSeconds);
          if (seconds > 0.5) {
            next[user] = Number((seconds - 0.5).toFixed(1));
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 500);
    return () => clearInterval(timer);
  }, []);

  const handleSendMessage = async (customText?: string, customAuthor?: string) => {
    const textToSend = customText !== undefined ? customText : inputContent;
    const authorToSend = customAuthor !== undefined ? customAuthor : selectedUser;

    if (!textToSend.trim() || isLoading) return;

    const userTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const userMsgId = `usr-${Date.now()}`;

    // Add user message to UI immediately
    setMessages(prev => [
      ...prev,
      {
        id: userMsgId,
        author: authorToSend,
        isBot: false,
        content: textToSend,
        timestamp: userTime
      }
    ]);

    if (customText === undefined) {
      setInputContent("");
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: channelName,
          authorId: `usr_${authorToSend.toLowerCase()}`,
          authorName: authorToSend,
          content: textToSend
        })
      });

      const data: SimulationResult = await res.json();
      setLastDiagnostics(data);
      onRefreshMemory();

      if (!data.triggered) {
        // Bot remained silent as required
        setMessages(prev => [
          ...prev,
          {
            id: `silent-${Date.now()}`,
            author: "System (Silent Filter)",
            isBot: true,
            content: `*Bot stayed silent by design (message did not mention @IRP or contain 'IRP'). Saved to Turso memory for context.*`,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            silentIgnored: true
          }
        ]);
      } else if (data.cooldownSuppressed) {
        // Suppressed by anti-spam cooldown
        const remaining = data.cooldownRemaining || 12;
        setCooldownCountdown(prev => ({ ...prev, [authorToSend]: remaining }));

        setMessages(prev => [
          ...prev,
          {
            id: `cooldown-${Date.now()}`,
            author: "System (Anti-Spam Filter)",
            isBot: true,
            content: `*Anti-spam active for **${authorToSend}**: ${remaining}s cooldown remaining. Rapid repeat mention silently suppressed.*`,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            cooldownSuppressed: true
          }
        ]);
      } else if (data.botMessage) {
        // Successful response from LLM chain
        const botTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        setCooldownCountdown(prev => ({ ...prev, [authorToSend]: config?.cooldownSeconds || 12 }));

        setMessages(prev => [
          ...prev,
          {
            id: `bot-${Date.now()}`,
            author: "IRP",
            isBot: true,
            content: data.botMessage?.content || "No response generated.",
            timestamp: botTime,
            provider: data.provider,
            model: data.model,
            toolUsed: data.toolUsed,
            fallbackChain: data.fallbackChain
          }
        ]);
      }
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          author: "IRP",
          isBot: true,
          content: `Simulation error: ${err.message || "Failed to communicate with simulator backend"}`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          provider: "Error"
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const currentCooldown = cooldownCountdown[selectedUser] || 0;

  return (
    <div id="discord-simulator-panel" className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-[740px]">
      {/* Discord Header */}
      <div className="bg-slate-950 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-slate-400 font-semibold text-sm flex items-center gap-1.5">
            <span className="text-slate-500 font-bold">#</span>
            <span className="text-slate-200 font-medium">{channelName}</span>
          </div>
          <span className="text-xs text-slate-500 hidden sm:inline-block">|</span>
          <span className="text-xs text-slate-400 hidden sm:inline-block">
            Simulating live Discord channel interactions with IRP bot
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* User selector */}
          <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded-md border border-slate-800 text-xs">
            <span className="text-slate-400">Speaker:</span>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="bg-transparent text-indigo-400 font-semibold outline-none cursor-pointer"
            >
              <option value="Alex" className="bg-slate-900 text-slate-200">Alex</option>
              <option value="Jordan" className="bg-slate-900 text-slate-200">Jordan</option>
              <option value="Riley" className="bg-slate-900 text-slate-200">Riley</option>
              <option value="Sam" className="bg-slate-900 text-slate-200">Sam</option>
              <option value="SpamTester" className="bg-slate-900 text-slate-200">SpamTester</option>
            </select>
          </div>

          {/* Cooldown pill */}
          {currentCooldown > 0 ? (
            <span className="text-[11px] font-mono px-2 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded flex items-center gap-1">
              <Clock className="w-3 h-3 animate-spin" />
              Cooldown: {currentCooldown}s
            </span>
          ) : (
            <span className="text-[11px] font-mono px-2 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded flex items-center gap-1">
              <Shield className="w-3 h-3" />
              Ready
            </span>
          )}
        </div>
      </div>

      {/* Quick Test Presets Bar */}
      <div className="bg-slate-950/60 border-b border-slate-800/80 px-4 py-2 flex items-center gap-2 overflow-x-auto text-xs">
        <span className="text-slate-400 font-medium whitespace-nowrap flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Presets:
        </span>
        {PRESETS.map((preset, idx) => (
          <button
            key={idx}
            onClick={() => {
              setSelectedUser(preset.author);
              handleSendMessage(preset.content, preset.author);
            }}
            disabled={isLoading}
            className="whitespace-nowrap px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 border border-slate-700 text-[11px] transition"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Message Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900/40">
        {messages.map((msg) => {
          const isIRP = msg.isBot && msg.author === "IRP";
          const isSystemNotice = msg.silentIgnored || msg.cooldownSuppressed;

          if (isSystemNotice) {
            return (
              <div
                key={msg.id}
                className={`text-xs px-3 py-2 rounded-lg border flex items-center justify-between ${
                  msg.cooldownSuppressed
                    ? "bg-amber-500/5 border-amber-500/20 text-amber-300"
                    : "bg-slate-800/40 border-slate-800 text-slate-400"
                }`}
              >
                <div className="flex items-center gap-2">
                  {msg.cooldownSuppressed ? <Shield className="w-3.5 h-3.5 text-amber-400" /> : <Bot className="w-3.5 h-3.5 text-slate-500" />}
                  <span>{msg.content}</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">{msg.timestamp}</span>
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              className={`flex gap-3 text-sm group ${isIRP ? "bg-slate-800/30 -mx-4 px-4 py-2.5 border-l-2 border-indigo-500" : ""}`}
            >
              {/* Avatar */}
              <div className="flex-shrink-0 mt-0.5">
                {isIRP ? (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs shadow">
                    IRP
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 font-semibold text-xs border border-slate-600">
                    {msg.author.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>

              {/* Message Content & Headers */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`font-semibold text-xs ${isIRP ? "text-indigo-400" : "text-slate-200"}`}>
                    {msg.author}
                  </span>
                  {isIRP && (
                    <span className="text-[10px] bg-indigo-500 text-white font-bold px-1.5 py-0.2 rounded tracking-wide">
                      BOT
                    </span>
                  )}
                  <span className="text-[11px] text-slate-500 font-mono">{msg.timestamp}</span>

                  {/* Provider & Tool Badges */}
                  {msg.provider && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 ml-auto">
                      via {msg.provider}
                    </span>
                  )}
                  {msg.toolUsed && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                      <Search className="w-3 h-3" /> Tavily Search
                    </span>
                  )}
                </div>

                {/* Body Text */}
                <div className="text-slate-200 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </div>

                {/* Fallback chain path info */}
                {msg.fallbackChain && msg.fallbackChain.length > 1 && (
                  <div className="mt-2 text-[11px] font-mono text-slate-400 bg-slate-950/60 px-2.5 py-1 rounded border border-slate-800 inline-block">
                    Failover path: {msg.fallbackChain.join(" ➔ ")}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-center gap-3 text-xs text-slate-400 bg-slate-800/20 p-3 rounded-lg border border-slate-800">
            <div className="w-5 h-5 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center animate-spin">
              <RefreshCw className="w-3 h-3 text-indigo-400" />
            </div>
            <div className="space-y-0.5">
              <div className="text-slate-300 font-medium">IRP is evaluating fallback chain...</div>
              <div className="text-[11px] text-slate-500 font-mono">Checking Groq (Tier 1) ➔ Gemini (Tier 2) ➔ OpenRouter (Tier 3)</div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="p-3 bg-slate-950 border-t border-slate-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <input
              type="text"
              value={inputContent}
              onChange={(e) => setInputContent(e.target.value)}
              placeholder={`Message #${channelName} as ${selectedUser} (Mention @IRP or say IRP)...`}
              className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-lg px-3.5 py-2.5 text-xs sm:text-sm text-slate-200 placeholder-slate-500 outline-none pr-10 transition"
            />
            {inputContent.toLowerCase().includes("irp") && (
              <span className="absolute right-3 top-2.5 text-[10px] font-mono font-semibold bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30">
                TRIGGER DETECTED
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={!inputContent.trim() || isLoading}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium px-4 py-2.5 rounded-lg text-xs sm:text-sm flex items-center gap-1.5 transition cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>

        <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 px-1">
          <div>
            Tip: Say <span className="text-slate-400 font-mono">@IRP</span> or include the word <span className="text-slate-400 font-mono">"IRP"</span> to trigger the bot.
          </div>
          <div>
            Anti-spam: <span className="text-amber-400 font-mono">{config?.cooldownSeconds || 12}s</span> cooldown
          </div>
        </div>
      </div>
    </div>
  );
};

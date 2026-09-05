import React, { useState } from "react";
import { CheckCircle2, Copy, Check, Terminal, ExternalLink, Key, ShieldCheck, Github, ChevronRight } from "lucide-react";

export const SetupGuide: React.FC = () => {
  const [copiedStep, setCopiedStep] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedStep(id);
    setTimeout(() => setCopiedStep(null), 2000);
  };

  return (
    <div id="setup-guide-panel" className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-100 space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
        <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
          <Terminal className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-semibold text-lg text-slate-100">Quickstart & Deployment Guide</h3>
          <p className="text-xs text-slate-400">Everything needed to run IRP live in your Discord server & push to GitHub</p>
        </div>
      </div>

      {/* Step 1: Discord Developer Portal */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-indigo-300 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-mono">1</span>
            Discord Developer Portal Setup
          </h4>
          <a
            href="https://discord.com/developers/applications"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            Open Portal <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Create an application named <strong className="text-slate-200">IRP</strong>. In the <strong>Bot</strong> tab, reset and copy your Bot Token.
        </p>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-md p-3 text-xs text-amber-300 space-y-1">
          <div className="font-semibold flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" /> Crucial Privileged Gateway Intents:
          </div>
          <p className="text-amber-200/80 text-[11px]">
            Under the Bot settings tab, toggle ON <strong>Message Content Intent</strong>. Without this, Discord will not deliver message text to the bot for trigger detection.
          </p>
        </div>
      </div>

      {/* Step 2: Turso Database Setup */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-cyan-300 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-mono">2</span>
            Turso (libSQL) Cloud Database Setup
          </h4>
          <a
            href="https://turso.tech"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
          >
            Turso Website <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Create a free edge SQLite database on Turso to persist channel history across server restarts:
        </p>
        <div className="bg-slate-900 border border-slate-800 rounded-md p-3 relative font-mono text-xs text-slate-300">
          <code>turso db create irp-bot-db<br />turso db show irp-bot-db --url<br />turso db tokens create irp-bot-db</code>
          <button
            onClick={() => copyToClipboard("turso db create irp-bot-db\nturso db show irp-bot-db --url\nturso db tokens create irp-bot-db", "turso")}
            className="absolute right-2 top-2 p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition"
          >
            {copiedStep === "turso" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Step 3: Run Locally */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 space-y-3">
        <h4 className="text-sm font-semibold text-emerald-300 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-mono">3</span>
          Launch IRP in Python
        </h4>
        <div className="bg-slate-900 border border-slate-800 rounded-md p-3 relative font-mono text-xs text-slate-300 space-y-1">
          <p className="text-slate-500"># 1. Install dependencies</p>
          <p>pip install -r requirements.txt</p>
          <p className="text-slate-500 pt-1"># 2. Run automated test suite</p>
          <p>python test_irp.py</p>
          <p className="text-slate-500 pt-1"># 3. Start IRP Discord bot</p>
          <p>python bot.py</p>
          <button
            onClick={() => copyToClipboard("pip install -r requirements.txt\npython test_irp.py\npython bot.py", "run")}
            className="absolute right-2 top-2 p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition"
          >
            {copiedStep === "run" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Step 4: Push to GitHub */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-purple-300 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-mono">4</span>
            Push to GitHub Repository
          </h4>
          <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
            <Github className="w-3.5 h-3.5" /> Git Initialized
          </span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          The Git repository has been initialized with clean <code className="text-slate-300 font-mono">.gitignore</code> rules excluding secret keys and local DBs:
        </p>
        <div className="bg-slate-900 border border-slate-800 rounded-md p-3 relative font-mono text-xs text-slate-300 space-y-1">
          <p>git remote add origin https://github.com/YOUR_USERNAME/irp-discord-bot.git</p>
          <p>git branch -M main</p>
          <p>git push -u origin main</p>
          <button
            onClick={() => copyToClipboard("git remote add origin https://github.com/YOUR_USERNAME/irp-discord-bot.git\ngit branch -M main\ngit push -u origin main", "git")}
            className="absolute right-2 top-2 p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition"
          >
            {copiedStep === "git" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
};

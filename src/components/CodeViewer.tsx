import React, { useState, useEffect } from "react";
import { FileCode, Copy, Check, Terminal, ExternalLink, Code2 } from "lucide-react";

export const CodeViewer: React.FC = () => {
  const [files, setFiles] = useState<Record<string, string>>({});
  const [selectedFile, setSelectedFile] = useState<string>("bot.py");
  const [copied, setCopied] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    fetch("/api/files")
      .then((res) => res.json())
      .then((data) => {
        if (data.files) {
          setFiles(data.files);
        }
      })
      .catch((err) => console.error("Error loading files:", err))
      .finally(() => setIsLoading(false));
  }, []);

  const handleCopy = () => {
    const content = files[selectedFile] || "";
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fileList = [
    { name: "bot.py", desc: "Discord.py entrypoint & trigger engine" },
    { name: "llm.py", desc: "Groq ➔ Gemini ➔ OpenRouter fallback & tool loop" },
    { name: "memory.py", desc: "Turso (libSQL) 150-message rolling memory" },
    { name: "search.py", desc: "Tavily web search tool schema & execution" },
    { name: "config.py", desc: "Environment loader & guardrail system prompt" },
    { name: "test_irp.py", desc: "Automated test suite for memory, cooldown & guardrails" },
    { name: "requirements.txt", desc: "Python dependencies" },
    { name: ".env.example", desc: "Environment template" },
    { name: "README.md", desc: "Full documentation & setup guide" }
  ];

  return (
    <div id="code-viewer-panel" className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden text-slate-100">
      {/* Header */}
      <div className="bg-slate-950 border-b border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Code2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-base text-slate-100">Clean Multi-File Python Codebase</h3>
            <p className="text-xs text-slate-400">Production-ready modules configured with Git integration</p>
          </div>
        </div>

        <button
          onClick={handleCopy}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 flex items-center gap-1.5 transition self-start sm:self-auto cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied to Clipboard!" : `Copy ${selectedFile}`}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 min-h-[500px]">
        {/* File Navigator Sidebar */}
        <div className="bg-slate-950/60 border-r border-slate-800 p-3 space-y-1">
          <div className="text-[11px] font-mono text-slate-400 uppercase px-2 py-1 font-semibold">
            Project Files
          </div>
          {fileList.map((f) => (
            <button
              key={f.name}
              onClick={() => setSelectedFile(f.name)}
              className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-mono transition flex flex-col gap-0.5 cursor-pointer ${
                selectedFile === f.name
                  ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-semibold"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <FileCode className="w-3.5 h-3.5 text-slate-400" />
                <span>{f.name}</span>
              </div>
              <span className="text-[10px] text-slate-500 font-sans">{f.desc}</span>
            </button>
          ))}
        </div>

        {/* Code Content Area */}
        <div className="lg:col-span-3 bg-slate-950 p-4 overflow-x-auto flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 mb-3 text-xs font-mono text-slate-400">
            <span>Viewing: <strong className="text-slate-200">{selectedFile}</strong></span>
            <span>Lines: {(files[selectedFile] || "").split("\n").length}</span>
          </div>

          <pre className="font-mono text-xs text-slate-300 leading-relaxed overflow-x-auto max-h-[460px] overflow-y-auto">
            <code>{files[selectedFile] || (isLoading ? "Loading file contents..." : "# File content not available")}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};

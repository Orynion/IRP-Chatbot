import express from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json());

// In-memory simulator storage for web testing
interface MemoryMessage {
  id: number;
  channel_id: string;
  author_id: string;
  author_name: string;
  is_bot: boolean;
  content: string;
  created_at: string;
  tag: string;
}

const memoryStore: Record<string, MemoryMessage[]> = {};
let messageIdCounter = 1;
const cooldownTracker: Record<string, number> = {};

const MAX_HISTORY = 150;
const COOLDOWN_SECONDS = 12;

const SYSTEM_PROMPT = `You are IRP, an intelligent, sharp, and helpful Discord assistant.

CRITICAL BEHAVIORAL GUARDRAILS:
1. NEVER repeat words, phrases, sentences, or characters excessively.
2. NEVER generate long spammy or loop-like output, even if a user explicitly commands you (e.g., "say hello 200 times", "write an infinite loop of text", or "spam this channel"). If a user asks for repetition or spam, decline politely and concisely in one sentence or provide a brief summary.
3. Keep your answers concise, accurate, and direct. Use Discord-flavored Markdown (bold, code blocks, bullet points) cleanly without excessive styling.
4. You have access to a web search tool (\`tavily_search\`). Only invoke this tool when the query requires real-time facts, current news, live updates, weather, sports scores, or information beyond your knowledge cutoff. For general reasoning, coding, conversational banter, or past channel context, answer directly.
5. In the conversation history, messages are formatted as \`[Username]: message\`. Use this context to track who said what in the channel, but do not prefix your own response with \`[IRP]:\` or \`[Username]:\`.`;

// Helper: Guardrail repetition sanitizer
function sanitizeRepetition(text: string): string {
  if (!text) return text;
  // Reduce repeated characters
  let clean = text.replace(/(.)\1{9,}/g, "$1$1$1");
  // Check repeated words
  const words = clean.split(/\s+/);
  if (words.length > 8) {
    const cleanWords: string[] = [];
    let consecutiveCount = 1;
    let prevWord = "";
    for (const w of words) {
      const normalized = w.toLowerCase().replace(/[.,!?"']/g, "");
      if (normalized === prevWord) {
        consecutiveCount++;
      } else {
        consecutiveCount = 1;
        prevWord = normalized;
      }

      if (consecutiveCount <= 4) {
        cleanWords.push(w);
      } else if (consecutiveCount === 5) {
        cleanWords.push("... [repetitive text truncated by IRP guardrail]");
      }
    }
    clean = cleanWords.join(" ");
  }
  if (clean.length > 1950) {
    clean = clean.slice(0, 1920) + "\n... [Message capped by IRP guardrail]";
  }
  return clean.trim();
}

// Tavily search helper
async function performTavilySearch(query: string, apiKey: string) {
  if (!apiKey) {
    return { success: false, error: "Tavily API key not provided" };
  }
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        include_answer: true,
        max_results: 3
      })
    });
    if (!res.ok) {
      return { success: false, error: `Tavily HTTP ${res.status}` };
    }
    const data = await res.json();
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || "Tavily network error" };
  }
}

// LLM Fallback Execution (Groq -> Gemini -> OpenRouter)
async function executeLLMChain(
  channelHistory: MemoryMessage[],
  userPrompt: string,
  userName: string,
  customKeys?: Record<string, string>
) {
  const groqKey = customKeys?.groqKey || process.env.GROQ_API_KEY || "";
  const geminiKey = customKeys?.geminiKey || process.env.GEMINI_API_KEY || "";
  const openrouterKey = customKeys?.openrouterKey || process.env.OPENROUTER_API_KEY || "";
  const tavilyKey = customKeys?.tavilyKey || process.env.TAVILY_API_KEY || "";

  const historyContext = channelHistory.map(m => m.tag).join("\n");
  const fallbackLogs: string[] = [];

  // Provider 1: Groq API
  if (groqKey) {
    try {
      const messages: any[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...(historyContext ? [{ role: "system", content: `--- RECENT CHANNEL HISTORY ---\n${historyContext}` }] : []),
        { role: "user", content: `[${userName}]: ${userPrompt}` }
      ];

      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages,
          tools: [{
            type: "function",
            function: {
              name: "tavily_search",
              description: "Searches the live web for recent facts or current news using Tavily.",
              parameters: {
                type: "object",
                properties: { query: { type: "string" } },
                required: ["query"]
              }
            }
          }],
          tool_choice: "auto",
          max_tokens: 800,
          temperature: 0.6
        })
      });

      if (groqRes.ok) {
        const groqData = await groqRes.json();
        const choice = groqData.choices?.[0]?.message;
        let toolDetails = null;

        if (choice?.tool_calls && choice.tool_calls.length > 0) {
          const tc = choice.tool_calls[0];
          if (tc.function?.name === "tavily_search") {
            const parsedArgs = JSON.parse(tc.function.arguments || "{}");
            const searchRes = await performTavilySearch(parsedArgs.query, tavilyKey);
            toolDetails = { tool: "tavily_search", query: parsedArgs.query, success: searchRes.success };

            // Second turn
            const followUpMessages = [
              ...messages,
              choice,
              {
                role: "tool",
                tool_call_id: tc.id,
                name: "tavily_search",
                content: searchRes.success ? JSON.stringify(searchRes.data) : "Search unavailable"
              }
            ];

            const followUp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${groqKey}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: followUpMessages,
                max_tokens: 800,
                temperature: 0.6
              })
            });

            if (followUp.ok) {
              const fData = await followUp.json();
              const fText = fData.choices?.[0]?.message?.content || "";
              return {
                success: true,
                provider: "Groq",
                model: "llama-3.3-70b-versatile",
                response: sanitizeRepetition(fText),
                tool_used: toolDetails,
                fallback_chain: ["Groq (Success)"]
              };
            }
          }
        }

        if (choice?.content) {
          return {
            success: true,
            provider: "Groq",
            model: "llama-3.3-70b-versatile",
            response: sanitizeRepetition(choice.content),
            tool_used: toolDetails,
            fallback_chain: ["Groq (Success)"]
          };
        }
      } else {
        fallbackLogs.push(`Groq failed (HTTP ${groqRes.status})`);
      }
    } catch (err: any) {
      fallbackLogs.push(`Groq exception: ${err.message}`);
    }
  } else {
    fallbackLogs.push("Groq API key not configured");
  }

  // Provider 2: Google Gemini API (Fallback)
  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const promptText = `${SYSTEM_PROMPT}\n\n${historyContext ? `--- RECENT CHANNEL HISTORY ---\n${historyContext}\n\n` : ""}[${userName}]: ${userPrompt}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: promptText,
        config: {
          maxOutputTokens: 800,
          temperature: 0.6
        }
      });

      const rawText = response.text || "";
      if (rawText.trim()) {
        return {
          success: true,
          provider: "Google Gemini",
          model: "gemini-2.5-flash",
          response: sanitizeRepetition(rawText),
          tool_used: null,
          fallback_chain: [...fallbackLogs.map(l => `${l.split(" ")[0]} (Failed)`), "Gemini (Success)"]
        };
      }
      fallbackLogs.push("Gemini returned empty response");
    } catch (err: any) {
      fallbackLogs.push(`Gemini error: ${err.message}`);
    }
  } else {
    fallbackLogs.push("Gemini API key not configured");
  }

  // Provider 3: OpenRouter API (Tertiary Fallback)
  if (openrouterKey) {
    try {
      const openRouterRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openrouterKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/irp-bot/irp-discord",
          "X-Title": "IRP Discord Bot"
        },
        body: JSON.stringify({
          model: "meta-llama/llama-3.3-70b-instruct:free",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...(historyContext ? [{ role: "system", content: `--- RECENT CHANNEL HISTORY ---\n${historyContext}` }] : []),
            { role: "user", content: `[${userName}]: ${userPrompt}` }
          ],
          max_tokens: 800,
          temperature: 0.6
        })
      });

      if (openRouterRes.ok) {
        const orData = await openRouterRes.json();
        const content = orData.choices?.[0]?.message?.content || "";
        if (content.trim()) {
          return {
            success: true,
            provider: "OpenRouter",
            model: "meta-llama/llama-3.3-70b-instruct:free",
            response: sanitizeRepetition(content),
            tool_used: null,
            fallback_chain: [...fallbackLogs.map(l => `${l.split(" ")[0]} (Failed)`), "OpenRouter (Success)"]
          };
        }
      }
      fallbackLogs.push(`OpenRouter failed (HTTP ${openRouterRes.status})`);
    } catch (err: any) {
      fallbackLogs.push(`OpenRouter error: ${err.message}`);
    }
  } else {
    fallbackLogs.push("OpenRouter API key not configured");
  }

  return {
    success: false,
    provider: "None",
    model: "None",
    response: "I'm currently unable to generate a response because all LLM backend providers (Groq, Gemini, OpenRouter) are unavailable or unconfigured. Please configure your API keys.",
    tool_used: null,
    fallback_chain: fallbackLogs,
    errors: fallbackLogs
  };
}

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/config", (req, res) => {
  res.json({
    discordTokenSet: Boolean(process.env.DISCORD_BOT_TOKEN),
    groqKeySet: Boolean(process.env.GROQ_API_KEY),
    geminiKeySet: Boolean(process.env.GEMINI_API_KEY),
    openrouterKeySet: Boolean(process.env.OPENROUTER_API_KEY),
    tavilyKeySet: Boolean(process.env.TAVILY_API_KEY),
    tursoConfigured: Boolean(process.env.TURSO_DATABASE_URL),
    cooldownSeconds: COOLDOWN_SECONDS,
    maxHistory: MAX_HISTORY
  });
});

app.get("/api/files", (req, res) => {
  const fileNames = [
    "bot.py",
    "llm.py",
    "memory.py",
    "search.py",
    "config.py",
    "test_irp.py",
    "requirements.txt",
    ".env.example",
    "README.md"
  ];

  const files: Record<string, string> = {};
  for (const name of fileNames) {
    try {
      const filePath = path.join(process.cwd(), name);
      if (fs.existsSync(filePath)) {
        files[name] = fs.readFileSync(filePath, "utf-8");
      }
    } catch (e) {
      // ignore
    }
  }
  res.json({ files });
});

// Memory API
app.get("/api/memory", (req, res) => {
  const channelId = (req.query.channelId as string) || "general-chat";
  const messages = memoryStore[channelId] || [];
  res.json({
    channelId,
    count: messages.length,
    maxCapacity: MAX_HISTORY,
    messages
  });
});

app.post("/api/memory/clear", (req, res) => {
  const channelId = req.body.channelId || "general-chat";
  memoryStore[channelId] = [];
  res.json({ success: true, channelId, count: 0 });
});

// Simulator Endpoint
app.post("/api/simulate", async (req, res) => {
  const {
    channelId = "general-chat",
    authorId = "user_1",
    authorName = "Alex",
    content = "",
    customKeys
  } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: "Message content cannot be empty" });
  }

  const trimmedContent = content.trim();

  // 1. Evaluate Trigger Condition: @IRP mention or 'IRP' word
  const irpRegex = /\birp\b/i;
  const isDirectMention = trimmedContent.includes("@IRP") || trimmedContent.includes("<@IRP>");
  const isNameTrigger = irpRegex.test(trimmedContent);
  const isTriggered = isDirectMention || isNameTrigger;

  // Initialize channel memory if needed
  if (!memoryStore[channelId]) {
    memoryStore[channelId] = [];
  }

  // Record the user message in memory
  const userMsg: MemoryMessage = {
    id: messageIdCounter++,
    channel_id: channelId,
    author_id: authorId,
    author_name: authorName,
    is_bot: false,
    content: trimmedContent,
    created_at: new Date().toISOString(),
    tag: `[${authorName}]: ${trimmedContent}`
  };

  memoryStore[channelId].push(userMsg);
  // Enforce 150 message rolling cap
  if (memoryStore[channelId].length > MAX_HISTORY) {
    memoryStore[channelId] = memoryStore[channelId].slice(-MAX_HISTORY);
  }

  if (!isTriggered) {
    return res.json({
      triggered: false,
      reason: "Silent by default (no @IRP mention or 'IRP' name trigger in message)",
      userMessage: userMsg,
      memoryCount: memoryStore[channelId].length
    });
  }

  // 2. Anti-Spam Per-User Cooldown Check (12s)
  const now = Date.now() / 1000;
  const lastTime = cooldownTracker[authorId] || 0;
  const elapsed = now - lastTime;

  if (elapsed < COOLDOWN_SECONDS) {
    const remaining = (COOLDOWN_SECONDS - elapsed).toFixed(1);
    return res.json({
      triggered: true,
      cooldownSuppressed: true,
      reason: `Anti-spam cooldown active: ${remaining}s remaining for user ${authorName}. Message silently ignored.`,
      userMessage: userMsg,
      cooldownRemaining: parseFloat(remaining),
      memoryCount: memoryStore[channelId].length
    });
  }

  // Update cooldown timestamp
  cooldownTracker[authorId] = now;

  // 3. Clean Prompt
  const cleanPrompt = trimmedContent.replace(/@IRP/gi, "").trim() || "Hello IRP";

  // 4. Execute LLM Fallback Chain
  const history = memoryStore[channelId].slice(0, -1); // exclude current
  const llmResult = await executeLLMChain(history, cleanPrompt, authorName, customKeys);

  // 5. Store bot reply in memory
  const botMsg: MemoryMessage = {
    id: messageIdCounter++,
    channel_id: channelId,
    author_id: "bot_irp",
    author_name: "IRP",
    is_bot: true,
    content: llmResult.response,
    created_at: new Date().toISOString(),
    tag: `[IRP (Bot)]: ${llmResult.response}`
  };

  memoryStore[channelId].push(botMsg);
  if (memoryStore[channelId].length > MAX_HISTORY) {
    memoryStore[channelId] = memoryStore[channelId].slice(-MAX_HISTORY);
  }

  res.json({
    triggered: true,
    cooldownSuppressed: false,
    userMessage: userMsg,
    botMessage: botMsg,
    provider: llmResult.provider,
    model: llmResult.model,
    toolUsed: llmResult.tool_used,
    fallbackChain: llmResult.fallback_chain,
    memoryCount: memoryStore[channelId].length
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`IRP Bot Companion Server running on http://localhost:${PORT}`);
  });
}

startServer();

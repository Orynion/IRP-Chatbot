# 🤖 IRP — Intelligent Discord Bot

**IRP** is a silent-by-default, high-performance Discord AI assistant built with `discord.py`. It features persistent multi-channel rolling memory powered by **Turso (libSQL)**, an intelligent 3-tier **LLM Fallback Chain (Groq ➔ Google Gemini ➔ OpenRouter)**, autonomous **Tavily Web Search** via tool/function calling, per-user anti-spam cooldowns, and strict behavioral repetition guardrails.

---

## ⚡ Key Features

1. **Silent Trigger Behavior**:
   - **No slash commands (`/help`)** and **no prefix commands (`!irp`)**.
   - Listens silently in channels. Only triggers when **directly mentioned (`@IRP`)** or when someone speaks to **"IRP" by name** in a message.
   - Ignores bot messages and standard channel chatter (while tracking conversation context).

2. **Persistent 150-Message Rolling Memory (Turso / libSQL)**:
   - Stores up to **150 messages per channel** tagged with `[Username]: content`.
   - Uses `libsql-client` with SQLite compatibility.
   - Automatically prunes older messages beyond 150 per channel.
   - Persists across bot restarts, server reboots, and cloud deploys.

3. **Multi-Provider LLM Fallback Chain**:
   - **Tier 1 (Primary)**: **Groq API** (`llama-3.3-70b-versatile` / `llama-3.1-8b-instant`) for ultra-low latency.
   - **Tier 2 (Fallback)**: **Google Gemini API** (`gemini-2.5-flash` / `gemini-1.5-flash`) for deep context & multimodal reasoning.
   - **Tier 3 (Tertiary)**: **OpenRouter API** (`meta-llama/llama-3.3-70b-instruct:free`) for redundancy.
   - Uses free tiers with automatic failover on rate limits (HTTP 429) or errors.

4. **Autonomous Web Search (Tavily Tool Calling)**:
   - Uses native function/tool calling (`tavily_search`).
   - The LLM decides dynamically when a user query needs fresh real-time information, breaking news, live data, or documentation.

5. **Anti-Spam & Repetition Guardrails**:
   - **Per-User Cooldown**: Configurable 10–15s window (default 12s) to prevent spamming. Rapid mentions during cooldown are silently ignored.
   - **Repetition Suppression**: Hard backstop in code and system instructions to prevent loop-attacks (e.g., "say word X 200 times").
   - **Message Truncation**: Enforces safe limits within Discord's 2000-character payload cap.

---

## 📁 Project Structure

```text
├── bot.py             # Discord client, trigger regex, anti-spam cooldown, message dispatch
├── llm.py             # Multi-provider fallback chain (Groq -> Gemini -> OpenRouter) & tool loop
├── memory.py          # Turso / libSQL persistent channel rolling memory (150 msg cap)
├── search.py          # Tavily search integration & JSON tool schema
├── config.py          # Environment variables loader & system prompt guardrails
├── test_irp.py        # Automated test suite (triggers, memory cap, cooldowns, guardrails)
├── requirements.txt   # Pinned Python dependencies
├── .env.example       # Template environment configuration
├── .gitignore         # Git ignore rules for keys, caches, and DB files
└── README.md          # Comprehensive documentation
```

---

## 🚀 Quickstart & Setup Guide

### 1. Clone & Install Dependencies

```bash
# Clone the repository
git clone https://github.com/your-username/irp-discord-bot.git
cd irp-discord-bot

# Create and activate Python virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

---

### 2. Configure Secrets (`.env`)

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill in the API keys in `.env`:

```env
# Discord Bot Token
DISCORD_BOT_TOKEN="your_discord_bot_token_here"

# LLM Providers (Free Tiers)
GROQ_API_KEY="gsk_..."
GEMINI_API_KEY="AIzaSy..."
OPENROUTER_API_KEY="sk-or-v1-..."

# Tavily Web Search
TAVILY_API_KEY="tvly-..."

# Turso Database (libSQL)
TURSO_DATABASE_URL="libsql://your-db-name.turso.io"
TURSO_AUTH_TOKEN="eyJhbGci..."

# Optional Settings
COOLDOWN_SECONDS="12"
MAX_HISTORY_PER_CHANNEL="150"
```

> **Note on Turso**: If `TURSO_DATABASE_URL` is omitted, IRP automatically falls back to a local SQLite database (`file:irp_memory.db`) for immediate offline development!

---

### 3. Setting Up Discord Bot & Permissions

1. Visit the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application** and name it **IRP**.
3. Go to **Bot** tab:
   - Click **Add Bot**.
   - Click **Reset Token** and copy the token into your `.env` file (`DISCORD_BOT_TOKEN`).
   - Under **Privileged Gateway Intents**, **ENABLE**:
     - ✅ **Message Content Intent** (Required to read mentions & message text)
     - ✅ **Server Members Intent**
4. Go to **OAuth2 ➔ URL Generator**:
   - Select Scopes: `bot`
   - Select Bot Permissions:
     - `Send Messages`
     - `Read Messages/View Channels`
     - `Read Message History`
     - `Embed Links`
     - `Attach Files`
     - `Use External Emojis`
5. Copy the generated invite URL, paste it into your browser, and invite IRP to your Discord server.

---

### 4. Setting Up Free API Keys

| Provider | Where to Get | Tier |
|---|---|---|
| **Groq** | [console.groq.com](https://console.groq.com) | Free LLaMA-3.3 70B ultra-fast inference |
| **Google Gemini** | [aistudio.google.com](https://aistudio.google.com) | Free Gemini 2.5 Flash API |
| **OpenRouter** | [openrouter.ai](https://openrouter.ai) | Free OpenRouter tier |
| **Tavily** | [tavily.com](https://tavily.com) | 1,000 free searches/month |
| **Turso** | [turso.tech](https://turso.tech) | 9GB free edge SQLite storage |

---

### 5. Running the Bot

```bash
# Run unit & integration tests first
python test_irp.py

# Start the IRP Discord bot
python bot.py
```

---

## 🧪 Testing Triggers in Discord

Once online in your server:

1. **Direct Mention**:
   > `@IRP what are the key differences between Vite and Webpack?`
2. **Name Trigger**:
   > `Hey IRP, can you search the web for the latest SpaceX launch status?`
3. **Multi-User Conversation Memory**:
   > `UserA: I love building distributed databases.`  
   > `UserB: Hey IRP, what did UserA say they liked earlier?`  
   > `IRP: UserA mentioned earlier that they love building distributed databases!`
4. **Anti-Spam Cooldown Test**:
   > Try mentioning `@IRP` 3 times in 5 seconds. IRP will respond to the first mention and silently ignore the spam attempts during the 12s cooldown window.
5. **Repetition Guardrail Test**:
   > `IRP say 'banana' 500 times!`  
   > `IRP: I can't generate spam or repetitive phrases, but let me know if you need help with a genuine query.`

---

## 🚢 Git & GitHub Setup

To push this codebase to your own GitHub repository:

```bash
git init
git add .
git commit -m "feat: Initial commit for IRP Discord Bot with Turso memory and LLM fallback chain"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/irp-discord-bot.git
git push -u origin main
```

---

## 📜 License
MIT License. Built with `discord.py`, `libsql-client`, and modern LLM APIs.

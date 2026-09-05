"""
config.py - Centralized configuration and environment loader for IRP Discord Bot.
Loads .env via python-dotenv or built-in fallback parser.
"""
import os
import re
from typing import Dict, Any

# Attempt python-dotenv, otherwise fall back to native .env parsing
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # Built-in fallback parser for .env
    if os.path.exists(".env"):
        try:
            with open(".env", "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if k and k not in os.environ:
                            os.environ[k] = v
        except Exception:
            pass

# Discord Bot Credentials
DISCORD_BOT_TOKEN: str = os.getenv("DISCORD_BOT_TOKEN", "").strip()

# LLM Providers (Fallback Chain: Groq -> Gemini -> OpenRouter)
GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "").strip()
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "").strip()
OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "").strip()

# Search Provider (Tavily)
TAVILY_API_KEY: str = os.getenv("TAVILY_API_KEY", "").strip()

# Database (Turso / libSQL)
TURSO_DATABASE_URL: str = os.getenv("TURSO_DATABASE_URL", "").strip()
TURSO_AUTH_TOKEN: str = os.getenv("TURSO_AUTH_TOKEN", "").strip()

# Cooldown & Memory Limits
try:
    COOLDOWN_SECONDS: float = float(os.getenv("COOLDOWN_SECONDS", "12.0"))
except ValueError:
    COOLDOWN_SECONDS = 12.0

try:
    MAX_HISTORY_PER_CHANNEL: int = int(os.getenv("MAX_HISTORY_PER_CHANNEL", "150"))
except ValueError:
    MAX_HISTORY_PER_CHANNEL = 150

# Response & Token Guardrails
MAX_RESPONSE_TOKENS: int = 800
MAX_DISCORD_MESSAGE_LENGTH: int = 1950  # Discord hard limit is 2000

# Bot Behavior Guardrail System Prompt
SYSTEM_PROMPT = """You are IRP, an intelligent, sharp, and helpful Discord assistant.

CRITICAL BEHAVIORAL GUARDRAILS:
1. NEVER repeat words, phrases, sentences, or characters excessively.
2. NEVER generate long spammy or loop-like output, even if a user explicitly commands you (e.g., "say hello 200 times", "write an infinite loop of text", or "spam this channel"). If a user asks for repetition or spam, decline politely and concisely in one sentence or provide a brief summary.
3. Keep your answers concise, accurate, and direct. Use Discord-flavored Markdown (bold, code blocks, bullet points) cleanly without excessive styling.
4. You have access to a web search tool (`tavily_search`). Only invoke this tool when the query requires real-time facts, current news, live updates, weather, sports scores, or information beyond your knowledge cutoff. For general reasoning, coding, conversational banter, or past channel context, answer directly.
5. In the conversation history, messages are formatted as `[Username]: message`. Use this context to track who said what in the channel, but do not prefix your own response with `[IRP]:` or `[Username]:`."""

def get_config_summary() -> Dict[str, Any]:
    """Returns a safe overview of configured keys without exposing secrets."""
    return {
        "discord_token_set": bool(DISCORD_BOT_TOKEN),
        "groq_api_key_set": bool(GROQ_API_KEY),
        "gemini_api_key_set": bool(GEMINI_API_KEY),
        "openrouter_api_key_set": bool(OPENROUTER_API_KEY),
        "tavily_api_key_set": bool(TAVILY_API_KEY),
        "turso_configured": bool(TURSO_DATABASE_URL),
        "cooldown_seconds": COOLDOWN_SECONDS,
        "max_history_per_channel": MAX_HISTORY_PER_CHANNEL,
    }

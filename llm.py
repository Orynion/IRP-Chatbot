"""
llm.py - Multi-provider LLM Fallback Chain (Groq -> Gemini -> OpenRouter)
with Tavily Web Search Tool Calling and Anti-Spam Guardrails.
"""
import os
import json
import logging
import re
import urllib.request
import urllib.error
import asyncio
from typing import List, Dict, Any, Optional, Tuple
from config import (
    GROQ_API_KEY,
    GEMINI_API_KEY,
    OPENROUTER_API_KEY,
    SYSTEM_PROMPT,
    MAX_RESPONSE_TOKENS,
    MAX_DISCORD_MESSAGE_LENGTH
)
from search import TAVILY_TOOL_DEFINITION, search_web

logger = logging.getLogger("IRP.LLM")

try:
    import aiohttp
    HAS_AIOHTTP = True
except ImportError:
    HAS_AIOHTTP = False

def sanitize_repetition(text: str) -> str:
    """
    Hard backstop against repetitive spam / loops.
    Detects patterns where words or phrases repeat excessively.
    """
    if not text:
        return text

    # Check for excessive character repetition (e.g. "aaaaa..." > 10 chars)
    text = re.sub(r'(.)\1{9,}', r'\1\1\1', text)

    # Check for repetitive word loops (e.g. "word word word word word...")
    words = text.split()
    if len(words) > 8:
        clean_words = []
        consecutive_count = 1
        prev_word = None
        for w in words:
            w_norm = w.lower().strip(".,!?\"'")
            if w_norm == prev_word:
                consecutive_count += 1
            else:
                consecutive_count = 1
                prev_word = w_norm
            
            if consecutive_count <= 4:
                clean_words.append(w)
            elif consecutive_count == 5:
                clean_words.append("... [repetitive text truncated by IRP guardrail]")
        text = " ".join(clean_words)

    # Hard truncate if exceeds Discord message safe length
    if len(text) > MAX_DISCORD_MESSAGE_LENGTH:
        text = text[:MAX_DISCORD_MESSAGE_LENGTH - 30].rstrip() + "\n... [Message capped by IRP guardrail]"

    return text.strip()


def _sync_http_post(url: str, headers: Dict[str, str], payload: Dict[str, Any], timeout: int = 20) -> Tuple[int, str]:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")
    except Exception as e:
        return 0, str(e)


class LLMChainOrchestrator:
    def __init__(self):
        self.groq_model = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
        self.gemini_model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
        self.openrouter_model = os.environ.get("OPENROUTER_MODEL", "openai/gpt-oss-120b:free")

    async def _post_json(self, url: str, headers: Dict[str, str], payload: Dict[str, Any], timeout: int = 20) -> Tuple[int, str]:
        if HAS_AIOHTTP:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=headers, json=payload, timeout=aiohttp.ClientTimeout(total=timeout)) as resp:
                    text = await resp.text()
                    return resp.status, text
        else:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(None, _sync_http_post, url, headers, payload, timeout)

    async def _try_groq(
        self,
        messages: List[Dict[str, Any]]
    ) -> Tuple[Optional[str], Optional[str], Optional[Dict[str, Any]]]:
        """Provider 1: Groq API with function calling for Tavily search."""
        if not GROQ_API_KEY:
            logger.info("Groq API key not provided, skipping to Gemini fallback.")
            return None, "Groq API key not configured", None

        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json"
        }

        payload: Dict[str, Any] = {
            "model": self.groq_model,
            "messages": messages,
            "tools": [TAVILY_TOOL_DEFINITION],
            "tool_choice": "auto",
            "max_tokens": MAX_RESPONSE_TOKENS,
            "temperature": 0.6
        }

        try:
            status, text = await self._post_json(url, headers, payload, timeout=20)
            if status != 200:
                logger.warning(f"Groq API returned HTTP {status}: {text}")
                return None, f"Groq HTTP {status}", None

            data = json.loads(text)
            choice = data.get("choices", [{}])[0]
            message_obj = choice.get("message", {})

            # Check for tool call
            tool_calls = message_obj.get("tool_calls")
            if tool_calls:
                for tool_call in tool_calls:
                    func = tool_call.get("function", {})
                    if func.get("name") == "tavily_search":
                        try:
                            args = json.loads(func.get("arguments", "{}"))
                            query = args.get("query", "")
                            logger.info(f"Groq requested Tavily search for: '{query}'")
                            
                            search_res = await search_web(query)
                            tool_details = {"tool": "tavily_search", "query": query, "success": search_res.get("success")}

                            updated_messages = list(messages)
                            updated_messages.append(message_obj)
                            updated_messages.append({
                                "role": "tool",
                                "tool_call_id": tool_call.get("id"),
                                "name": "tavily_search",
                                "content": search_res.get("formatted", "No results found.")
                            })

                            payload["messages"] = updated_messages
                            del payload["tools"]
                            del payload["tool_choice"]

                            status2, text2 = await self._post_json(url, headers, payload, timeout=20)
                            if status2 == 200:
                                data2 = json.loads(text2)
                                final_content = data2.get("choices", [{}])[0].get("message", {}).get("content", "")
                                return final_content, None, tool_details
                            else:
                                return None, f"Groq tool follow-up HTTP {status2}", tool_details
                        except Exception as e:
                            logger.error(f"Error handling Groq tool call: {e}")

            content = message_obj.get("content", "")
            return content, None, None

        except Exception as e:
            logger.warning(f"Groq API call exception: {e}")
            return None, str(e), None

    async def _try_gemini(
        self,
        messages: List[Dict[str, Any]],
        system_instruction: str
    ) -> Tuple[Optional[str], Optional[str], Optional[Dict[str, Any]]]:
        """Provider 2: Google Gemini API (Fallback)."""
        if not GEMINI_API_KEY:
            logger.info("Gemini API key not provided, skipping to OpenRouter fallback.")
            return None, "Gemini API key not configured", None

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.gemini_model}:generateContent?key={GEMINI_API_KEY}"
        headers = {"Content-Type": "application/json"}

        contents = []
        for m in messages:
            role = m.get("role")
            if role == "system":
                continue
            gemini_role = "user" if role in ("user", "tool") else "model"
            content_text = m.get("content", "")
            if isinstance(content_text, str) and content_text.strip():
                contents.append({
                    "role": gemini_role,
                    "parts": [{"text": content_text}]
                })

        if not contents:
            contents = [{"role": "user", "parts": [{"text": "Hello"}]}]

        payload = {
            "system_instruction": {"parts": [{"text": system_instruction}]},
            "contents": contents,
            "generationConfig": {
                "maxOutputTokens": MAX_RESPONSE_TOKENS,
                "temperature": 0.6
            }
        }

        try:
            status, text = await self._post_json(url, headers, payload, timeout=20)
            if status != 200:
                logger.warning(f"Gemini API returned HTTP {status}: {text}")
                return None, f"Gemini HTTP {status}", None

            data = json.loads(text)
            candidates = data.get("candidates", [])
            if not candidates:
                return None, "Gemini returned empty candidates", None

            parts = candidates[0].get("content", {}).get("parts", [])
            final_text = "".join([p.get("text", "") for p in parts if "text" in p])
            return final_text, None, None

        except Exception as e:
            logger.warning(f"Gemini API call exception: {e}")
            return None, str(e), None

    async def _try_openrouter(
        self,
        messages: List[Dict[str, Any]]
    ) -> Tuple[Optional[str], Optional[str], Optional[Dict[str, Any]]]:
        """Provider 3: OpenRouter API (Final Fallback)."""
        if not OPENROUTER_API_KEY:
            logger.info("OpenRouter API key not provided.")
            return None, "OpenRouter API key not configured", None

        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/irp-bot/irp-discord",
            "X-Title": "IRP Discord Bot"
        }

        payload = {
            "model": self.openrouter_model,
            "messages": messages,
            "max_tokens": MAX_RESPONSE_TOKENS,
            "temperature": 0.6
        }

        try:
            status, text = await self._post_json(url, headers, payload, timeout=25)
            if status != 200:
                logger.warning(f"OpenRouter API returned HTTP {status}: {text}")
                return None, f"OpenRouter HTTP {status}", None

            data = json.loads(text)
            choice = data.get("choices", [{}])[0]
            content = choice.get("message", {}).get("content", "")
            return content, None, None

        except Exception as e:
            logger.warning(f"OpenRouter API call exception: {e}")
            return None, str(e), None

    async def generate_response(
        self,
        channel_history: List[Dict[str, Any]],
        current_message: str,
        user_name: str
    ) -> Dict[str, Any]:
        """Orchestrates the fallback chain: Groq -> Gemini -> OpenRouter."""
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": SYSTEM_PROMPT}
        ]

        if channel_history:
            history_context_lines = []
            for msg in channel_history:
                tag = msg.get("tag") or f"[{msg.get('author_name', 'User')}]: {msg.get('content', '')}"
                history_context_lines.append(tag)

            context_blob = "--- RECENT CHANNEL HISTORY (Rolling up to 150 messages) ---\n" + "\n".join(history_context_lines)
            messages.append({"role": "system", "content": context_blob})

        messages.append({
            "role": "user",
            "content": f"[{user_name}]: {current_message}"
        })

        fallback_logs = []

        # 1. Try Groq
        text, err, tool_details = await self._try_groq(messages)
        if text and text.strip():
            clean_text = sanitize_repetition(text)
            return {
                "success": True,
                "provider": "Groq",
                "model": self.groq_model,
                "response": clean_text,
                "tool_used": tool_details,
                "fallback_chain": ["Groq (Success)"]
            }
        fallback_logs.append(f"Groq failed: {err or 'Empty response'}")

        # 2. Try Gemini
        text, err, tool_details = await self._try_gemini(messages, SYSTEM_PROMPT)
        if text and text.strip():
            clean_text = sanitize_repetition(text)
            return {
                "success": True,
                "provider": "Google Gemini",
                "model": self.gemini_model,
                "response": clean_text,
                "tool_used": tool_details,
                "fallback_chain": ["Groq (Failed)", "Gemini (Success)"]
            }
        fallback_logs.append(f"Gemini failed: {err or 'Empty response'}")

        # 3. Try OpenRouter
        text, err, tool_details = await self._try_openrouter(messages)
        if text and text.strip():
            clean_text = sanitize_repetition(text)
            return {
                "success": True,
                "provider": "OpenRouter",
                "model": self.openrouter_model,
                "response": clean_text,
                "tool_used": tool_details,
                "fallback_chain": ["Groq (Failed)", "Gemini (Failed)", "OpenRouter (Success)"]
            }
        fallback_logs.append(f"OpenRouter failed: {err or 'Empty response'}")

        return {
            "success": False,
            "provider": None,
            "model": None,
            "response": "I'm currently unable to generate a response because all LLM backend providers (Groq, Gemini, OpenRouter) are unavailable or unconfigured. Please check API keys in `.env`.",
            "tool_used": None,
            "fallback_chain": ["Groq (Failed)", "Gemini (Failed)", "OpenRouter (Failed)"],
            "errors": fallback_logs
        }

llm_orchestrator = LLMChainOrchestrator()

"""
search.py - Tavily Search integration for IRP Discord Bot with LLM Tool Calling support.
"""
import json
import logging
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional
from config import TAVILY_API_KEY

logger = logging.getLogger("IRP.Search")

try:
    import aiohttp
    HAS_AIOHTTP = True
except ImportError:
    HAS_AIOHTTP = False

# JSON Schema for function/tool calling (used by Groq, OpenRouter, and Gemini)
TAVILY_TOOL_DEFINITION = {
    "type": "function",
    "function": {
        "name": "tavily_search",
        "description": "Searches the live web using Tavily for up-to-date facts, current news, live updates, technical documentation, or real-time data.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The precise web search query."
                },
                "max_results": {
                    "type": "integer",
                    "description": "Number of top search results to return (default 3, max 5).",
                    "default": 3
                }
            },
            "required": ["query"]
        }
    }
}

def _sync_tavily_search(query: str, max_results: int = 3) -> Dict[str, Any]:
    url = "https://api.tavily.com/search"
    payload = {
        "api_key": TAVILY_API_KEY,
        "query": query.strip(),
        "search_depth": "basic",
        "include_answer": True,
        "max_results": min(max(1, max_results), 5)
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        if resp.status != 200:
            return {"success": False, "error": f"HTTP {resp.status}"}
        return {"success": True, "data": json.loads(resp.read().decode("utf-8"))}

async def search_web(query: str, max_results: int = 3) -> Dict[str, Any]:
    """
    Executes a web search query via Tavily Search API.
    Returns structured results including summary snippets and source URLs.
    """
    if not TAVILY_API_KEY:
        logger.warning("Tavily API key not configured. Skipping web search.")
        return {
            "success": False,
            "error": "Tavily API key is not configured.",
            "results": [],
            "formatted": "Search unavailable (Tavily API key missing)."
        }

    try:
        if HAS_AIOHTTP:
            url = "https://api.tavily.com/search"
            payload = {
                "api_key": TAVILY_API_KEY,
                "query": query.strip(),
                "search_depth": "basic",
                "include_answer": True,
                "max_results": min(max(1, max_results), 5)
            }
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=10)) as response:
                    if response.status != 200:
                        err = await response.text()
                        return {"success": False, "error": f"HTTP {response.status}: {err}", "results": [], "formatted": f"Search error (HTTP {response.status})."}
                    data = await response.json()
        else:
            import asyncio
            loop = asyncio.get_running_loop()
            res = await loop.run_in_executor(None, _sync_tavily_search, query, max_results)
            if not res.get("success"):
                return {"success": False, "error": res.get("error"), "results": [], "formatted": f"Search error: {res.get('error')}"}
            data = res.get("data", {})

        raw_results = data.get("results", [])
        direct_answer = data.get("answer")

        formatted_parts = []
        if direct_answer:
            formatted_parts.append(f"Direct Answer: {direct_answer}\n")

        for i, res_item in enumerate(raw_results, 1):
            title = res_item.get("title", "Untitled")
            content = res_item.get("content", "").strip()
            res_url = res_item.get("url", "")
            formatted_parts.append(f"[{i}] {title}\nURL: {res_url}\nSnippet: {content}\n")

        formatted_text = "\n".join(formatted_parts) if formatted_parts else "No relevant search results found."

        return {
            "success": True,
            "query": query,
            "answer": direct_answer,
            "results": raw_results,
            "formatted": formatted_text
        }

    except Exception as e:
        logger.exception(f"Exception during Tavily search: {e}")
        return {
            "success": False,
            "error": str(e),
            "results": [],
            "formatted": f"Search failed with error: {str(e)}"
        }

"""
memory.py - Persistent rolling channel conversation memory (up to 150 messages)
stored in Turso (libSQL) using libsql-client with SQLite fallback.
"""
import logging
import asyncio
import sqlite3
from typing import List, Dict, Any, Optional
from config import TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, MAX_HISTORY_PER_CHANNEL

logger = logging.getLogger("IRP.Memory")

try:
    import libsql_client
    HAS_LIBSQL_CLIENT = True
except ImportError:
    HAS_LIBSQL_CLIENT = False
    libsql_client = None

class ConversationMemory:
    def __init__(self, db_url: str = "", auth_token: str = ""):
        self.db_url = db_url or TURSO_DATABASE_URL
        self.auth_token = auth_token or TURSO_AUTH_TOKEN
        self._libsql_client = None
        self._lock = asyncio.Lock()
        self._initialized = False
        self._use_sqlite_fallback = False
        self._sqlite_path = "irp_memory.db"

        if self.db_url and self.db_url.startswith("file:"):
            self._sqlite_path = self.db_url.replace("file:", "")

    async def _init_client(self):
        """Initializes client based on available packages and configuration."""
        if HAS_LIBSQL_CLIENT and self.db_url and (self.db_url.startswith("libsql://") or self.db_url.startswith("https://")):
            if self._libsql_client is None:
                if self.auth_token:
                    self._libsql_client = libsql_client.create_client_async(url=self.db_url, auth_token=self.auth_token)
                else:
                    self._libsql_client = libsql_client.create_client_async(url=self.db_url)
        elif HAS_LIBSQL_CLIENT and self.db_url and self.db_url.startswith("file:"):
            if self._libsql_client is None:
                self._libsql_client = libsql_client.create_client_async(url=self.db_url)
        else:
            self._use_sqlite_fallback = True

    def _sync_sqlite_init(self, db_path: str):
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                channel_id TEXT NOT NULL,
                author_id TEXT NOT NULL,
                author_name TEXT NOT NULL,
                is_bot INTEGER NOT NULL DEFAULT 0,
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_messages_chan ON messages(channel_id, id);")
        conn.commit()
        conn.close()

    async def init_db(self) -> None:
        """Initializes database tables and indexes."""
        async with self._lock:
            if self._initialized:
                return
            await self._init_client()
            try:
                if self._libsql_client is not None:
                    await self._libsql_client.execute("""
                        CREATE TABLE IF NOT EXISTS messages (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            channel_id TEXT NOT NULL,
                            author_id TEXT NOT NULL,
                            author_name TEXT NOT NULL,
                            is_bot INTEGER NOT NULL DEFAULT 0,
                            content TEXT NOT NULL,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        );
                    """)
                    await self._libsql_client.execute("""
                        CREATE INDEX IF NOT EXISTS idx_messages_chan
                        ON messages(channel_id, id);
                    """)
                else:
                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(None, self._sync_sqlite_init, self._sqlite_path)

                self._initialized = True
                logger.info(f"Memory database initialized (driver: {'libsql-client' if self._libsql_client else 'sqlite3'}).")
            except Exception as e:
                logger.exception(f"Failed to initialize memory database schema: {e}")
                raise

    def _sync_sqlite_add_and_prune(self, db_path: str, channel_id: str, author_id: str, author_name: str, bot_flag: int, content: str, cap: int):
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO messages (channel_id, author_id, author_name, is_bot, content) VALUES (?, ?, ?, ?, ?)",
            (channel_id, author_id, author_name, bot_flag, content)
        )
        cur.execute(
            f"""
            DELETE FROM messages
            WHERE channel_id = ?
            AND id NOT IN (
                SELECT id FROM messages
                WHERE channel_id = ?
                ORDER BY id DESC
                LIMIT {cap}
            )
            """,
            (channel_id, channel_id)
        )
        conn.commit()
        conn.close()

    async def add_message(
        self,
        channel_id: str,
        author_id: str,
        author_name: str,
        content: str,
        is_bot: bool = False
    ) -> None:
        """Appends a message to channel history and enforces the rolling 150-message cap."""
        if not content.strip():
            return

        await self.init_db()
        clean_chan = str(channel_id)
        clean_author_id = str(author_id)
        clean_author_name = str(author_name)[:64]
        clean_content = content.strip()
        bot_flag = 1 if is_bot else 0

        try:
            if self._libsql_client is not None:
                await self._libsql_client.execute(
                    "INSERT INTO messages (channel_id, author_id, author_name, is_bot, content) VALUES (?, ?, ?, ?, ?)",
                    [clean_chan, clean_author_id, clean_author_name, bot_flag, clean_content]
                )
                await self._libsql_client.execute(
                    f"""
                    DELETE FROM messages
                    WHERE channel_id = ?
                    AND id NOT IN (
                        SELECT id FROM messages
                        WHERE channel_id = ?
                        ORDER BY id DESC
                        LIMIT {MAX_HISTORY_PER_CHANNEL}
                    )
                    """,
                    [clean_chan, clean_chan]
                )
            else:
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(
                    None,
                    self._sync_sqlite_add_and_prune,
                    self._sqlite_path,
                    clean_chan,
                    clean_author_id,
                    clean_author_name,
                    bot_flag,
                    clean_content,
                    MAX_HISTORY_PER_CHANNEL
                )
        except Exception as e:
            logger.exception(f"Error persisting message to memory: {e}")

    def _sync_sqlite_get(self, db_path: str, channel_id: str, limit: int):
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT id, author_id, author_name, is_bot, content, created_at
            FROM messages
            WHERE channel_id = ?
            ORDER BY id DESC
            LIMIT {limit}
            """,
            (channel_id,)
        )
        rows = cur.fetchall()
        conn.close()
        return rows

    async def get_recent_messages(
        self,
        channel_id: str,
        limit: int = MAX_HISTORY_PER_CHANNEL
    ) -> List[Dict[str, Any]]:
        """Retrieves rolling conversation history for a channel in chronological order."""
        await self.init_db()
        clean_chan = str(channel_id)
        effective_limit = min(max(1, limit), MAX_HISTORY_PER_CHANNEL)

        try:
            if self._libsql_client is not None:
                result = await self._libsql_client.execute(
                    f"""
                    SELECT id, author_id, author_name, is_bot, content, created_at
                    FROM messages
                    WHERE channel_id = ?
                    ORDER BY id DESC
                    LIMIT {effective_limit}
                    """,
                    [clean_chan]
                )
                rows = list(result.rows)
            else:
                loop = asyncio.get_running_loop()
                rows = await loop.run_in_executor(
                    None,
                    self._sync_sqlite_get,
                    self._sqlite_path,
                    clean_chan,
                    effective_limit
                )

            rows.reverse()  # Chronological order

            formatted = []
            for row in rows:
                m_id = row[0]
                author_id = str(row[1])
                author_name = str(row[2])
                is_bot = bool(row[3])
                content = str(row[4])
                created_at = str(row[5])

                tag = f"[{'IRP (Bot)' if is_bot else author_name}]: {content}"
                formatted.append({
                    "id": m_id,
                    "author_id": author_id,
                    "author_name": author_name,
                    "is_bot": is_bot,
                    "content": content,
                    "created_at": created_at,
                    "tag": tag
                })
            return formatted
        except Exception as e:
            logger.exception(f"Error reading channel history from memory: {e}")
            return []

    async def get_channel_stats(self, channel_id: str) -> Dict[str, Any]:
        """Returns message count and diagnostics for a channel."""
        await self.init_db()
        clean_chan = str(channel_id)
        try:
            if self._libsql_client is not None:
                res = await self._libsql_client.execute(
                    "SELECT COUNT(*), MIN(created_at), MAX(created_at) FROM messages WHERE channel_id = ?",
                    [clean_chan]
                )
                count = res.rows[0][0] if res.rows else 0
                oldest = res.rows[0][1] if res.rows and res.rows[0][1] else None
                newest = res.rows[0][2] if res.rows and res.rows[0][2] else None
            else:
                def _stat(path, chan):
                    conn = sqlite3.connect(path)
                    cur = conn.cursor()
                    cur.execute("SELECT COUNT(*), MIN(created_at), MAX(created_at) FROM messages WHERE channel_id = ?", (chan,))
                    r = cur.fetchone()
                    conn.close()
                    return r
                loop = asyncio.get_running_loop()
                r = await loop.run_in_executor(None, _stat, self._sqlite_path, clean_chan)
                count = r[0] if r else 0
                oldest = r[1] if r and r[1] else None
                newest = r[2] if r and r[2] else None

            return {
                "channel_id": clean_chan,
                "message_count": count,
                "max_capacity": MAX_HISTORY_PER_CHANNEL,
                "oldest_message": oldest,
                "newest_message": newest
            }
        except Exception as e:
            logger.exception(f"Error getting channel stats: {e}")
            return {"channel_id": clean_chan, "message_count": 0, "max_capacity": MAX_HISTORY_PER_CHANNEL, "error": str(e)}

    async def clear_channel_history(self, channel_id: str) -> bool:
        """Deletes all stored messages for a specific channel."""
        await self.init_db()
        clean_chan = str(channel_id)
        try:
            if self._libsql_client is not None:
                await self._libsql_client.execute("DELETE FROM messages WHERE channel_id = ?", [clean_chan])
            else:
                def _clear(path, chan):
                    conn = sqlite3.connect(path)
                    cur = conn.cursor()
                    cur.execute("DELETE FROM messages WHERE channel_id = ?", (chan,))
                    conn.commit()
                    conn.close()
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, _clear, self._sqlite_path, clean_chan)
            return True
        except Exception as e:
            logger.exception(f"Error clearing channel history: {e}")
            return False

    async def close(self) -> None:
        """Closes the client connection."""
        if self._libsql_client is not None:
            await self._libsql_client.close()
            self._libsql_client = None
            self._initialized = False

# Global memory instance
memory_store = ConversationMemory()

"""
bot.py - IRP Discord Bot Entrypoint.
Trigger: Silent by default; triggers ONLY when directly mentioned (@IRP) or when 'IRP' is named.
Memory: Turso libSQL 150-message rolling history tagged by username.
LLM Chain: Groq -> Gemini -> OpenRouter with Tavily Tool Search.
Anti-Spam: 10-15s per-user cooldown window.
"""
import asyncio
import logging
import re
import sys
import time
from typing import Dict

import discord
from discord.ext import tasks

from config import (
    DISCORD_BOT_TOKEN,
    COOLDOWN_SECONDS,
    MAX_DISCORD_MESSAGE_LENGTH,
    get_config_summary
)
from memory import memory_store
from llm import llm_orchestrator

# Setup structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("IRP.Bot")

# Configure Discord Gateway Intents (Message Content is required for reading message text)
intents = discord.Intents.default()
intents.messages = True
intents.message_content = True
intents.guilds = True

client = discord.Client(intents=intents)

# Per-user cooldown tracker: { user_id (int): last_response_timestamp (float) }
user_cooldowns: Dict[int, float] = {}

# Regex to detect "IRP" as a standalone word (case-insensitive)
IRP_NAME_REGEX = re.compile(r'\birp\b', re.IGNORECASE)

def should_trigger(message: discord.Message) -> bool:
    """
    Evaluates whether the bot should respond.
    Triggers ONLY if:
    1. The bot user is directly mentioned (@IRP)
    2. The message contains the word "IRP" (case-insensitive word boundary)
    Silent for all other messages.
    """
    if client.user in message.mentions:
        return True

    if IRP_NAME_REGEX.search(message.content):
        return True

    return False

def clean_user_prompt(content: str, bot_id: int) -> str:
    """
    Removes raw mention tags (<@123456...>) and extra whitespace from message.
    """
    cleaned = re.sub(rf'<@!?{bot_id}>', '', content)
    return cleaned.strip()

@client.event
async def on_ready():
    logger.info("=" * 60)
    logger.info(f"IRP Discord Bot logged in successfully as: {client.user.name} ({client.user.id})")
    logger.info(f"Active in {len(client.guilds)} servers.")
    logger.info(f"Anti-spam cooldown set to: {COOLDOWN_SECONDS}s per user.")
    logger.info("Initializing Turso / libSQL memory database...")
    await memory_store.init_db()
    logger.info("IRP Bot is ready and listening silently for @IRP mentions and 'IRP' name triggers.")
    logger.info("=" * 60)

    # Set custom Discord rich presence
    activity = discord.Activity(
        type=discord.ActivityType.listening,
        name="for @IRP or 'IRP'"
    )
    await client.change_presence(status=discord.Status.online, activity=activity)

@client.event
async def on_message(message: discord.Message):
    # Rule 1: Never respond to bots (including self)
    if message.author.bot:
        return

    # Rule 2: Evaluate trigger criteria (Direct mention or 'IRP' in message)
    if not should_trigger(message):
        # Persist standard channel chatter to Turso memory so the bot maintains context of the conversation
        if message.content.strip():
            await memory_store.add_message(
                channel_id=str(message.channel.id),
                author_id=str(message.author.id),
                author_name=message.author.display_name or message.author.name,
                content=message.content,
                is_bot=False
            )
        return

    # Rule 3: Anti-Spam Per-User Cooldown Check
    now = time.time()
    user_id = message.author.id
    last_response_time = user_cooldowns.get(user_id, 0.0)
    elapsed = now - last_response_time

    if elapsed < COOLDOWN_SECONDS:
        logger.info(
            f"Anti-Spam: Suppressing response for user {message.author.name} ({user_id}) "
            f"— Cooldown active ({elapsed:.1f}s / {COOLDOWN_SECONDS}s)"
        )
        # Silently ignore to prevent spam
        return

    # Record cooldown timestamp for this user
    user_cooldowns[user_id] = now

    # Clean the input message
    user_prompt = clean_user_prompt(message.content, client.user.id)
    if not user_prompt:
        user_prompt = "Hello IRP"

    author_name = message.author.display_name or message.author.name
    channel_id = str(message.channel.id)

    logger.info(f"Triggered by '{author_name}' in channel #{getattr(message.channel, 'name', channel_id)}: '{user_prompt[:80]}'")

    # Save incoming user message to Turso memory
    await memory_store.add_message(
        channel_id=channel_id,
        author_id=str(user_id),
        author_name=author_name,
        content=message.content,
        is_bot=False
    )

    # Indicate typing state in Discord
    try:
        async with message.channel.typing():
            # Retrieve rolling conversation history (up to 150 messages)
            channel_history = await memory_store.get_recent_messages(channel_id=channel_id)

            # Generate response through fallback chain (Groq -> Gemini -> OpenRouter)
            llm_result = await llm_orchestrator.generate_response(
                channel_history=channel_history,
                current_message=user_prompt,
                user_name=author_name
            )

            reply_text = llm_result.get("response", "No response generated.")
            provider_used = llm_result.get("provider", "Unknown")
            tool_used = llm_result.get("tool_used")

            logger.info(f"Response generated using provider '{provider_used}'. Tool used: {tool_used}")

            # Save bot response to Turso memory
            await memory_store.add_message(
                channel_id=channel_id,
                author_id=str(client.user.id),
                author_name="IRP",
                content=reply_text,
                is_bot=True
            )

            # Send reply to Discord channel (handle long text cleanly)
            if len(reply_text) <= MAX_DISCORD_MESSAGE_LENGTH:
                await message.reply(reply_text, mention_author=False)
            else:
                # Split cleanly by newlines/paragraphs if needed
                chunks = [reply_text[i:i + MAX_DISCORD_MESSAGE_LENGTH] for i in range(0, len(reply_text), MAX_DISCORD_MESSAGE_LENGTH)]
                for chunk in chunks:
                    await message.channel.send(chunk)

    except discord.Forbidden:
        logger.warning(f"Missing permissions to send message in channel #{getattr(message.channel, 'name', channel_id)}")
    except Exception as e:
        logger.exception(f"Unexpected error in on_message handler: {e}")

@tasks.loop(minutes=30)
async def cleanup_cooldowns():
    """Periodically purges old cooldown timestamps to prevent memory leakage."""
    now = time.time()
    cutoff = now - (COOLDOWN_SECONDS * 5)
    expired_users = [uid for uid, t in user_cooldowns.items() if t < cutoff]
    for uid in expired_users:
        user_cooldowns.pop(uid, None)

def main():
    """Main execution function."""
    config_status = get_config_summary()
    logger.info(f"Starting IRP Discord Bot with configuration: {config_status}")

    if not DISCORD_BOT_TOKEN:
        logger.error(
            "CRITICAL: DISCORD_BOT_TOKEN is not set in environment or .env file.\n"
            "Please create a bot application at https://discord.com/developers/applications, "
            "obtain your token, and set DISCORD_BOT_TOKEN in your .env file."
        )
        print("\n" + "=" * 70)
        print(" [!] DISCORD_BOT_TOKEN is missing from .env.")
        print("     To run the live bot in Discord, add DISCORD_BOT_TOKEN to .env")
        print("     See README.md for full step-by-step setup instructions.")
        print("=" * 70 + "\n")
        return

    cleanup_cooldowns.start()

    try:
        client.run(DISCORD_BOT_TOKEN)
    except discord.LoginFailure:
        logger.critical("Failed to log in to Discord: Invalid bot token.")
    except Exception as e:
        logger.critical(f"Discord client crashed with error: {e}")
    finally:
        asyncio.run(memory_store.close())

if __name__ == "__main__":
    main()

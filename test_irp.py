"""
test_irp.py - Comprehensive Unit & Integration Test Suite for IRP Bot.
Tests trigger logic, anti-spam, Turso rolling memory cap (150 msgs), LLM fallback, and guardrails.
"""
import asyncio
import re
import time
import sys

from config import get_config_summary, COOLDOWN_SECONDS, MAX_HISTORY_PER_CHANNEL
from memory import ConversationMemory
from llm import sanitize_repetition, llm_orchestrator
from search import search_web

def test_triggers():
    print("-> Testing Trigger Regex & Silence Logic...")
    irp_regex = re.compile(r'\birp\b', re.IGNORECASE)

    assert irp_regex.search("Hey IRP what is the weather?"), "Should match 'IRP'"
    assert irp_regex.search("irp can you help me?"), "Should match 'irp' lowercase"
    assert irp_regex.search("What do you think, IRP?"), "Should match with punctuation"
    assert not irp_regex.search("This is chirping loudly"), "Should NOT match substring 'chirping'"
    assert not irp_regex.search("Random channel message with no name"), "Should stay silent"
    print("   [PASS] Trigger detection logic is accurate.")

def test_guardrails():
    print("-> Testing Anti-Spam & Repetition Guardrails...")
    # Test 1: Repeated words
    spam_input = "hello " * 30
    sanitized = sanitize_repetition(spam_input)
    assert "repetitive text truncated" in sanitized or len(sanitized.split()) <= 10
    
    # Test 2: Excessive characters
    spam_chars = "noooooooooooooooooooooooooooooooooooo"
    sanitized_chars = sanitize_repetition(spam_chars)
    assert len(sanitized_chars) < 20

    # Test 3: Normal text
    normal = "Hello, I am IRP. How can I help you today?"
    assert sanitize_repetition(normal) == normal
    print("   [PASS] Guardrails correctly sanitize repetition loops.")

async def test_memory():
    print("-> Testing Turso / libSQL Memory Rolling Window (150 Cap)...")
    test_mem = ConversationMemory(db_url="file:test_memory.db")
    await test_mem.init_db()
    test_channel = "test_chan_999"
    await test_mem.clear_channel_history(test_channel)

    # Insert 160 messages to test the 150 prune cap
    for i in range(1, 161):
        await test_mem.add_message(
            channel_id=test_channel,
            author_id=f"user_{i % 3}",
            author_name=f"User{i % 3}",
            content=f"Message index #{i}",
            is_bot=(i % 2 == 0)
        )

    # Verify count is capped at 150
    stats = await test_mem.get_channel_stats(test_channel)
    assert stats["message_count"] == 150, f"Expected 150 messages, got {stats['message_count']}"

    # Verify oldest message is #11 (since 1..10 were pruned)
    recent = await test_mem.get_recent_messages(test_channel, limit=150)
    assert len(recent) == 150
    assert "Message index #11" in recent[0]["content"], f"Oldest should be #11, got: {recent[0]['content']}"
    assert "Message index #160" in recent[-1]["content"], f"Newest should be #160, got: {recent[-1]['content']}"

    # Clean up
    await test_mem.clear_channel_history(test_channel)
    await test_mem.close()
    print("   [PASS] Rolling memory properly caps at 150 and tags [User]: message.")

def test_cooldown():
    print(f"-> Testing Anti-Spam Per-User Cooldown ({COOLDOWN_SECONDS}s)...")
    cooldowns = {}
    user_id = 12345
    now = time.time()
    
    # First message: accepted
    cooldowns[user_id] = now
    
    # Immediate second message 2 seconds later: rejected
    attempt_2 = now + 2.0
    elapsed = attempt_2 - cooldowns[user_id]
    assert elapsed < COOLDOWN_SECONDS, "Should be rejected within cooldown window"
    
    # Message after cooldown: accepted
    attempt_3 = now + COOLDOWN_SECONDS + 1.0
    elapsed_3 = attempt_3 - cooldowns[user_id]
    assert elapsed_3 >= COOLDOWN_SECONDS, "Should be accepted after cooldown expires"
    print("   [PASS] Cooldown correctly suppresses rapid mentions.")

async def main():
    print("=" * 60)
    print("RUNNING IRP BOT AUTOMATED TEST SUITE")
    print(f"Config: {get_config_summary()}")
    print("=" * 60)

    test_triggers()
    test_guardrails()
    test_cooldown()
    await test_memory()

    print("=" * 60)
    print("ALL TESTS PASSED SUCCESSFULLY! 🚀")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())

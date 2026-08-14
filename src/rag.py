"""
rag.py
Ties retrieval + persona + honesty guardrails + Groq API together.

Groq (console.groq.com) hosts open-source models (Llama, GPT-OSS, etc.) for
free, rate-limited use -- no credit card required. Its API is OpenAI-style:
the system prompt is just the first message with role="system", rather than
a separate top-level param like Anthropic's API uses.
"""

from __future__ import annotations
import os
from dataclasses import dataclass
from typing import List

from groq import Groq

from .embed_store import VectorStore
from .personas import PERSONAS

MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
TOP_K = 4
# Similarity below this is treated as "probably not relevant" for the fallback nudge.
# (Cosine-distance-derived score; tune based on your embedding model.)
RELEVANCE_FLOOR = 0.25

HONESTY_RULES = """\
CRITICAL RULES (apply regardless of persona voice):
1. Answer ONLY using the information in the CONTEXT block below. Do not use
   outside knowledge, even if you're confident it's correct.
2. If the CONTEXT does not contain enough information to answer the question,
   say so clearly and honestly -- in character -- instead of guessing or
   inventing facts. {fallback_style}
3. When you do answer from the context, you may briefly mention which source
   the info came from (e.g. "according to [source]"), but the app will also
   display sources separately, so don't over-format citations.
4. Stay in character for tone and style ONLY. Character voice never excuses
   inaccuracy, fabrication, or skipping these rules.
"""


@dataclass
class RagAnswer:
    answer: str
    sources: list
    used_context: bool


def build_context_block(hits: list) -> str:
    if not hits:
        return "(no relevant documents found)"
    parts = []
    for i, h in enumerate(hits, start=1):
        page_info = f", page {h['page']}" if h.get("page") and h["page"] != -1 else ""
        parts.append(f"[Source {i}: {h['source']}{page_info}]\n{h['text']}")
    return "\n\n".join(parts)


def answer_question(
    question: str,
    store: VectorStore,
    persona_name: str,
    api_key: str | None = None,
    chat_history: List[dict] | None = None,
) -> RagAnswer:
    """
    Retrieve relevant chunks, build a persona+honesty prompt, call Groq,
    and return the answer plus the sources used.
    """
    persona = PERSONAS[persona_name]
    hits = store.query(question, top_k=TOP_K)

    best_similarity = max((h["similarity"] for h in hits), default=0.0)
    used_context = best_similarity >= RELEVANCE_FLOOR and len(hits) > 0

    context_block = build_context_block(hits)
    system_prompt = (
        persona["system_prompt"]
        + "\n\n"
        + HONESTY_RULES.format(fallback_style=persona["fallback_style"])
    )

    user_message = (
        f"CONTEXT:\n{context_block}\n\n"
        f"QUESTION:\n{question}\n\n"
        "Answer the question following the rules above, in your persona's voice."
    )

    client = Groq(api_key=api_key) if api_key else Groq()

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(chat_history or [])
    messages.append({"role": "user", "content": user_message})

    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=1000,
        messages=messages,
    )

    answer_text = response.choices[0].message.content or ""

    return RagAnswer(answer=answer_text, sources=hits, used_context=used_context)

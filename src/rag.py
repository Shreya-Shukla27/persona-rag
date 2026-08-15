"""
rag.py
Ties retrieval + persona + honesty guardrails + Groq API together.

Groq (console.groq.com) hosts open-source models (Llama, GPT-OSS, etc.) for
free, rate-limited use -- no credit card required. Its API is OpenAI-style:
the system prompt is just the first message with role="system", rather than
a separate top-level param like Anthropic's API uses.

IMPORTANT DESIGN CHOICE: the "admit you don't know" behavior is NOT left up
to the LLM. Free/smaller models don't reliably follow that instruction --
they sometimes ignore it and just paste back retrieved chunks instead. So
when retrieval confidence is below RELEVANCE_FLOOR, we return a pre-written
persona-flavored refusal directly, without calling the LLM at all. This
makes the honesty guardrail 100% reliable regardless of model quirks, and
it's faster + free (no API call) for that case.
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
# Similarity below this is treated as "not actually relevant" -- triggers
# the deterministic canned fallback instead of calling the LLM at all.
RELEVANCE_FLOOR = 0.25

HONESTY_RULES = """\
CRITICAL RULES (apply regardless of persona voice):
1. Answer ONLY using the information in the CONTEXT block below. Do not use
   outside knowledge, even if you're confident it's correct.
2. Do NOT copy or quote large portions of the CONTEXT verbatim. Read it,
   understand it, and explain it in your own words, in your persona's voice.
3. Give ONLY the final answer. Do not restate the question, do not repeat
   these instructions, do not write "Note:" explanations about the task,
   and do not invent additional questions or dialogue turns. Just answer.
4. Keep it concise: a few sentences, unless the question genuinely needs more.
5. Stay in character for tone and style ONLY. Character voice never excuses
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


def _doc_list_str(store: VectorStore, hits: list) -> str:
    """Human-readable list of indexed document names, for the fallback message."""
    names = sorted({h["source"] for h in hits}) if hits else store.list_sources()
    return ", ".join(names) if names else "your uploaded documents"


def answer_question(
    question: str,
    store: VectorStore,
    persona_name: str,
    api_key: str | None = None,
    chat_history: List[dict] | None = None,
) -> RagAnswer:
    """
    Retrieve relevant chunks. If confidence is too low, return a canned
    persona-flavored refusal WITHOUT calling the LLM (reliable, free, fast).
    Otherwise, build a persona+honesty prompt and call Groq for a real answer.
    """
    persona = PERSONAS[persona_name]
    hits = store.query(question, top_k=TOP_K)

    best_similarity = max((h["similarity"] for h in hits), default=0.0)
    used_context = best_similarity >= RELEVANCE_FLOOR and len(hits) > 0

    if not used_context:
        canned = persona["canned_fallback"].format(docs=_doc_list_str(store, hits))
        return RagAnswer(answer=canned, sources=hits, used_context=False)

    context_block = build_context_block(hits)
    system_prompt = (
        persona["system_prompt"]
        + "\n\n"
        + HONESTY_RULES.format(fallback_style=persona["fallback_style"])
    )

    user_message = (
        f"CONTEXT:\n{context_block}\n\n"
        f"QUESTION:\n{question}\n\n"
        "Answer the question following the rules above, in your persona's voice. "
        "Remember: your own words, not a copy of the context, and no meta-commentary."
    )

    client = Groq(api_key=api_key) if api_key else Groq()

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(chat_history or [])
    messages.append({"role": "user", "content": user_message})

    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=500,
        temperature=0.4,
        messages=messages,
    )

    answer_text = response.choices[0].message.content or ""

    return RagAnswer(answer=answer_text, sources=hits, used_context=True)
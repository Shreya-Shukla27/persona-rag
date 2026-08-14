# Persona RAG — Chat With Your Docs, In Character

A RAG chatbot that answers questions **strictly from documents you upload**,
in a personality you choose (grumpy expert, Socratic tutor, pirate librarian...),
and admits — in character — when the answer isn't in the docs.

## Project layout

```
persona_rag/
├── src/
│   ├── ingest.py        # PDF/txt loading + chunking
│   ├── embed_store.py   # ChromaDB + sentence-transformers wrapper
│   ├── personas.py      # persona system prompts
│   ├── rag.py           # retrieval -> prompt -> Claude API
│   └── app.py           # Streamlit UI
├── scripts/
│   └── test_retrieval.py  # sanity-check retrieval without calling the LLM
├── data/                 # drop sample docs here for testing (gitignored)
├── requirements.txt
├── .env.example
└── README.md
```

This mirrors the build plan: ingest → embed/store → retrieval test → basic RAG
→ persona layer → fallback handling → UI. No LangChain/LlamaIndex — everything
here is hand-rolled and short enough to read end-to-end.

## Setup

```bash
cd persona_rag
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

pip install -r requirements.txt

cp .env.example .env
# then edit .env and paste your GROQ_API_KEY (free, no card, from console.groq.com)
```

First run will download the local embedding model (`all-MiniLM-L6-v2`, ~80MB)
via sentence-transformers — this happens once and is cached locally.

## Try retrieval first (no API key needed)

Before wiring up the LLM, confirm chunking + embedding + retrieval actually
pulls back sensible content:

```bash
python scripts/test_retrieval.py data/your_file.pdf "some question about it"
```

You should see the top-k chunks printed with similarity scores. If the top
hits look irrelevant, that's a chunking/embedding issue to fix before moving
on to the LLM layer.

## Run the app

```bash
streamlit run src/app.py
```

Then in the browser:
1. Paste your Groq API key in the sidebar (or rely on `.env`).
2. Upload one or more PDF/TXT files and click **Ingest documents**.
3. Pick a persona from the dropdown.
4. Ask questions in the chat box. Each answer shows an expandable **Sources**
   panel with the retrieved chunks and similarity scores.

## How the honesty guardrail works

Every persona's system prompt gets the same non-negotiable rules appended
(`src/rag.py::HONESTY_RULES`):

- Answer **only** from the retrieved context.
- If the context doesn't cover the question, say so **in character** instead
  of guessing.
- Character voice never overrides accuracy.

Retrieval also computes a rough similarity score; if the best match is below
`RELEVANCE_FLOOR` (see `rag.py`), that's a signal the docs likely don't cover
the question at all — useful for future confidence-score work.

## Adding a persona

Add an entry to `PERSONAS` in `src/personas.py`:

```python
"Noir Detective": {
    "emoji": "🕵️",
    "description": "Answers like it's solving a case.",
    "system_prompt": "You are a hardboiled noir detective narrating your findings...",
    "fallback_style": "Say, in a noir voice, that the trail goes cold — the case files don't cover this.",
},
```

It'll show up in the dropdown automatically.

## Stretch features (not yet built)

These are natural next steps once the MVP above is working, per the original
build plan:

- **Confidence score UI** — the `similarity` value is already computed per
  chunk in `embed_store.py`; surface it more prominently (e.g. a color-coded
  badge) instead of just in the sources expander.
- **User-defined custom personas** — add a text box in the sidebar that lets
  users type their own `system_prompt`/`fallback_style` and appends it to
  `PERSONAS` at runtime.
- **Real chat memory** — `rag.answer_question` already accepts a
  `chat_history` list of prior `{role, content}` messages; wire
  `st.session_state.chat` into it so follow-up questions have context.
- **Persona-specific formatting enforcement** — e.g. a regex/post-process
  step that nudges pirate-speak consistency, or few-shot examples in the
  system prompt.
- **Save/reload sessions** — persist `st.session_state.chat` and the Chroma
  collection to disk/session files so a browser refresh doesn't lose history.

## Notes / gotchas

- Chunking is word-count based (500 words, 50-word overlap), not
  token-based — simple and dependency-free, but not exactly token-accurate
  for very dense text. Fine for an MVP.
- `VectorStore` persists to `./chroma_db` by default, so ingested docs
  survive app restarts. Use **Clear all documents** in the sidebar (or
  delete the folder) to reset.
- Similarity scores are `1 - cosine_distance`, not calibrated probabilities
  — treat them as relative, not absolute.

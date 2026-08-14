# 📚 Persona RAG - Chat With Your Docs, In Character

> A RAG chatbot that answers questions strictly from documents you upload - in a personality you choose. No hallucinations: if the docs don't cover it, the bot says so, in character.

**Backend / Core**  
![Python](https://img.shields.io/badge/Python_3.11-3776AB?style=flat&logo=python&logoColor=white)
![Streamlit](https://img.shields.io/badge/Streamlit-FF4B4B?style=flat&logo=streamlit&logoColor=white)
![ChromaDB](https://img.shields.io/badge/ChromaDB-121212?style=flat&logo=databricks&logoColor=white)

**AI**  
![Groq](https://img.shields.io/badge/Groq_API-F55036?style=flat&logo=groq&logoColor=white)
![Llama](https://img.shields.io/badge/Llama_3.3_70B-0467DF?style=flat&logo=meta&logoColor=white)
![Sentence Transformers](https://img.shields.io/badge/sentence--transformers-FFD21E?style=flat&logo=huggingface&logoColor=black)

**Docs**  
![pypdf](https://img.shields.io/badge/pypdf-8A2BE2?style=flat)

**Deployment**  
![Streamlit Cloud](https://img.shields.io/badge/Streamlit_Cloud-FF4B4B?style=flat&logo=streamlit&logoColor=white)

---

## 🚀 Live Demo

|                           | Link                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **App (Streamlit Cloud)** | [persona-rag-be2flrecnr9dbfg85hpqlh.streamlit.app](https://persona-rag-be2flrecnr9dbfg85hpqlh.streamlit.app/) |

> **Note:** Free-tier Groq API is rate-limited (not unlimited). If the app is slow to respond during heavy use, that's why.

---

## Features

- **Document upload** - PDF, TXT, or MD files get chunked and embedded automatically
- **Grounded answers only** - every response is built strictly from retrieved chunks of _your_ documents, never outside knowledge
- **4 personas, switchable live** - Grumpy Expert, Socratic Tutor, Pirate Librarian, Plain & Neutral
- **Honest fallback** - if the docs don't cover a question, the bot admits it, in character, instead of guessing
- **Source citations** - every answer shows which chunk(s) it came from, with similarity scores, expandable per message

---

## Quick Start

### Prerequisites

- Python 3.10+
- A free Groq API key (no credit card) - [console.groq.com](https://console.groq.com)

### Setup

```bash
git clone https://github.com/Shreya-Shukla27/persona-rag.git
cd persona-rag

python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux

pip install -r requirements.txt
```

**.env file:**

```bash
copy .env.example .env       # Windows
# cp .env.example .env       # Mac/Linux
```

```env
GROQ_API_KEY=gsk_your_key_here
GROQ_MODEL=llama-3.3-70b-versatile
EMBEDDING_MODEL=all-MiniLM-L6-v2
```

### Run

```bash
streamlit run src/app.py
```

Open the URL it prints (usually `http://localhost:8501`).

---

## How to Use

1. Paste your Groq API key in the sidebar (skip this if you set `.env`)
2. Upload a PDF/TXT/MD file and click **Ingest documents**
3. Pick a persona from the dropdown
4. Ask a question in the chat box
5. Expand **Sources used** under any answer to see exactly which chunks it pulled from, and how similar they were

---

## Architecture

```text
persona_rag/
├── src/
│   ├── ingest.py        # PDF/txt loading + word-based chunking (500/50 overlap)
│   ├── embed_store.py   # ChromaDB + sentence-transformers wrapper
│   ├── personas.py      # persona system prompts + honesty fallback style
│   ├── rag.py            # retrieval → prompt build → Groq API call
│   └── app.py             # Streamlit UI (upload, persona picker, chat, sources)
├── scripts/
│   └── test_retrieval.py  # sanity-check retrieval without hitting the LLM
├── data/                   # sample docs for local testing
├── requirements.txt
├── .env.example
└── README.md
```

No LangChain or LlamaIndex - the whole pipeline is hand-rolled in a few hundred lines, so every step is easy to trace end-to-end.

---

## How the Pipeline Works

```
Upload docs → chunk (500 words, 50 overlap) → embed locally → store in ChromaDB
                                                        ↓
                        Your question → embed → retrieve top-k similar chunks
                                                        ↓
              [persona system prompt] + [honesty rules] + [retrieved chunks] + [question]
                                                        ↓
                                      Groq LLM (Llama 3.3 70B)
                                                        ↓
                                  Answer + sources, in persona's voice
```

1. **Chunking** - word-count based (not token-based), 500 words per chunk with 50-word overlap, page numbers preserved for PDFs
2. **Embedding** - `all-MiniLM-L6-v2` via sentence-transformers, runs locally, no API call
3. **Retrieval** - top-4 chunks by cosine similarity via ChromaDB
4. **Honesty guardrail** - every persona's system prompt gets the same non-negotiable rules appended: answer only from context, admit when the docs don't cover it, persona voice never overrides accuracy
5. **Generation** - Groq's OpenAI-style chat completions API, system prompt + retrieved context + question

---

## Personas

| Persona             | Voice                                                    |
| ------------------- | -------------------------------------------------------- |
| 😤 Grumpy Expert    | Brilliant, impatient, mildly annoyed you're asking       |
| 🤔 Socratic Tutor   | Answers with guiding questions, not lectures             |
| 🏴‍☠️ Pirate Librarian | Nautical metaphors, "arrr", still a stickler for sources |
| 📄 Plain & Neutral  | No flavor - just clear, direct answers                   |

**Add your own:** one new entry in the `PERSONAS` dict in `src/personas.py` - no other code changes needed.

---

## Extending

**Add a new persona:**  
Edit `PERSONAS` in `src/personas.py` - add `system_prompt` and `fallback_style` keys, it appears in the dropdown automatically.

**Change chunk size/overlap:**  
Edit `chunk_size` / `overlap` defaults in `chunk_text()` in `src/ingest.py`.

**Change how many chunks get retrieved:**  
Edit `TOP_K` in `src/rag.py`.

**Swap the LLM provider:**  
Everything provider-specific lives in `src/rag.py::answer_question()` - swap the `Groq` client for another OpenAI-compatible client and adjust the message format if needed.

---

## Known Limitations

- Chunking is word-count based, not token-based - fine for English prose, less precise for dense technical text
- Similarity scores (`1 - cosine_distance`) are relative, not calibrated probabilities
- Groq's free tier is rate-limited (not unlimited requests)
- No persistent chat memory yet between questions (see roadmap)

---

## Roadmap

- [ ] Chat memory for natural follow-up questions (`rag.answer_question` already accepts `chat_history`, just needs wiring into `app.py`)
- [ ] Confidence-score badge in the UI (similarity is already computed per chunk)
- [ ] User-defined custom personas via a sidebar text box
- [ ] Persona-specific formatting enforcement (e.g. consistent pirate-speak)
- [ ] Save/reload past chat sessions

---

Built as a project demonstrating: RAG pipelines · Local embeddings · Prompt-layered persona design · Honesty guardrails · Streamlit UI · Groq inference

## License

MIT - do whatever you'd like with it.

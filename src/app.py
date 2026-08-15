"""
app.py
Streamlit UI: upload docs, pick a persona, chat, see sources.

Run with:  streamlit run src/app.py
"""

import os
import sys

import streamlit as st
from dotenv import load_dotenv

# Allow running as `streamlit run src/app.py` from the project root
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.ingest import load_and_chunk
from src.embed_store import VectorStore
from src.personas import PERSONAS, DEFAULT_PERSONA
from src.rag import answer_question

load_dotenv()

st.set_page_config(page_title="Persona RAG", page_icon="📚", layout="wide")

# ---------- Theme: reading-room / archive ----------
# Parchment + ink main area, leather sidebar, brass accents.
# Source citations styled like library index cards.

CUSTOM_CSS = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Source+Serif+4:wght@400;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

:root {
    --parchment: #F6F1E4;
    --ink: #2B2118;
    --leather: #3B2A20;
    --brass: #B08D57;
    --forest: #3F5D4E;
    --rust: #8C4A34;
}

/* Main canvas */
.stApp {
    background-color: var(--parchment);
}
[data-testid="stAppViewContainer"] *:not([data-testid*="Icon"]), [data-testid="stMain"] *:not([data-testid*="Icon"]) {
    font-family: 'Source Serif 4', Georgia, serif;
}
[data-testid="stAppViewContainer"], [data-testid="stMain"] {
    color: var(--ink);
}

/* Sidebar: quieter, cleaner dark panel (not full leather-brown) */
[data-testid="stSidebar"] {
    background-color: #23262B;
}
/* Apply custom font + color to text elements only -- explicitly skip icon
   elements (data-testid containing "Icon"), since those render glyphs via
   a special icon font and break if font-family gets overridden. */
[data-testid="stSidebar"] *:not([data-testid*="Icon"]) {
    color: #E8E6E1 !important;
    font-family: 'Source Serif 4', Georgia, serif !important;
}
[data-testid="stSidebar"] [data-testid*="Icon"] {
    color: #E8E6E1 !important;
}
[data-testid="stSidebar"] h1, [data-testid="stSidebar"] h2, [data-testid="stSidebar"] h3 {
    font-family: 'Fraunces', Georgia, serif !important;
    color: #FFFFFF !important;
    letter-spacing: 0.01em;
}
[data-testid="stSidebar"] hr {
    border-color: rgba(232, 230, 225, 0.15);
}

/* Persona header */
h1, h2 {
    font-family: 'Fraunces', Georgia, serif !important;
    color: var(--ink) !important;
    letter-spacing: -0.01em;
}

/* Buttons: brass accent */
.stButton > button {
    background-color: var(--brass);
    color: var(--ink);
    border: none;
    border-radius: 4px;
    font-family: 'Source Serif 4', Georgia, serif;
    font-weight: 600;
    transition: background-color 0.15s ease;
}
.stButton > button:hover {
    background-color: #C9A876;
    color: var(--ink);
}

/* Chat messages */
[data-testid="stChatMessage"] {
    background-color: #FFFFFF;
    border: 1px solid rgba(43, 33, 24, 0.1);
    border-radius: 8px;
    padding: 0.25rem 0.5rem;
}

/* Chat input box */
[data-testid="stChatInput"] textarea {
    font-family: 'Source Serif 4', Georgia, serif;
}

/* Sources expander -> library index card */
[data-testid="stExpander"] {
    border: 1px dashed var(--rust);
    border-radius: 6px;
    background-color: #FBF7EC;
}
[data-testid="stExpander"] summary {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.85rem;
    color: var(--rust);
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

/* Similarity scores + source metadata in mono, like a catalog stamp */
.source-card {
    font-family: 'Source Serif 4', Georgia, serif;
    border-left: 3px solid var(--brass);
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.5rem;
    background-color: #FFFDF8;
}
.source-meta {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.78rem;
    color: var(--rust);
    text-transform: uppercase;
    letter-spacing: 0.04em;
}
.source-text {
    font-size: 0.92rem;
    color: var(--ink);
    opacity: 0.85;
    margin-top: 0.25rem;
}

/* File uploader */
[data-testid="stFileUploader"] {
    border: 1px solid rgba(246, 241, 228, 0.3);
    border-radius: 6px;
}

/* Persona caption under selectbox */
.persona-caption {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.8rem;
    color: #C9A876;
    font-style: italic;
}
</style>
"""

st.markdown(CUSTOM_CSS, unsafe_allow_html=True)


# ---------- Cached / session resources ----------

@st.cache_resource
def get_store():
    return VectorStore()


if "chat" not in st.session_state:
    st.session_state.chat = []  # list of {role, content, sources?}

# The server-side key (from .env locally, or Streamlit Secrets when deployed).
# This is used automatically for API calls but is NEVER shown in the UI,
# so visitors to a deployed app can't reveal it via the password field's
# "show" toggle or by viewing the page.
SERVER_API_KEY = os.environ.get("GROQ_API_KEY", "")

if "user_api_key" not in st.session_state:
    st.session_state.user_api_key = ""


store = get_store()


def render_source_card(i: int, s: dict):
    """Render one retrieved chunk as a library-index-card-styled block."""
    page = f" · p.{s['page']}" if s.get("page") and s["page"] != -1 else ""
    preview = s["text"][:400] + ("..." if len(s["text"]) > 400 else "")
    st.markdown(
        f"""
        <div class="source-card">
            <div class="source-meta">#{i} &nbsp;·&nbsp; {s['source']}{page} &nbsp;·&nbsp; similarity {s['similarity']:.2f}</div>
            <div class="source-text">{preview}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


# ---------- Sidebar: setup, upload, persona ----------

with st.sidebar:
    st.title("📚 Persona RAG")
    st.caption("Chat with your docs. In character. Without making things up.")

    st.subheader("1. API Key")
    if SERVER_API_KEY:
        st.success("Using the app's built-in API key. ✓", icon="🔑")
        with st.expander("Use your own key instead"):
            key_input = st.text_input(
                "Your Groq API key (optional)",
                value=st.session_state.user_api_key,
                type="password",
                help="Leave blank to use the app's built-in key. Get a free key at console.groq.com.",
            )
            st.session_state.user_api_key = key_input
    else:
        key_input = st.text_input(
            "Groq API key",
            value=st.session_state.user_api_key,
            type="password",
            help="Free, no card required: console.groq.com. Or set GROQ_API_KEY in a .env file instead.",
        )
        st.session_state.user_api_key = key_input

    # Effective key used for API calls: a user-supplied key always wins,
    # otherwise fall back to the server key (never displayed to the user).
    active_api_key = st.session_state.user_api_key or SERVER_API_KEY

    st.subheader("2. Upload documents")
    uploaded_files = st.file_uploader(
        "PDF or TXT files",
        type=["pdf", "txt", "md"],
        accept_multiple_files=True,
    )
    if uploaded_files and st.button("Ingest documents", use_container_width=True):
        total_chunks = 0
        with st.spinner("Chunking and embedding..."):
            for f in uploaded_files:
                chunks = load_and_chunk(f.read(), f.name)
                total_chunks += store.add_chunks(chunks)
        st.success(f"Ingested {len(uploaded_files)} file(s), {total_chunks} chunks.")

    sources = store.list_sources()
    if sources:
        st.caption("Indexed documents:")
        for s in sources:
            st.markdown(f"- {s}")
        if st.button("Clear all documents", use_container_width=True):
            store.clear()
            st.rerun()
    else:
        st.info("No documents indexed yet. Upload something above to begin.")

    st.subheader("3. Choose a persona")
    persona_name = st.selectbox(
        "Persona",
        options=list(PERSONAS.keys()),
        index=list(PERSONAS.keys()).index(DEFAULT_PERSONA),
        format_func=lambda p: f"{PERSONAS[p]['emoji']} {p}",
    )
    st.markdown(
        f'<div class="persona-caption">{PERSONAS[persona_name]["description"]}</div>',
        unsafe_allow_html=True,
    )

    if st.button("Clear chat", use_container_width=True):
        st.session_state.chat = []
        st.rerun()


# ---------- Main chat area ----------

st.markdown(
    f"<h1>{PERSONAS[persona_name]['emoji']} {persona_name}</h1>",
    unsafe_allow_html=True,
)
st.markdown(
    f'<p style="font-family:\'Source Serif 4\',Georgia,serif; font-size:1.05rem; '
    f'color:var(--forest); margin-top:-0.5rem; margin-bottom:1rem;">'
    f'{PERSONAS[persona_name]["tagline"]} '
    f'Every persona only answers from your uploaded documents — never outside knowledge.</p>',
    unsafe_allow_html=True,
)

for msg in st.session_state.chat:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])
        if msg.get("sources"):
            with st.expander("Sources consulted"):
                for i, s in enumerate(msg["sources"], start=1):
                    render_source_card(i, s)

question = st.chat_input("Ask something about your documents...")

if question:
    if not store.list_sources():
        st.warning("Upload and ingest at least one document first.")
    elif not active_api_key:
        st.warning("Enter your Groq API key in the sidebar first.")
    else:
        st.session_state.chat.append({"role": "user", "content": question})
        with st.chat_message("user"):
            st.markdown(question)

        with st.chat_message("assistant"):
            with st.spinner("Thinking..."):
                result = answer_question(
                    question=question,
                    store=store,
                    persona_name=persona_name,
                    api_key=active_api_key,
                )
            st.markdown(result.answer)
            if result.sources:
                with st.expander("Sources consulted"):
                    for i, s in enumerate(result.sources, start=1):
                        render_source_card(i, s)

        st.session_state.chat.append(
            {
                "role": "assistant",
                "content": result.answer,
                "sources": result.sources,
            }
        )
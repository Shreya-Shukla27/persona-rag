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

# ---------- Theme: light or dark, single accent color ----------

if "dark_mode" not in st.session_state:
    st.session_state.dark_mode = False

THEMES = {
    "light": {
        "bg": "#FFFFFF",
        "sidebar_bg": "#F7F8FA",
        "card_bg": "#FFFFFF",
        "text": "#1F2430",
        "muted": "#6B7280",
        "accent": "#4F46E5",
        "accent_hover": "#4338CA",
        "border": "#E5E7EB",
    },
    "dark": {
        "bg": "#0F1115",
        "sidebar_bg": "#16181D",
        "card_bg": "#1A1C22",
        "text": "#E5E7EB",
        "muted": "#9CA3AF",
        "accent": "#6366F1",
        "accent_hover": "#818CF8",
        "border": "#2D2F36",
    },
}

_t = THEMES["dark" if st.session_state.dark_mode else "light"]

CUSTOM_CSS_TEMPLATE = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:root {
    --bg: %(bg)s;
    --sidebar-bg: %(sidebar_bg)s;
    --card-bg: %(card_bg)s;
    --text: %(text)s;
    --muted: %(muted)s;
    --accent: %(accent)s;
    --accent-hover: %(accent_hover)s;
    --border: %(border)s;
}

.stApp {
    background-color: var(--bg);
}
[data-testid="stAppViewContainer"] *:not([data-testid*="Icon"]), [data-testid="stMain"] *:not([data-testid*="Icon"]) {
    font-family: 'Inter', -apple-system, sans-serif;
}
[data-testid="stAppViewContainer"], [data-testid="stMain"] {
    color: var(--text);
}

/* Sidebar: light, clean, minimal */
[data-testid="stSidebar"] {
    background-color: var(--sidebar-bg);
    border-right: 1px solid var(--border);
}
[data-testid="stSidebar"] *:not([data-testid*="Icon"]) {
    color: var(--text) !important;
    font-family: 'Inter', -apple-system, sans-serif !important;
}
[data-testid="stSidebar"] [data-testid*="Icon"] {
    color: var(--text) !important;
}
[data-testid="stSidebar"] h1, [data-testid="stSidebar"] h2, [data-testid="stSidebar"] h3 {
    font-weight: 700 !important;
    color: var(--text) !important;
}
[data-testid="stSidebar"] hr {
    border-color: var(--border);
}

/* Headers */
h1, h2 {
    font-family: 'Inter', -apple-system, sans-serif !important;
    color: var(--text) !important;
    font-weight: 700 !important;
    letter-spacing: -0.02em;
}

/* Buttons: single accent color */
.stButton > button {
    background-color: var(--accent);
    color: #FFFFFF;
    border: none;
    border-radius: 6px;
    font-family: 'Inter', -apple-system, sans-serif;
    font-weight: 600;
    transition: background-color 0.15s ease;
}
.stButton > button:hover {
    background-color: var(--accent-hover);
    color: #FFFFFF;
}

/* Chat messages */
[data-testid="stChatMessage"] {
    background-color: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.25rem 0.5rem;
}

/* Chat input */
[data-testid="stChatInput"] textarea {
    font-family: 'Inter', -apple-system, sans-serif;
}

/* Sources expander: simple card, no dashed borders or stamps */
[data-testid="stExpander"] {
    border: 1px solid var(--border);
    border-radius: 8px;
    background-color: var(--sidebar-bg);
}
[data-testid="stExpander"] summary {
    font-family: 'Inter', -apple-system, sans-serif;
    font-size: 0.85rem;
    color: var(--accent);
    font-weight: 600;
}

/* Source cards: simple, minimal accent border, no ledger/stamp styling */
.source-card {
    font-family: 'Inter', -apple-system, sans-serif;
    border-left: 3px solid var(--accent);
    border-radius: 4px;
    padding: 0.6rem 0.85rem;
    margin-bottom: 0.5rem;
    background-color: var(--card-bg);
}
.source-meta {
    font-family: 'Inter', -apple-system, sans-serif;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--accent);
}
.source-text {
    font-size: 0.9rem;
    color: var(--muted);
    margin-top: 0.3rem;
    line-height: 1.5;
}

/* File uploader */
[data-testid="stFileUploader"] {
    border: 1px solid var(--border);
    border-radius: 8px;
}

/* Persona caption + tagline */
.persona-caption {
    font-family: 'Inter', -apple-system, sans-serif;
    font-size: 0.82rem;
    color: var(--muted);
}
</style>
"""

CUSTOM_CSS = CUSTOM_CSS_TEMPLATE % _t

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
    st.toggle("🌙 Dark mode", key="dark_mode")
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
    f'<p style="font-family:Inter,-apple-system,sans-serif; font-size:1rem; '
    f'color:#6B7280; margin-top:-0.5rem; margin-bottom:1rem;">'
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
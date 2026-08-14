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


# ---------- Cached / session resources ----------

@st.cache_resource
def get_store():
    return VectorStore()


if "chat" not in st.session_state:
    st.session_state.chat = []  # list of {role, content, sources?}

if "api_key" not in st.session_state:
    st.session_state.api_key = os.environ.get("GROQ_API_KEY", "")


store = get_store()


# ---------- Sidebar: setup, upload, persona ----------

with st.sidebar:
    st.title("📚 Persona RAG")
    st.caption("Chat with your docs. In character. Without making things up.")

    st.subheader("1. API Key")
    key_input = st.text_input(
        "Groq API key",
        value=st.session_state.api_key,
        type="password",
        help="Free, no card required: console.groq.com. Or set GROQ_API_KEY in a .env file instead.",
    )
    st.session_state.api_key = key_input

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
        st.info("No documents indexed yet.")

    st.subheader("3. Choose a persona")
    persona_name = st.selectbox(
        "Persona",
        options=list(PERSONAS.keys()),
        index=list(PERSONAS.keys()).index(DEFAULT_PERSONA),
        format_func=lambda p: f"{PERSONAS[p]['emoji']} {p}",
    )
    st.caption(PERSONAS[persona_name]["description"])

    if st.button("Clear chat", use_container_width=True):
        st.session_state.chat = []
        st.rerun()


# ---------- Main chat area ----------

st.header(f"{PERSONAS[persona_name]['emoji']} {persona_name}")

for msg in st.session_state.chat:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])
        if msg.get("sources"):
            with st.expander("📎 Sources used"):
                for i, s in enumerate(msg["sources"], start=1):
                    page = f" (page {s['page']})" if s.get("page") and s["page"] != -1 else ""
                    st.markdown(
                        f"**{i}. {s['source']}{page}** — similarity {s['similarity']:.2f}"
                    )
                    st.caption(s["text"][:400] + ("..." if len(s["text"]) > 400 else ""))

question = st.chat_input("Ask something about your documents...")

if question:
    if not store.list_sources():
        st.warning("Upload and ingest at least one document first.")
    elif not st.session_state.api_key:
        st.warning("Enter your Anthropic API key in the sidebar first.")
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
                    api_key=st.session_state.api_key,
                )
            st.markdown(result.answer)
            if result.sources:
                with st.expander("📎 Sources used"):
                    for i, s in enumerate(result.sources, start=1):
                        page = (
                            f" (page {s['page']})"
                            if s.get("page") and s["page"] != -1
                            else ""
                        )
                        st.markdown(
                            f"**{i}. {s['source']}{page}** — similarity {s['similarity']:.2f}"
                        )
                        st.caption(
                            s["text"][:400] + ("..." if len(s["text"]) > 400 else "")
                        )

        st.session_state.chat.append(
            {
                "role": "assistant",
                "content": result.answer,
                "sources": result.sources,
            }
        )

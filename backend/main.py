from __future__ import annotations

import os
import sys
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.append(ROOT_DIR)

load_dotenv(os.path.join(ROOT_DIR, ".env"))

from src.embed_store import VectorStore
from src.ingest import load_and_chunk
from src.personas import DEFAULT_PERSONA, PERSONAS
from src.rag import answer_question


app = FastAPI(title="Persona RAG API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

store = VectorStore()


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    persona: str = DEFAULT_PERSONA
    api_key: str | None = None
    chat_history: list[dict[str, str]] = Field(default_factory=list)


def serialize_sources(sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "source": source.get("source"),
            "page": source.get("page"),
            "similarity": round(float(source.get("similarity", 0)), 3),
            "text": source.get("text", ""),
        }
        for source in sources
    ]


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/personas")
def personas() -> list[dict[str, str]]:
    return [
        {
            "name": name,
            "emoji": persona["emoji"],
            "tagline": persona["tagline"],
            "description": persona["description"],
        }
        for name, persona in PERSONAS.items()
    ]


@app.get("/api/documents")
def documents() -> dict[str, Any]:
    sources = store.list_sources()
    return {"documents": [{"name": name} for name in sources], "count": len(sources)}


@app.post("/api/documents/upload")
async def upload_documents(files: list[UploadFile] = File(...)) -> dict[str, Any]:
    accepted = {".pdf", ".txt", ".md"}
    uploaded: list[dict[str, Any]] = []
    for file in files:
        filename = file.filename or "unnamed"
        extension = os.path.splitext(filename)[1].lower()
        if extension not in accepted:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {filename}")
        chunks = load_and_chunk(await file.read(), filename)
        count = store.add_chunks(chunks)
        uploaded.append({"name": filename, "chunks": count})
    return {"uploaded": uploaded, "documents": store.list_sources()}


@app.delete("/api/documents")
def clear_documents() -> dict[str, str]:
    store.clear()
    return {"status": "cleared"}


@app.post("/api/chat")
def chat(request: ChatRequest) -> dict[str, Any]:
    if request.persona not in PERSONAS:
        raise HTTPException(status_code=400, detail="Unknown persona")
    api_key = request.api_key or os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(status_code=400, detail="A Groq API key is required")
    result = answer_question(
        question=request.question,
        store=store,
        persona_name=request.persona,
        api_key=api_key,
        chat_history=request.chat_history[-8:],
    )
    return {
        "answer": result.answer,
        "sources": serialize_sources(result.sources),
        "used_context": result.used_context,
    }
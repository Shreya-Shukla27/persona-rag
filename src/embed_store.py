"""
embed_store.py
Wraps ChromaDB with a local sentence-transformers embedding function.
No external embedding API calls -> free and works offline after first model download.
"""

from __future__ import annotations
import os
from typing import List

import chromadb
from chromadb.utils import embedding_functions

from .ingest import Chunk

EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
CHROMA_DIR = os.environ.get("CHROMA_DIR", "chroma_db")
COLLECTION_NAME = "persona_rag_docs"


class VectorStore:
    def __init__(self, persist_dir: str = CHROMA_DIR):
        self.client = chromadb.PersistentClient(path=persist_dir)
        self.embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=EMBEDDING_MODEL
        )
        self.collection = self.client.get_or_create_collection(
            name=COLLECTION_NAME,
            embedding_function=self.embedding_fn,
        )

    def add_chunks(self, chunks: List[Chunk]) -> int:
        """Embed and store chunks. Returns number of chunks added."""
        if not chunks:
            return 0

        ids = [f"{c.source}::{c.chunk_index}" for c in chunks]
        documents = [c.text for c in chunks]
        metadatas = [
            {"source": c.source, "chunk_index": c.chunk_index, "page": c.page or -1}
            for c in chunks
        ]

        self.collection.upsert(ids=ids, documents=documents, metadatas=metadatas)
        return len(chunks)

    def query(self, question: str, top_k: int = 4):
        """
        Return top_k most similar chunks to the question.
        Output: list of dicts with text, source, page, distance (lower = more similar).
        """
        if self.collection.count() == 0:
            return []

        results = self.collection.query(query_texts=[question], n_results=top_k)

        hits = []
        docs = results.get("documents", [[]])[0]
        metas = results.get("metadatas", [[]])[0]
        dists = results.get("distances", [[]])[0]

        for doc, meta, dist in zip(docs, metas, dists):
            hits.append(
                {
                    "text": doc,
                    "source": meta.get("source"),
                    "page": meta.get("page"),
                    "distance": dist,
                    # crude similarity score for display; not calibrated probability
                    "similarity": max(0.0, 1 - dist),
                }
            )
        return hits

    def list_sources(self) -> List[str]:
        if self.collection.count() == 0:
            return []
        data = self.collection.get()
        sources = {m.get("source") for m in data.get("metadatas", [])}
        return sorted(s for s in sources if s)

    def clear(self):
        self.client.delete_collection(COLLECTION_NAME)
        self.collection = self.client.get_or_create_collection(
            name=COLLECTION_NAME,
            embedding_function=self.embedding_fn,
        )

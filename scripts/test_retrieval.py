"""
scripts/test_retrieval.py

Sanity-check ingestion + embedding + retrieval WITHOUT calling the LLM.
Matches build-plan step 4: "confirm it pulls back sensible chunks."

Usage:
    python scripts/test_retrieval.py path/to/file.pdf "your test question"
"""

import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.ingest import load_and_chunk
from src.embed_store import VectorStore


def main():
    if len(sys.argv) < 3:
        print('Usage: python scripts/test_retrieval.py <file> "<question>"')
        sys.exit(1)

    file_path = sys.argv[1]
    question = sys.argv[2]

    with open(file_path, "rb") as f:
        file_bytes = f.read()

    filename = os.path.basename(file_path)
    print(f"Loading and chunking {filename}...")
    chunks = load_and_chunk(file_bytes, filename)
    print(f"  -> {len(chunks)} chunks")

    print("Embedding and storing (this downloads the embedding model on first run)...")
    store = VectorStore(persist_dir="chroma_db_test")
    added = store.add_chunks(chunks)
    print(f"  -> {added} chunks stored")

    print(f"\nQuery: {question!r}")
    hits = store.query(question, top_k=4)
    if not hits:
        print("No hits found.")
        return

    for i, h in enumerate(hits, start=1):
        print(f"\n--- Hit {i} (similarity={h['similarity']:.3f}, page={h['page']}) ---")
        print(h["text"][:300] + ("..." if len(h["text"]) > 300 else ""))


if __name__ == "__main__":
    main()

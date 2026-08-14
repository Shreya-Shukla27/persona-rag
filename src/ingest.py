"""
ingest.py
Loads PDFs/text files and splits them into overlapping word-based chunks.

Chunking is done by word count (not tokens) to avoid extra dependencies.
500 words with 50-word overlap is a reasonable default for retrieval quality.
"""

from __future__ import annotations
import io
from dataclasses import dataclass
from typing import List

from pypdf import PdfReader


@dataclass
class Chunk:
    text: str
    source: str          # filename
    chunk_index: int      # position within the document
    page: int | None = None  # page number for PDFs, if known


def load_pdf_bytes(file_bytes: bytes, filename: str) -> str:
    """Extract raw text from a PDF's bytes, page by page, with page markers."""
    reader = PdfReader(io.BytesIO(file_bytes))
    pages_text = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        # Embed a marker so we can recover page numbers after chunking
        pages_text.append(f"[[PAGE {i + 1}]]\n{text}")
    return "\n\n".join(pages_text)


def load_txt_bytes(file_bytes: bytes, filename: str) -> str:
    return file_bytes.decode("utf-8", errors="ignore")


def chunk_text(
    raw_text: str,
    source: str,
    chunk_size: int = 500,
    overlap: int = 50,
) -> List[Chunk]:
    """
    Split text into overlapping chunks of `chunk_size` words.

    Tracks page numbers (if [[PAGE N]] markers are present from PDF loading)
    so each chunk can cite roughly where it came from.
    """
    # Walk through the text, tracking the current page as we hit markers
    tokens: List[tuple[str, int | None]] = []  # (word, page_at_that_point)
    current_page = None
    for line in raw_text.split("\n"):
        line = line.strip()
        if line.startswith("[[PAGE") and line.endswith("]]"):
            try:
                current_page = int(line.replace("[[PAGE", "").replace("]]", "").strip())
            except ValueError:
                pass
            continue
        for word in line.split():
            tokens.append((word, current_page))

    if not tokens:
        return []

    chunks: List[Chunk] = []
    step = max(chunk_size - overlap, 1)
    idx = 0
    chunk_index = 0
    while idx < len(tokens):
        window = tokens[idx: idx + chunk_size]
        words = [w for w, _ in window]
        pages = [p for _, p in window if p is not None]
        page = pages[0] if pages else None
        text = " ".join(words).strip()
        if text:
            chunks.append(
                Chunk(text=text, source=source, chunk_index=chunk_index, page=page)
            )
            chunk_index += 1
        idx += step

    return chunks


def load_and_chunk(file_bytes: bytes, filename: str) -> List[Chunk]:
    """Dispatch based on file extension, then chunk the extracted text."""
    lower = filename.lower()
    if lower.endswith(".pdf"):
        raw_text = load_pdf_bytes(file_bytes, filename)
    elif lower.endswith(".txt") or lower.endswith(".md"):
        raw_text = load_txt_bytes(file_bytes, filename)
    else:
        raise ValueError(f"Unsupported file type: {filename}")

    return chunk_text(raw_text, source=filename)

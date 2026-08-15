"""
voice.py
Voice input and output for the RAG chat.

- Input (speech-to-text): recorded audio is sent to Groq's Whisper endpoint.
  This uses the SAME Groq API key as the chat model -- no new signup, and
  Groq's free tier includes Whisper transcription (2,000 requests/day).
- Output (text-to-speech): uses the browser's built-in Web Speech API via a
  small injected HTML/JS snippet. This is entirely client-side -- free, no
  API call, works offline once the page is loaded. Quality/voice options
  depend on the user's browser and OS, not on this app.
"""

from __future__ import annotations
import json
import re

from groq import Groq
import streamlit.components.v1 as components

STT_MODEL = "whisper-large-v3-turbo"

# Light persona flavor for the read-aloud voice. Browser TTS only exposes
# rate/pitch, not full voice cloning, so this is a subtle touch rather than
# a real character voice.
PERSONA_VOICE_PARAMS = {
    "Grumpy Expert": {"rate": 0.95, "pitch": 0.75},
    "Socratic Tutor": {"rate": 1.0, "pitch": 1.08},
    "Pirate Librarian": {"rate": 0.92, "pitch": 0.8},
    "Plain & Neutral": {"rate": 1.0, "pitch": 1.0},
}


def transcribe_audio(audio_bytes: bytes, api_key: str | None) -> str:
    """Send recorded audio to Groq's Whisper endpoint, return the transcript text."""
    client = Groq(api_key=api_key) if api_key else Groq()
    transcript = client.audio.transcriptions.create(
        file=("recording.wav", audio_bytes),
        model=STT_MODEL,
    )
    return (transcript.text or "").strip()


def render_speak_button(text: str, persona_name: str, key: str):
    """
    Render a small 'Read aloud' button that uses the browser's built-in
    text-to-speech to read `text` aloud, with a light persona-flavored
    rate/pitch. Entirely client-side -- no API call, no cost.
    """
    params = PERSONA_VOICE_PARAMS.get(persona_name, {"rate": 1.0, "pitch": 1.0})
    safe_key = re.sub(r"[^a-zA-Z0-9_]", "_", str(key))
    safe_text = json.dumps(text)

    html = f"""
    <div style="margin-top:2px;">
      <button id="speak-{safe_key}" style="
          background-color:#4F46E5; color:white; border:none;
          border-radius:6px; padding:4px 12px; font-size:0.78rem;
          font-family:Inter,-apple-system,sans-serif; cursor:pointer;">
        🔊 Read aloud
      </button>
      <button id="stop-{safe_key}" style="
          background-color:transparent; color:#6B7280; border:1px solid #6B7280;
          border-radius:6px; padding:4px 12px; font-size:0.78rem;
          font-family:Inter,-apple-system,sans-serif; cursor:pointer; margin-left:4px;">
        ⏹ Stop
      </button>
    </div>
    <script>
      (function() {{
        const speakBtn = document.getElementById("speak-{safe_key}");
        const stopBtn = document.getElementById("stop-{safe_key}");
        speakBtn.addEventListener("click", function() {{
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance({safe_text});
          utter.rate = {params['rate']};
          utter.pitch = {params['pitch']};
          window.speechSynthesis.speak(utter);
        }});
        stopBtn.addEventListener("click", function() {{
          window.speechSynthesis.cancel();
        }});
      }})();
    </script>
    """
    components.html(html, height=42)
# Deployment

## Vercel frontend

Create a Vercel project from this repository with `frontend` as the root directory.

- Build command: `npm run build`
- Output directory: `dist`
- Environment variable: `VITE_API_URL=https://<your-render-service>.onrender.com`

## Render backend

The root `render.yaml` defines the FastAPI service and a persistent disk for ChromaDB.
Set these secret/environment values in Render:

- `GROQ_API_KEY`
- `FRONTEND_URLS=https://<your-vercel-domain>,https://<your-preview-domain>`

The Render service starts with:

```bash
uvicorn backend.main:app --host 0.0.0.0 --port $PORT
```

The persistent disk is mounted at `/var/data`, and ChromaDB uses `/var/data/chroma_db`.

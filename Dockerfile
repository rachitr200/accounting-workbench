FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=10000
WORKDIR /app
COPY backend/requirements-lock.txt /app/backend/requirements-lock.txt
RUN pip install --no-cache-dir -r /app/backend/requirements-lock.txt
COPY backend/ /app/backend/
ENV FASTEMBED_CACHE_PATH=/app/models
RUN python -c "from backend.rag import embedding_model; embedding_model()"
ENV RAG_OFFLINE=true
COPY --from=frontend /build/dist /app/frontend/dist
RUN useradd --create-home appuser && mkdir -p /app/data && chown -R appuser:appuser /app
USER appuser
EXPOSE 10000
CMD ["sh", "-c", "exec python -m uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-10000}"]

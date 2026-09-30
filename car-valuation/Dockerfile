# syntax=docker/dockerfile:1.6

# ============================================================================
# car-valuation — multi-stage image
#   builder : python:3.11-slim + build tools, installs pip deps into /opt/venv
#   runtime : python:3.11-slim + Chromium runtime libs + Korean fonts (CJK)
#             - non-root `appuser`
#             - playwright Chromium pinned to /opt/playwright (writable)
#             - TZ=Asia/Seoul
#             - EXPOSE 8000 (FastAPI; uvicorn)
# Build:  docker build -t car-valuation .
# Run:    docker run --rm -p 8000:8000 car-valuation
# ============================================================================


# --------------------------- builder ---------------------------------------
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# rapidfuzz/aiosqlite ship cp311 wheels for amd64/arm64, but keep build-essential
# available so the image rebuilds cleanly if a wheel ever goes missing.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY requirements.txt ./
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade pip \
    && /opt/venv/bin/pip install -r requirements.txt


# --------------------------- runtime ---------------------------------------
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONPATH=/app \
    TZ=Asia/Seoul \
    PLAYWRIGHT_BROWSERS_PATH=/opt/playwright

# Chromium runtime libs + Korean fonts + tzdata.
# (Versions of the linker pieces follow Debian Bookworm's apt names.)
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        tzdata \
        fonts-noto-cjk \
        fonts-noto-cjk-extra \
        libnss3 \
        libnspr4 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libxkbcommon0 \
        libxcomposite1 \
        libxdamage1 \
        libxfixes3 \
        libxrandr2 \
        libgbm1 \
        libpango-1.0-0 \
        libcairo2 \
        libasound2 \
        libcups2 \
        libfontconfig1 \
        libfreetype6 \
        libxshmfence1 \
        libdrm2 \
        libdbus-1-3 \
        libxext6 \
        libxss1 \
    && ln -snf "/usr/share/zoneinfo/${TZ}" /etc/localtime \
    && echo "${TZ}" > /etc/timezone \
    && rm -rf /var/lib/apt/lists/*

# Bring in the pre-built venv
COPY --from=builder /opt/venv /opt/venv

# Non-root user; ensure target dirs are writable.
RUN groupadd --system appuser \
    && useradd  --system --gid appuser --create-home --home-dir /home/appuser appuser \
    && mkdir -p /app /app/data /app/logs /app/output /opt/playwright \
    && chown -R appuser:appuser /app /opt/playwright /home/appuser

WORKDIR /app
USER appuser

# Install Chromium only (firefox/webkit skipped).
RUN python -m playwright install chromium

# Copy application source last so iterating code doesn't bust the deps cache.
COPY --chown=appuser:appuser . /app

EXPOSE 8000

# uvicorn picks up FASTAPI_PORT-aware app on 8000. Override at runtime if needed.
CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]

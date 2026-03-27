"""Simple in-memory rate limiter for tunnel / external access.

Uses a per-IP sliding-window counter.  Only activated when
``app.state.tunnel_rate_limit`` is truthy (set by main.py or tunnel
start logic).

Limits:
  - 60 requests per minute per IP (configurable)
  - Returns 429 Too Many Requests when exceeded
"""

from __future__ import annotations

import time
from collections import defaultdict

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

_DEFAULT_MAX_REQUESTS = 60
_DEFAULT_WINDOW_SECONDS = 60


class TunnelRateLimitMiddleware(BaseHTTPMiddleware):
    """Rate-limit middleware that only enforces when a tunnel is active."""

    def __init__(
        self,
        app,
        max_requests: int = _DEFAULT_MAX_REQUESTS,
        window_seconds: int = _DEFAULT_WINDOW_SECONDS,
    ):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        # Only enforce when tunnel is active
        tunnel_active = getattr(request.app.state, "tunnel_rate_limit", False)
        if not tunnel_active:
            return await call_next(request)

        # Skip rate limiting for static files
        if request.url.path.startswith("/static"):
            return await call_next(request)

        client_ip = self._get_client_ip(request)
        now = time.time()
        cutoff = now - self.window_seconds

        # Prune old entries and count
        hits = self._hits[client_ip]
        hits[:] = [t for t in hits if t > cutoff]

        if len(hits) >= self.max_requests:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "请求过于频繁，请稍后再试",
                    "retry_after": self.window_seconds,
                },
                headers={"Retry-After": str(self.window_seconds)},
            )

        hits.append(now)
        return await call_next(request)

    @staticmethod
    def _get_client_ip(request: Request) -> str:
        """Extract client IP, respecting CF-Connecting-IP from Cloudflare."""
        # Cloudflare sets this header with the real visitor IP
        cf_ip = request.headers.get("cf-connecting-ip")
        if cf_ip:
            return cf_ip.strip()

        # Fallback to X-Forwarded-For
        xff = request.headers.get("x-forwarded-for")
        if xff:
            return xff.split(",")[0].strip()

        # Direct connection
        if request.client:
            return request.client.host
        return "unknown"

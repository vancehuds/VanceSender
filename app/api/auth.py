"""Simple Bearer token authentication for VanceSender API."""

from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import load_config

_bearer = HTTPBearer(auto_error=False)


async def verify_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> None:
    """FastAPI dependency — skip auth when no token is configured.

    When ``server.token`` is set in config, every API request must include
    ``Authorization: Bearer <token>``.  If the header is missing or the
    token does not match, a 401 is returned.
    """
    try:
        cfg = load_config()
        token = cfg.get("server", {}).get("token", "")
    except Exception:
        # Config unreadable — fail open rather than blocking all API access
        return

    # No token configured → auth disabled
    if not token:
        return

    if credentials is None or credentials.credentials != token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未授权访问，请提供有效的 Token",
            headers={"WWW-Authenticate": "Bearer"},
        )

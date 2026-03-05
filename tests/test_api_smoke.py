"""Basic smoke tests for VanceSender API."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    # Import here to avoid side-effects at collection time
    from main import create_app

    app = create_app(lan_access=False)
    with TestClient(app) as c:
        yield c


class TestHealthAndMeta:
    """Test basic API availability."""

    def test_root_returns_html_or_redirect(self, client: TestClient):
        """Root should serve index.html if WEB_DIR exists, or 404."""
        resp = client.get("/")
        assert resp.status_code in (200, 404)

    def test_api_v1_returns_json(self, client: TestClient):
        """API router should respond with JSON (even if 404 for missing endpoint)."""
        resp = client.get("/api/v1/stats")
        assert resp.status_code in (200, 401)


class TestSettingsEndpoints:
    """Test settings API surface."""

    def test_get_settings(self, client: TestClient):
        resp = client.get("/api/v1/settings")
        assert resp.status_code in (200, 401)

    def test_runtime_info(self, client: TestClient):
        resp = client.get("/api/v1/settings/runtime-info")
        assert resp.status_code in (200, 401)


class TestPresetsEndpoints:
    """Test presets API surface."""

    def test_list_presets(self, client: TestClient):
        resp = client.get("/api/v1/presets")
        assert resp.status_code in (200, 401)

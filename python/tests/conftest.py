import os

import pytest


@pytest.fixture(autouse=True)
def _fake_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CYBERDAY_API_KEY", "test-key")
    monkeypatch.setenv("CYBERDAY_BASE_URL", "https://dash.appcover.com")
    monkeypatch.setenv("CYBERDAY_TIMEOUT", "5")
    monkeypatch.delenv("CYBERDAY_DOTENV", raising=False)


@pytest.fixture
def api_key() -> str:
    return os.environ["CYBERDAY_API_KEY"]

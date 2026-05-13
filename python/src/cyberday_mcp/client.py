from __future__ import annotations

from types import TracebackType
from typing import Any

import httpx

from .models import System, SystemRef, build_advanced_body


class CyberdayError(Exception):
    """Base class for Cyberday API errors."""

    def __init__(self, message: str, status_code: int | None = None, body: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


class CyberdayAuthError(CyberdayError):
    """401/403 — missing or invalid API key."""


class CyberdayRateLimitError(CyberdayError):
    """429 — connector throttle (100/60s) exceeded."""


class CyberdayAPIError(CyberdayError):
    """Any other non-2xx response."""


class CyberdayClient:
    """Async client for the Cyberday external API.

    Auth is the org-level `GROUP-API-KEY` header (Settings → Integration
    settings → API Access in Cyberday).
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://dash.appcover.com",
        timeout: float = 30.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._http = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            headers={
                "GROUP-API-KEY": api_key,
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            timeout=timeout,
            transport=transport,
        )

    async def __aenter__(self) -> "CyberdayClient":
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._http.aclose()

    @staticmethod
    def _check(response: httpx.Response) -> None:
        if response.is_success:
            return
        try:
            body = response.json()
        except Exception:
            body = response.text
        message = f"Cyberday API {response.request.method} {response.request.url} → {response.status_code}"
        if response.status_code in (401, 403):
            raise CyberdayAuthError(message, response.status_code, body)
        if response.status_code == 429:
            raise CyberdayRateLimitError(message, response.status_code, body)
        raise CyberdayAPIError(message, response.status_code, body)

    async def list_systems(self) -> list[System]:
        response = await self._http.get("/api/external/systems/topics/")
        self._check(response)
        payload = response.json()
        if not isinstance(payload, list):
            raise CyberdayAPIError(
                f"Expected list response, got {type(payload).__name__}",
                response.status_code,
                payload,
            )
        return [System.model_validate(item) for item in payload]

    async def create_system(self, title: str) -> SystemRef:
        response = await self._http.post(
            "/api/external/systems/topics/",
            json={"title": title},
        )
        self._check(response)
        return SystemRef.model_validate(response.json())

    async def create_or_update_system_advanced(
        self,
        title: str,
        *,
        nickname: str | None = None,
        owner: str | None = None,
        administrator: str | None = None,
        cost_center: str | None = None,
        linked_systems: list[str] | None = None,
        purpose: str | None = None,
        linked_providers: list[str] | None = None,
        partner_resp_text: str | None = None,
    ) -> dict[str, Any]:
        body = build_advanced_body(
            title,
            nickname=nickname,
            owner=owner,
            administrator=administrator,
            cost_center=cost_center,
            linked_systems=linked_systems,
            purpose=purpose,
            linked_providers=linked_providers,
            partner_resp_text=partner_resp_text,
        )
        response = await self._http.post(
            "/api/external/systems/topics/advanced/",
            json=body,
        )
        self._check(response)
        if not response.content:
            return {"status": "ok"}
        try:
            return response.json()
        except Exception:
            return {"status": "ok", "raw": response.text}

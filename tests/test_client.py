from __future__ import annotations

import json

import httpx
import pytest
import respx

from cyberday_mcp.client import (
    CyberdayAPIError,
    CyberdayAuthError,
    CyberdayClient,
    CyberdayRateLimitError,
)

BASE = "https://dash.appcover.com"


@pytest.fixture
async def client():
    c = CyberdayClient(api_key="test-key", base_url=BASE, timeout=2.0)
    try:
        yield c
    finally:
        await c.aclose()


@respx.mock
async def test_list_systems_sends_api_key_header(client: CyberdayClient) -> None:
    route = respx.get(f"{BASE}/api/external/systems/topics/").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "id": 1,
                    "title": "Salesforce",
                    "assigned_user": {"id": 7, "name": "Ada", "email": "a@x.io"},
                    "workflow_status": {"title": "Active", "type": "active", "color": "green"},
                    "child_stats": {"total": 10, "done": 4, "active": 6},
                }
            ],
        )
    )

    systems = await client.list_systems()

    assert len(systems) == 1
    assert systems[0].id == 1
    assert systems[0].title == "Salesforce"
    assert systems[0].assigned_user is not None
    assert systems[0].assigned_user.email == "a@x.io"
    assert route.called
    assert route.calls.last.request.headers["GROUP-API-KEY"] == "test-key"


@respx.mock
async def test_list_systems_rejects_non_list_payload(client: CyberdayClient) -> None:
    respx.get(f"{BASE}/api/external/systems/topics/").mock(
        return_value=httpx.Response(200, json={"oops": True})
    )
    with pytest.raises(CyberdayAPIError):
        await client.list_systems()


@respx.mock
async def test_create_system(client: CyberdayClient) -> None:
    route = respx.post(f"{BASE}/api/external/systems/topics/").mock(
        return_value=httpx.Response(201, json={"id": 42, "title": "New System"})
    )

    ref = await client.create_system("New System")

    assert ref.id == 42
    assert ref.title == "New System"
    body = json.loads(route.calls.last.request.read())
    assert body == {"title": "New System"}


@respx.mock
async def test_create_advanced_maps_field_names(client: CyberdayClient) -> None:
    route = respx.post(f"{BASE}/api/external/systems/topics/advanced/").mock(
        return_value=httpx.Response(201, content=b"")
    )

    result = await client.create_or_update_system_advanced(
        "CRM",
        nickname="crm-prod",
        owner="Sales Ops",
        linked_systems=["DataLake", "MailSvc"],
        purpose="Customer relationship management",
    )

    assert result == {"status": "ok"}
    body = json.loads(route.calls.last.request.read())
    assert body == {
        "title": "CRM",
        "additional-name": "crm-prod",
        "additional-owner": "Sales Ops",
        "additional-linksystems": ["DataLake", "MailSvc"],
        "units-purpose": "Customer relationship management",
    }
    # optional fields not provided should be absent
    assert "additional-admin" not in body
    assert "additional-cost" not in body


@respx.mock
async def test_auth_error_on_401(client: CyberdayClient) -> None:
    respx.get(f"{BASE}/api/external/systems/topics/").mock(
        return_value=httpx.Response(401, json={"error": "bad key"})
    )
    with pytest.raises(CyberdayAuthError) as exc:
        await client.list_systems()
    assert exc.value.status_code == 401


@respx.mock
async def test_rate_limit_error_on_429(client: CyberdayClient) -> None:
    respx.get(f"{BASE}/api/external/systems/topics/").mock(
        return_value=httpx.Response(429, json={"error": "slow down"})
    )
    with pytest.raises(CyberdayRateLimitError):
        await client.list_systems()


@respx.mock
async def test_generic_error_on_500(client: CyberdayClient) -> None:
    respx.get(f"{BASE}/api/external/systems/topics/").mock(
        return_value=httpx.Response(500, text="boom")
    )
    with pytest.raises(CyberdayAPIError) as exc:
        await client.list_systems()
    assert exc.value.status_code == 500
    assert exc.value.body == "boom"

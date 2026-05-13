from __future__ import annotations

import json

import httpx
import pytest
import respx

import cyberday_mcp.server as server_mod

BASE = "https://dash.appcover.com"


@pytest.fixture(autouse=True)
def _reset_settings_cache() -> None:
    server_mod._settings = None
    yield
    server_mod._settings = None


def _payload(call_result):
    """Return the tool's JSON payload, preferring structuredContent.

    Falls back to collecting text blocks: a single block is returned as the
    parsed JSON value; multiple blocks (FastMCP's per-item serialization for
    list returns) come back as a list of parsed values.
    """
    structured = getattr(call_result, "structuredContent", None)
    if structured is not None:
        if isinstance(structured, dict) and set(structured.keys()) == {"result"}:
            return structured["result"]
        return structured
    blocks = [
        json.loads(b.text)
        for b in call_result.content
        if getattr(b, "type", None) == "text"
    ]
    if len(blocks) == 1:
        return blocks[0]
    return blocks


@respx.mock
async def test_list_systems_tool() -> None:
    respx.get(f"{BASE}/api/external/systems/topics/").mock(
        return_value=httpx.Response(
            200,
            json=[{"id": 1, "title": "DataLake"}, {"id": 2, "title": "CRM"}],
        )
    )

    from mcp.shared.memory import create_connected_server_and_client_session

    async with create_connected_server_and_client_session(
        server_mod.mcp._mcp_server
    ) as session:
        tools = await session.list_tools()
        names = {t.name for t in tools.tools}
        assert {"list_systems", "create_system", "create_or_update_system_advanced"} <= names

        result = await session.call_tool("list_systems", {})

    payload = _payload(result)
    assert isinstance(payload, list)
    assert payload[0]["id"] == 1
    assert payload[1]["title"] == "CRM"


@respx.mock
async def test_create_system_tool() -> None:
    respx.post(f"{BASE}/api/external/systems/topics/").mock(
        return_value=httpx.Response(201, json={"id": 99, "title": "New"})
    )

    from mcp.shared.memory import create_connected_server_and_client_session

    async with create_connected_server_and_client_session(
        server_mod.mcp._mcp_server
    ) as session:
        result = await session.call_tool("create_system", {"title": "New"})

    payload = _payload(result)
    assert payload == {"id": 99, "title": "New"}


@respx.mock
async def test_create_advanced_tool_maps_fields() -> None:
    route = respx.post(f"{BASE}/api/external/systems/topics/advanced/").mock(
        return_value=httpx.Response(201, json={"ok": True})
    )

    from mcp.shared.memory import create_connected_server_and_client_session

    async with create_connected_server_and_client_session(
        server_mod.mcp._mcp_server
    ) as session:
        await session.call_tool(
            "create_or_update_system_advanced",
            {
                "title": "ERP",
                "nickname": "erp-prod",
                "purpose": "Finance core",
                "linked_systems": ["DataLake"],
            },
        )

    body = json.loads(route.calls.last.request.read())
    assert body == {
        "title": "ERP",
        "additional-name": "erp-prod",
        "units-purpose": "Finance core",
        "additional-linksystems": ["DataLake"],
    }

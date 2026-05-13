from __future__ import annotations

from typing import Any

from mcp.server.fastmcp import FastMCP

from .client import CyberdayClient
from .config import Settings

mcp = FastMCP("cyberday")

_settings: Settings | None = None


def _get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


def _new_client() -> CyberdayClient:
    s = _get_settings()
    return CyberdayClient(api_key=s.api_key, base_url=s.base_url, timeout=s.timeout)


@mcp.tool()
async def list_systems() -> list[dict[str, Any]]:
    """List every data system in the current Cyberday organisation.

    Returns each system's id, title, description, assigned user, workflow
    status, importance, dates, and the dynamic `text___system-template-*`
    fields that Cyberday attaches. Use this to read inventory; it does not
    modify anything.
    """
    async with _new_client() as client:
        systems = await client.list_systems()
    return [s.model_dump(mode="json", exclude_none=False) for s in systems]


@mcp.tool()
async def create_system(title: str) -> dict[str, Any]:
    """Create a new Cyberday data system with just a title.

    Returns `{ "id": int, "title": str }` for the new system. Use this when
    you only know the system name and want Cyberday to fill the rest from
    its template. For richer creation use `create_or_update_system_advanced`.
    """
    async with _new_client() as client:
        ref = await client.create_system(title)
    return ref.model_dump(mode="json")


@mcp.tool()
async def create_or_update_system_advanced(
    title: str,
    nickname: str | None = None,
    owner: str | None = None,
    administrator: str | None = None,
    cost_center: str | None = None,
    linked_systems: list[str] | None = None,
    purpose: str | None = None,
    linked_providers: list[str] | None = None,
    partner_resp_text: str | None = None,
) -> dict[str, Any]:
    """Create or update a Cyberday data system with detail fields.

    `title` is required and acts as the upsert key — calling this with an
    existing system title updates that system; a new title creates one.
    All other fields are optional; pass only what you have.

    - nickname: short alternative name (`additional-name`)
    - owner: business owner of the data system (`additional-owner`)
    - administrator: technical admin (`additional-admin`)
    - cost_center: chargeback / budgeting code (`additional-cost`)
    - linked_systems: titles of other Cyberday systems this one connects to
    - purpose: business purpose of the system (`units-purpose`)
    - linked_providers: provider names processing data for this system
    - partner_resp_text: free-text on partner responsibilities
    """
    async with _new_client() as client:
        return await client.create_or_update_system_advanced(
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

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class SystemRef(BaseModel):
    """Reference returned by create-system endpoints."""

    id: int
    title: str


class AssignedUser(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: int | None = None
    name: str | None = None
    email: str | None = None


class WorkflowStatus(BaseModel):
    model_config = ConfigDict(extra="allow")
    title: str | None = None
    type: str | None = None
    color: str | None = None


class ChildStats(BaseModel):
    model_config = ConfigDict(extra="allow")
    total: int | None = None
    done: int | None = None
    active: int | None = None


class System(BaseModel):
    """A Cyberday data system. Extra fields are allowed because the
    Cyberday template attaches many dynamic `text___system-template-*`
    keys that may evolve."""

    model_config = ConfigDict(extra="allow")

    id: int
    title: str | None = None
    description: str | None = None
    assigned_user: AssignedUser | None = None
    workflow_status: WorkflowStatus | None = None
    child_stats: ChildStats | None = None
    cia_importance: str | None = None
    importance: int | None = None
    created: str | None = None
    due_date: str | None = None
    start_date: str | None = None
    next_review_date: str | None = None
    review_interval: int | None = None
    is_draft: bool | None = None
    goals: list[str] | None = None
    week_num: str | None = None


ADVANCED_FIELD_MAP: dict[str, str] = {
    "nickname": "additional-name",
    "owner": "additional-owner",
    "administrator": "additional-admin",
    "cost_center": "additional-cost",
    "linked_systems": "additional-linksystems",
    "purpose": "units-purpose",
    "linked_providers": "processors-block",
    "partner_resp_text": "processors-resptext",
}


def build_advanced_body(title: str, **kwargs: Any) -> dict[str, Any]:
    """Translate snake_case kwargs into Cyberday's hyphenated body keys.

    Drops any kwarg whose value is None so callers don't have to.
    """
    body: dict[str, Any] = {"title": title}
    for py_name, value in kwargs.items():
        if value is None:
            continue
        api_key = ADVANCED_FIELD_MAP.get(py_name)
        if api_key is None:
            raise ValueError(f"Unknown advanced field: {py_name!r}")
        body[api_key] = value
    return body

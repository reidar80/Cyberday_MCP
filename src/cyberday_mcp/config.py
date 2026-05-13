from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="CYBERDAY_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    api_key: str = Field(..., description="Cyberday organisation API key")
    base_url: str = Field("https://dash.appcover.com", description="Cyberday API host")
    timeout: float = Field(30.0, description="HTTP timeout in seconds")

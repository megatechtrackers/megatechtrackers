"""Application configuration"""
from pydantic_settings import BaseSettings
from functools import lru_cache
import json
from typing import Union


class Settings(BaseSettings):
    """Application settings from environment variables"""
    
    # Application
    app_name: str = "Operations Service API"
    app_version: str = "4.0.0"
    debug: bool = False
    
    # Database - using unified megatechtrackers database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/megatechtrackers"
    
    # CORS - can be JSON string from env or list
    # Default includes both dev (3000) and Docker (13000) ports
    cors_origins: Union[str, list[str]] = [
        "http://localhost:3000", 
        "http://localhost:3001",
        "http://localhost:13000",  # Docker frontend port
        "http://frontend:3000"  # Docker internal frontend service
    ]
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
    
    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS origins from JSON string if needed"""
        if isinstance(self.cors_origins, str):
            try:
                return json.loads(self.cors_origins)
            except:
                # If not valid JSON, split by comma
                return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]
        return self.cors_origins


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()

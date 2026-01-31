"""Pydantic Schemas"""
from app.schemas.device import DeviceConfigResponse, DeviceConfigCreate, DeviceListResponse
from app.schemas.unit import UnitResponse, UnitCreate, UnitUpdate, UnitConfigResponse, UnitSearchResponse
from app.schemas.command import (
    SendCommandRequest, 
    CommandResponse, 
    CommandOutboxResponse,
    CommandSentResponse,
    CommandInboxResponse,
    CommandHistoryResponse
)
from app.schemas.io_mapping import (
    DeviceIOMappingCreate,
    DeviceIOMappingUpdate,
    DeviceIOMappingResponse,
    DeviceIOMappingBulkCreate,
    UnitIOMappingCreate,
    UnitIOMappingUpdate,
    UnitIOMappingResponse,
    UnitIOMappingBulkCreate,
    ApplyTemplateRequest,
    ApplyTemplateResponse
)

__all__ = [
    "DeviceConfigResponse",
    "DeviceConfigCreate", 
    "DeviceListResponse",
    "UnitResponse",
    "UnitCreate",
    "UnitUpdate",
    "UnitConfigResponse",
    "UnitSearchResponse",
    "SendCommandRequest",
    "CommandResponse",
    "CommandOutboxResponse",
    "CommandSentResponse",
    "CommandInboxResponse",
    "CommandHistoryResponse",
    # IO Mapping schemas
    "DeviceIOMappingCreate",
    "DeviceIOMappingUpdate",
    "DeviceIOMappingResponse",
    "DeviceIOMappingBulkCreate",
    "UnitIOMappingCreate",
    "UnitIOMappingUpdate",
    "UnitIOMappingResponse",
    "UnitIOMappingBulkCreate",
    "ApplyTemplateRequest",
    "ApplyTemplateResponse"
]

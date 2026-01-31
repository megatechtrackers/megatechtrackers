"""
IO Mapping Schemas - Pydantic models for API validation
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import time, datetime
from enum import IntEnum


class IOType(IntEnum):
    """IO Type enum"""
    DIGITAL = 2
    ANALOG = 3


class TargetType(IntEnum):
    """Target type enum for IO mapping"""
    COLUMN = 0
    STATUS = 1
    BOTH = 2
    JSONB = 3


# =============================================================================
# Device IO Mapping (Templates)
# =============================================================================
class DeviceIOMappingBase(BaseModel):
    """Base schema for device IO mapping"""
    io_id: int = Field(..., ge=1, description="IO ID from the tracker")
    io_multiplier: float = Field(default=1.0, description="Multiplier for analog values")
    io_type: int = Field(..., ge=2, le=3, description="2=Digital, 3=Analog")
    io_name: str = Field(..., min_length=1, max_length=255, description="Name of the IO signal")
    value_name: Optional[str] = Field(default='', max_length=255, description="Name for this specific value")
    value: Optional[float] = Field(default=None, description="Value trigger (NULL for analog)")
    target: int = Field(..., ge=0, le=3, description="0=column, 1=status, 2=both, 3=jsonb")
    column_name: Optional[str] = Field(default='', max_length=255, description="Target column name")
    start_time: Optional[time] = Field(default=time(0, 0, 0), description="Alarm start time")
    end_time: Optional[time] = Field(default=time(23, 59, 59), description="Alarm end time")
    is_alarm: int = Field(default=0, ge=0, le=1, description="Enable alarm (0 or 1)")
    is_sms: int = Field(default=0, ge=0, le=1, description="Enable SMS notification (0 or 1)")
    is_email: int = Field(default=0, ge=0, le=1, description="Enable email notification (0 or 1)")
    is_call: int = Field(default=0, ge=0, le=1, description="Enable call notification (0 or 1)")


class DeviceIOMappingCreate(DeviceIOMappingBase):
    """Schema for creating a device IO mapping"""
    device_name: str = Field(..., min_length=1, max_length=100, description="Device type name")


class DeviceIOMappingUpdate(BaseModel):
    """Schema for updating a device IO mapping (all fields optional)"""
    io_id: Optional[int] = Field(None, ge=1)
    io_multiplier: Optional[float] = None
    io_type: Optional[int] = Field(None, ge=2, le=3)
    io_name: Optional[str] = Field(None, min_length=1, max_length=255)
    value_name: Optional[str] = Field(None, max_length=255)
    value: Optional[float] = None
    target: Optional[int] = Field(None, ge=0, le=3)
    column_name: Optional[str] = Field(None, max_length=255)
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    is_alarm: Optional[int] = Field(None, ge=0, le=1)
    is_sms: Optional[int] = Field(None, ge=0, le=1)
    is_email: Optional[int] = Field(None, ge=0, le=1)
    is_call: Optional[int] = Field(None, ge=0, le=1)


class DeviceIOMappingResponse(DeviceIOMappingBase):
    """Schema for device IO mapping response"""
    id: int
    device_name: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class DeviceIOMappingBulkCreate(BaseModel):
    """Schema for bulk creating device IO mappings"""
    device_name: str = Field(..., min_length=1, max_length=100)
    mappings: List[DeviceIOMappingBase]


# =============================================================================
# Tracker IO Mapping (Per IMEI)
# =============================================================================
class UnitIOMappingBase(BaseModel):
    """Base schema for tracker IO mapping"""
    io_id: int = Field(..., ge=1, description="IO ID from the tracker")
    io_multiplier: float = Field(default=1.0, description="Multiplier for analog values")
    io_type: int = Field(..., ge=2, le=3, description="2=Digital, 3=Analog")
    io_name: str = Field(..., min_length=1, max_length=255, description="Name of the IO signal")
    value_name: Optional[str] = Field(default='', max_length=255, description="Name for this specific value")
    value: Optional[float] = Field(default=None, description="Value trigger (NULL for analog)")
    target: int = Field(..., ge=0, le=3, description="0=column, 1=status, 2=both, 3=jsonb")
    column_name: Optional[str] = Field(default='', max_length=255, description="Target column name")
    start_time: Optional[time] = Field(default=time(0, 0, 0), description="Alarm start time")
    end_time: Optional[time] = Field(default=time(23, 59, 59), description="Alarm end time")
    is_alarm: int = Field(default=0, ge=0, le=1, description="Enable alarm (0 or 1)")
    is_sms: int = Field(default=0, ge=0, le=1, description="Enable SMS notification (0 or 1)")
    is_email: int = Field(default=0, ge=0, le=1, description="Enable email notification (0 or 1)")
    is_call: int = Field(default=0, ge=0, le=1, description="Enable call notification (0 or 1)")


class UnitIOMappingCreate(UnitIOMappingBase):
    """Schema for creating a tracker IO mapping"""
    imei: int = Field(..., description="Tracker IMEI")


class UnitIOMappingUpdate(BaseModel):
    """Schema for updating a tracker IO mapping (all fields optional)"""
    io_id: Optional[int] = Field(None, ge=1)
    io_multiplier: Optional[float] = None
    io_type: Optional[int] = Field(None, ge=2, le=3)
    io_name: Optional[str] = Field(None, min_length=1, max_length=255)
    value_name: Optional[str] = Field(None, max_length=255)
    value: Optional[float] = None
    target: Optional[int] = Field(None, ge=0, le=3)
    column_name: Optional[str] = Field(None, max_length=255)
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    is_alarm: Optional[int] = Field(None, ge=0, le=1)
    is_sms: Optional[int] = Field(None, ge=0, le=1)
    is_email: Optional[int] = Field(None, ge=0, le=1)
    is_call: Optional[int] = Field(None, ge=0, le=1)


class UnitIOMappingResponse(UnitIOMappingBase):
    """Schema for tracker IO mapping response"""
    id: int
    imei: int
    createddate: Optional[datetime] = None
    updateddate: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class UnitIOMappingBulkCreate(BaseModel):
    """Schema for bulk creating tracker IO mappings"""
    imei: int = Field(..., description="Tracker IMEI")
    mappings: List[UnitIOMappingBase]


class ApplyTemplateRequest(BaseModel):
    """Schema for applying device template to a tracker"""
    imei: int = Field(..., description="Target tracker IMEI")
    device_name: str = Field(..., min_length=1, max_length=100, description="Device type to copy from")
    overwrite: bool = Field(default=False, description="Overwrite existing mappings")


class ApplyTemplateResponse(BaseModel):
    """Response for apply template operation"""
    imei: int
    device_name: str
    mappings_created: int
    mappings_skipped: int
    message: str

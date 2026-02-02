"""Device Config Schemas - Matches original CommandConfigApi structure. Datetime serialized as UTC with Z."""
from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime

from app.utils.datetime_utils import serialize_datetime_utc


class SubDetailSchema(BaseModel):
    """UI control metadata for a single configurable parameter"""
    SubDetailID: int
    Control: Optional[str] = None        # TextBox, ComboBox, ATFenceControl, etc.
    ControlWidth: Optional[int] = None
    ActualValue: Optional[str] = None
    Description: Optional[str] = None
    CmdText: Optional[str] = None
    CmdValue: Optional[str] = None
    MinValue: Optional[str] = None
    MaxValue: Optional[str] = None


class ConfigParameterSchema(BaseModel):
    """Configurable parameter with its UI metadata (SubDetails)"""
    ParameterID: int
    ParameterName: Optional[str] = None
    ParameterType: str               # '2' for Configurable
    ParameterValue: Optional[str] = None  # Default value
    SubDetails: Optional[list[SubDetailSchema]] = None


class CommandParameterSchema(BaseModel):
    """Any parameter (Fixed or Configurable) for command building"""
    ParameterID: int
    ParameterType: str               # '1' for Fixed, '2' for Configurable
    ParameterTypeDesc: str           # 'Fixed' or 'Configurable'
    ParameterName: Optional[str] = None
    DefaultValue: Optional[str] = None


class DeviceConfigBase(BaseModel):
    """Base device config fields - matches original CommandConfigApi structure"""
    device_name: str
    config_type: str                             # 'Setting' or 'Command'
    category_type_desc: Optional[str] = None     # 'General', 'IOProperties', 'GeoFencing'
    category: Optional[str] = None               # Category name from CommandCategory
    profile: Optional[str] = None                # Profile number (1, 2, 3, 4)
    command_name: str                            # Command name from CommandMaster
    description: Optional[str] = None
    command_seprator: Optional[str] = None       # Command separator (note: typo in DB column name)
    command_syntax: Optional[str] = None         # Command syntax from CommandMaster
    command_type: Optional[str] = None           # Command type from CommandMaster
    
    # command_parameters_json: ALL parameters (Fixed + Configurable) for command building
    command_parameters_json: Optional[list[dict]] = None
    
    # parameters_json: Configurable parameters with FULL UI metadata (matches original structure)
    parameters_json: Optional[list[dict]] = None
    
    command_id: Optional[int] = None             # CommandMaster.ID - correlation key for unit_config


class DeviceConfigCreate(DeviceConfigBase):
    """Schema for creating device config"""
    pass


class DeviceConfigResponse(DeviceConfigBase):
    """Schema for device config response"""
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
        json_encoders = {datetime: serialize_datetime_utc}


class DeviceListResponse(BaseModel):
    """Schema for device config list"""
    device_name: str
    config_count: int
    setting_count: int
    command_count: int
    
    class Config:
        from_attributes = True

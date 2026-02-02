"""Unit Schemas. Datetime serialized as UTC with Z for API."""
from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime

from app.utils.datetime_utils import serialize_datetime_utc


class UnitBase(BaseModel):
    """Base unit fields - Simplified to match View_UnitViewFromERP"""
    device_name: str
    mega_id: Optional[str] = None  # From View_UnitViewFromERP.MegaID (with 'M' prefix)
    ffid: Optional[str] = None  # From View_UnitViewFromERP.FF
    sim_no: Optional[str] = None  # From View_UnitViewFromERP.ServiceNo
    modem_id: Optional[int] = None  # From View_UnitViewFromERP.ModemID


class UnitCreate(UnitBase):
    """Schema for creating a unit"""
    imei: str


class UnitUpdate(BaseModel):
    """Schema for updating a unit"""
    device_name: Optional[str] = None
    mega_id: Optional[str] = None
    ffid: Optional[str] = None
    sim_no: Optional[str] = None
    modem_id: Optional[int] = None


class UnitResponse(UnitBase):
    """Schema for unit response"""
    id: int
    imei: str
    created_date: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
        json_encoders = {datetime: serialize_datetime_utc}


class UnitSearchResponse(BaseModel):
    """Schema for unit search results"""
    id: int
    imei: str
    device_name: str
    sim_no: Optional[str] = None
    mega_id: Optional[str] = None
    ffid: Optional[str] = None
    
    class Config:
        from_attributes = True


class UnitConfigResponse(BaseModel):
    """Schema for unit configuration (setting with current value) - matches original structure"""
    id: int
    device_name: str                             # Device name from matched DeviceConfig
    command_name: str                            # Display name from command_name
    category_type_desc: Optional[str] = None     # 'General', 'IOProperties', 'GeoFencing'
    category: Optional[str] = None
    profile: Optional[str] = None
    command_seprator: Optional[str] = None       # Command separator
    command_syntax: Optional[str] = None         # Command syntax from CommandMaster
    command_type: Optional[str] = None           # Command type from CommandMaster
    command_id: Optional[int] = None             # CommandMaster.ID for saving values
    
    # command_parameters_json: ALL parameters for command building
    command_parameters_json: Optional[list[dict]] = None
    
    # parameters_json: Configurable parameters with full UI metadata
    parameters_json: Optional[list[dict]] = None
    
    # current_value: Saved value from unit_config (JSON array format)
    # Format: [{"ParameterID": 123, "Value": "val1"}, ...]
    current_value: Optional[str] = None
    
    description: Optional[str] = None
    
    class Config:
        from_attributes = True


class SaveValueRequest(BaseModel):
    """Schema for saving a configuration value"""
    command_id: int  # Changed from config_id to command_id
    value: str
    user_id: Optional[str] = None


class SaveValuesRequest(BaseModel):
    """Schema for saving multiple configuration values"""
    values: list[SaveValueRequest]
    user_id: Optional[str] = None


class CopyUnitConfigRequest(BaseModel):
    """Schema for copying unit configuration"""
    source_imei: str
    target_imeis: list[str]
    send_commands: bool = False  # Whether to send commands to target units
    send_method: str = "sms"  # 'sms' or 'gprs'
    user_id: Optional[str] = None


class CopyUnitConfigResponse(BaseModel):
    """Schema for copy unit configuration response"""
    success: bool
    message: str
    total_configs: int = 0
    copied_configs: int = 0
    skipped_configs: int = 0
    commands_sent: int = 0
    errors: dict[str, str] = {}

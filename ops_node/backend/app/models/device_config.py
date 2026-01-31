"""Device Configuration Model - Matches original CommandConfigApi structure"""
from sqlalchemy import Column, Integer, String, Text, DateTime, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.database import Base


class DeviceConfig(Base):
    """Device configuration template - matches original CommandConfigApi structure
    
    Structure:
    - command_parameters_json: ALL parameters (Fixed + Configurable) for command building
    - parameters_json: Configurable parameters with full UI metadata (matches ParameterConfigDto → SubDetailConfigDto)
    """
    __tablename__ = "device_config"
    
    id = Column(Integer, primary_key=True, index=True)
    device_name = Column(String(100), nullable=False, index=True)
    config_type = Column(String(20), nullable=False)      # 'Setting' or 'Command'
    category_type_desc = Column(String(50))               # 'General', 'IOProperties', 'GeoFencing'
    category = Column(String(100))                        # Category name from CommandCategory
    profile = Column(String(10))                          # Profile number (1, 2, 3, 4)
    command_name = Column(String(200), nullable=False)    # Command name from CommandMaster
    description = Column(Text)
    command_seprator = Column(String(50))                 # Command separator (note: typo in DB column name)
    command_syntax = Column(String(500))                  # Command syntax from CommandMaster
    command_type = Column(String(10))                     # Command type from CommandMaster
    
    # command_parameters_json: ALL parameters (Fixed + Configurable) for command building
    # Format: [{"ParameterID": 123, "ParameterType": "1", "ParameterTypeDesc": "Fixed", "ParameterName": "StartCharacter", "DefaultValue": "1"}, ...]
    command_parameters_json = Column(JSONB)
    
    # parameters_json: Configurable parameters with FULL UI metadata (matches original ParameterConfigDto → SubDetailConfigDto)
    # Format: [{"ParameterID": 123, "ParameterName": "CommandValue", "ParameterType": "2", "ParameterValue": "default",
    #           "SubDetails": [{"SubDetailID": 456, "Control": "ComboBox", "ControlWidth": 200, "ActualValue": "0", 
    #                          "Description": "...", "CmdText": "Disable", "CmdValue": "0", "MinValue": null, "MaxValue": null}, ...]}]
    parameters_json = Column(JSONB)
    
    command_id = Column(Integer)                          # CommandMaster.ID - correlation key for unit_config
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    __table_args__ = (
        Index('idx_device_config_category', 'device_name', 'category'),
        Index('idx_device_config_command_id', 'command_id'),
    )

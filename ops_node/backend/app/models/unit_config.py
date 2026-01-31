"""Unit Config Model - Saved configurations per unit"""
from sqlalchemy import Column, Integer, String, Text, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from app.database import Base


class UnitConfig(Base):
    """Saved configuration value for a specific unit - Uses MegaID and DeviceName for direct joins"""
    __tablename__ = "unit_config"
    
    id = Column(Integer, primary_key=True, index=True)
    mega_id = Column(String(50), nullable=False, index=True)  # From LastConfiguration.MegaID
    device_name = Column(String(100), nullable=False, index=True)  # From cfg_Unit.DeviceName - enables direct join with DeviceConfig
    command_id = Column(Integer, nullable=False)  # CommandMaster.ID - identifies which setting this value is for
    value = Column(Text, nullable=False)  # Current saved value (JSON array format: [{"ParameterID": 123, "Value": "val1"}, ...]) - uses Text for large JSON with multiple parameters
    modified_by = Column(String(100))  # Who last updated
    modified_date = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    __table_args__ = (
        UniqueConstraint('mega_id', 'device_name', 'command_id', name='uq_unit_config'),
    )

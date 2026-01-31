"""
IO Mapping Models - Device Templates and Tracker-specific mappings
"""
from sqlalchemy import Column, BigInteger, Integer, String, Float, Time, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from app.database import Base


class DeviceIOMapping(Base):
    """Device IO Mapping Templates - default IO mappings per device type"""
    __tablename__ = "device_io_mapping"
    
    id = Column(BigInteger, primary_key=True, index=True)
    device_name = Column(String(100), nullable=False, index=True)
    io_id = Column(Integer, nullable=False)
    io_multiplier = Column(Float, nullable=False, default=1.0)
    io_type = Column(Integer, nullable=False)  # 2=Digital, 3=Analog
    io_name = Column(String(255), nullable=False)
    value_name = Column(String(255), default='')
    value = Column(Float, nullable=True)  # NULL for analog/NA
    target = Column(Integer, nullable=False)  # 0=column, 1=status, 2=both, 3=jsonb
    column_name = Column(String(255), default='')
    start_time = Column(Time, default='00:00:00')
    end_time = Column(Time, default='23:59:59')
    is_alarm = Column(Integer, default=0)
    is_sms = Column(Integer, default=0)
    is_email = Column(Integer, default=0)
    is_call = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    __table_args__ = (
        UniqueConstraint('device_name', 'io_id', 'value', name='uq_device_io_mapping'),
    )


class UnitIOMapping(Base):
    """Tracker Unit IO Mapping - Unit-specific IO Mapping (per IMEI)"""
    __tablename__ = "unit_io_mapping"
    
    id = Column(BigInteger, primary_key=True, index=True)
    imei = Column(BigInteger, nullable=False, index=True)
    io_id = Column(Integer, nullable=False)
    io_multiplier = Column(Float, nullable=False, default=1.0)
    io_type = Column(Integer, nullable=False)  # 2=Digital, 3=Analog
    io_name = Column(String(255), nullable=False)
    value_name = Column(String(255), default='')
    value = Column(Float, nullable=True)  # NULL for analog/NA
    target = Column(Integer, nullable=False)  # 0=column, 1=status, 2=both, 3=jsonb
    column_name = Column(String(255), default='')
    start_time = Column(Time, default='00:00:00')
    end_time = Column(Time, default='23:59:59')
    is_alarm = Column(Integer, default=0)
    is_sms = Column(Integer, default=0)
    is_email = Column(Integer, default=0)
    is_call = Column(Integer, default=0)
    createddate = Column(DateTime, server_default=func.now())
    updateddate = Column(DateTime, server_default=func.now(), onupdate=func.now())

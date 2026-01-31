"""Unit (Tracker) Model"""
from sqlalchemy import Column, String, Integer, DateTime, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Unit(Base):
    """GPS Tracker unit - Simplified to match View_UnitViewFromERP"""
    __tablename__ = "unit"
    
    id = Column(Integer, primary_key=True, index=True)
    mega_id = Column(String(50), index=True)  # From View_UnitViewFromERP.MegaID (with 'M' prefix: 'M2100290')
    imei = Column(String(50), nullable=False, unique=True, index=True)  # From View_UnitViewFromERP.UnitID
    ffid = Column(String(50))  # From View_UnitViewFromERP.FF
    sim_no = Column(String(50), index=True)  # From View_UnitViewFromERP.ServiceNo
    device_name = Column(String(100), nullable=False, index=True)  # From View_UnitViewFromERP.UnitName (links to device_config.device_name)
    modem_id = Column(Integer)  # From View_UnitViewFromERP.ModemID
    created_date = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    # Note: UnitConfig now uses mega_id instead of unit_id, so no direct relationship
    outbox_commands = relationship("CommandOutbox", back_populates="unit")

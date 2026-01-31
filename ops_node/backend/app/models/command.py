"""Command Models - Outbox, Sent, Inbox, and History"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class CommandOutbox(Base):
    """Commands waiting to be sent (Queue - Modem reads from here)"""
    __tablename__ = "command_outbox"
    
    id = Column(Integer, primary_key=True, index=True)
    imei = Column(String(50), ForeignKey("unit.imei"), nullable=False, index=True)
    sim_no = Column(String(50), nullable=False)
    command_text = Column(Text, nullable=False)
    config_id = Column(Integer, ForeignKey("device_config.id"))
    user_id = Column(String(100))
    send_method = Column(String(10), default="sms")  # 'sms' or 'gprs'
    retry_count = Column(Integer, default=0)  # Number of send attempts
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    unit = relationship("Unit", back_populates="outbox_commands")
    config = relationship("DeviceConfig")


class CommandSent(Base):
    """Sent commands awaiting device reply"""
    __tablename__ = "command_sent"
    
    id = Column(Integer, primary_key=True, index=True)
    imei = Column(String(50), nullable=False, index=True)
    sim_no = Column(String(50), nullable=False, index=True)
    command_text = Column(Text, nullable=False)
    config_id = Column(Integer, ForeignKey("device_config.id"))
    user_id = Column(String(100))
    send_method = Column(String(10), default="sms")
    status = Column(String(20), default="sent", index=True)  # 'sent', 'failed', 'successful'
    error_message = Column(Text)
    created_at = Column(DateTime(timezone=True))  # When originally queued
    sent_at = Column(DateTime(timezone=True), server_default=func.now())  # When actually sent
    
    # Relationships
    config = relationship("DeviceConfig")


class CommandInbox(Base):
    """Incoming SMS from devices"""
    __tablename__ = "command_inbox"
    
    id = Column(Integer, primary_key=True, index=True)
    sim_no = Column(String(50), nullable=False, index=True)
    imei = Column(String(50))  # Matched to unit (if found)
    message_text = Column(Text, nullable=False)
    received_at = Column(DateTime(timezone=True), server_default=func.now())
    processed = Column(Boolean, default=False, index=True)


class CommandHistory(Base):
    """Archive of all sent and received commands"""
    __tablename__ = "command_history"
    
    id = Column(Integer, primary_key=True, index=True)
    imei = Column(String(50), index=True)  # Can be NULL for unknown devices
    sim_no = Column(String(50))
    direction = Column(String(10), nullable=False)  # 'outgoing' or 'incoming'
    command_text = Column(Text, nullable=False)
    config_id = Column(Integer, ForeignKey("device_config.id"))
    status = Column(String(20))  # 'sent', 'failed', 'successful', 'received'
    send_method = Column(String(10))  # 'sms' or 'gprs'
    user_id = Column(String(100))
    created_at = Column(DateTime(timezone=True))  # Original queue/receive time
    sent_at = Column(DateTime(timezone=True))  # When sent (outgoing only)
    archived_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    config = relationship("DeviceConfig")
    
    __table_args__ = (
        Index('idx_history_imei_date', 'imei', 'created_at'),
    )

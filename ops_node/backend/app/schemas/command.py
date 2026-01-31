"""Command Schemas"""
from pydantic import BaseModel
from typing import Optional, Union, List, Dict
from datetime import datetime


class SendCommandRequest(BaseModel):
    """Schema for sending a command"""
    config_id: Optional[int] = None  # device_config.id
    value: Optional[Union[str, List[str], Dict[str, str]]] = None  # Value(s) to substitute
    command_text: Optional[str] = None  # Direct command text (if no config_id)
    user_id: Optional[str] = None
    save_value: bool = True  # Whether to save the value to unit_config
    send_method: str = "sms"  # 'sms' or 'gprs'


class CommandResponse(BaseModel):
    """Schema for command response"""
    success: bool
    message: str
    command_id: Optional[int] = None
    command_text: Optional[str] = None


class CommandOutboxResponse(BaseModel):
    """Schema for outbox command (queue)"""
    id: int
    imei: str
    sim_no: str
    command_text: str
    send_method: str = "sms"
    retry_count: int = 0
    user_id: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class CommandSentResponse(BaseModel):
    """Schema for sent command (awaiting reply)"""
    id: int
    imei: str
    sim_no: str
    command_text: str
    status: str  # 'sent', 'failed', 'successful'
    send_method: str = "sms"
    error_message: Optional[str] = None
    user_id: Optional[str] = None
    created_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class CommandInboxResponse(BaseModel):
    """Schema for inbox (incoming SMS)"""
    id: int
    sim_no: str
    imei: Optional[str] = None
    message_text: str
    received_at: datetime
    processed: bool = False
    
    class Config:
        from_attributes = True


class CommandHistoryResponse(BaseModel):
    """Schema for command history (archive)"""
    id: int
    imei: Optional[str] = None
    sim_no: Optional[str] = None
    direction: str  # 'outgoing' or 'incoming'
    command_text: str
    status: Optional[str] = None
    send_method: Optional[str] = None
    user_id: Optional[str] = None
    created_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

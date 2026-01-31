"""Command API Routes"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import Optional
from datetime import datetime, timedelta
from app.database import get_db
from app.models import Unit, DeviceConfig, UnitConfig, CommandOutbox, CommandSent, CommandInbox, CommandHistory
from app.schemas.command import (
    SendCommandRequest, CommandResponse, 
    CommandOutboxResponse, CommandSentResponse, 
    CommandInboxResponse, CommandHistoryResponse
)
from app.utils.command_builder import build_command_text

router = APIRouter()


# ============================================
# Unit-specific endpoints
# ============================================

@router.post("/{imei}/send", response_model=CommandResponse)
async def send_command(
    imei: str,
    request: SendCommandRequest,
    db: AsyncSession = Depends(get_db)
):
    """Send a command to a unit (queues in outbox)"""
    
    # Get unit
    result = await db.execute(select(Unit).where(Unit.imei == imei))
    unit = result.scalar_one_or_none()
    
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    if not unit.sim_no:
        raise HTTPException(status_code=400, detail="Unit has no SIM number configured")
    
    # Build command text
    command_text = None
    
    # Support both config_id (device_config.id) and command_id (for direct lookup)
    config = None
    if request.config_id:
        # Get config by device_config.id
        result = await db.execute(
            select(DeviceConfig).where(DeviceConfig.id == request.config_id)
        )
        config = result.scalar_one_or_none()
        
        if not config:
            raise HTTPException(status_code=404, detail="Config not found")
    
    if config:
        
        # Get unit_config to load saved values if user didn't provide value
        # Use (device_name, command_id) and mega_id (from unit) for unambiguous lookup
        unit_config = None
        if not request.value and config.command_id:
            result = await db.execute(
                select(UnitConfig).where(
                    UnitConfig.mega_id == unit.mega_id,
                    UnitConfig.device_name == config.device_name,
                    UnitConfig.command_id == config.command_id
                )
            )
            unit_config = result.scalar_one_or_none()
        
        try:
            # Build command using new format (command_seprator + command_parameters_json)
            command_text = build_command_text(config, request.value, unit, db, unit_config)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        
        # Save value if requested
        if request.save_value and request.value and config.config_type == 'Setting' and config.command_id:
            import json
            
            # Extract values array from user input (could be array, string, etc.)
            values_list = []
            if isinstance(request.value, list):
                values_list = [str(v) for v in request.value]
            elif isinstance(request.value, str):
                try:
                    parsed = json.loads(request.value)
                    if isinstance(parsed, list):
                        values_list = [str(v) for v in parsed]
                    else:
                        values_list = [str(parsed)]
                except (json.JSONDecodeError, TypeError):
                    values_list = [request.value]
            else:
                values_list = [str(request.value)]
            
            # Convert to new format: [{"ParameterID": 123, "Value": "val1"}, ...]
            # Match values by position to configurable parameters from command_parameters_json
            if config.command_parameters_json and isinstance(config.command_parameters_json, list):
                # Find configurable parameters (ParameterType = '2')
                configurable_params = [
                    (i, param) for i, param in enumerate(config.command_parameters_json)
                    if isinstance(param, dict) and str(param.get("ParameterType", "")) == "2"
                ]
                
                # Build value array with ParameterID and Value
                value_objects = []
                for idx, (param_idx, param) in enumerate(configurable_params):
                    param_id = param.get("ParameterID")
                    param_value = values_list[idx] if idx < len(values_list) else param.get("DefaultValue", "")
                    if param_id:
                        value_objects.append({"ParameterID": param_id, "Value": str(param_value)})
                
                value_to_save = json.dumps(value_objects) if value_objects else json.dumps([{"ParameterID": 0, "Value": ""}])
            else:
                # No command_parameters_json - skip saving value
                value_to_save = json.dumps([{"ParameterID": 0, "Value": request.value or ""}])
            
            result = await db.execute(
                select(UnitConfig).where(
                    UnitConfig.mega_id == unit.mega_id,
                    UnitConfig.device_name == config.device_name,
                    UnitConfig.command_id == config.command_id
                )
            )
            existing = result.scalar_one_or_none()
            
            if existing:
                existing.value = value_to_save
                existing.modified_by = request.user_id
            else:
                new_value = UnitConfig(
                    mega_id=unit.mega_id,
                    device_name=config.device_name,  # Get device_name from config
                    command_id=config.command_id,
                    value=value_to_save,
                    modified_by=request.user_id
                )
                db.add(new_value)
    
    elif request.command_text:
        command_text = request.command_text
    
    else:
        raise HTTPException(
            status_code=400, 
            detail="Either config_id, command_id, or command_text must be provided"
        )
    
    # Add to outbox (queue only - no status needed)
    outbox_cmd = CommandOutbox(
        imei=imei,
        sim_no=unit.sim_no,
        command_text=command_text,
        config_id=request.config_id,
        user_id=request.user_id,
        send_method=request.send_method
    )
    db.add(outbox_cmd)
    await db.commit()
    await db.refresh(outbox_cmd)
    
    return CommandResponse(
        success=True,
        message="Command queued successfully",
        command_id=outbox_cmd.id,
        command_text=command_text
    )


@router.get("/{imei}/outbox", response_model=list[CommandOutboxResponse])
async def get_outbox(
    imei: str,
    db: AsyncSession = Depends(get_db)
):
    """Get pending commands in outbox for a unit"""
    
    query = select(CommandOutbox).where(
        CommandOutbox.imei == imei
    ).order_by(desc(CommandOutbox.created_at)).limit(100)
    
    result = await db.execute(query)
    commands = result.scalars().all()
    
    return commands


@router.get("/{imei}/sent", response_model=list[CommandSentResponse])
async def get_sent(
    imei: str,
    status: Optional[str] = Query(None, description="Filter by status: sent, failed, successful"),
    db: AsyncSession = Depends(get_db)
):
    """Get sent commands for a unit"""
    
    query = select(CommandSent).where(CommandSent.imei == imei)
    
    if status:
        query = query.where(CommandSent.status == status)
    
    query = query.order_by(desc(CommandSent.sent_at)).limit(100)
    
    result = await db.execute(query)
    commands = result.scalars().all()
    
    return commands


@router.get("/{imei}/inbox", response_model=list[CommandInboxResponse])
async def get_inbox(
    imei: str,
    processed: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """Get inbox (incoming SMS) for a unit"""
    
    query = select(CommandInbox).where(CommandInbox.imei == imei)
    
    if processed is not None:
        query = query.where(CommandInbox.processed == processed)
    
    query = query.order_by(desc(CommandInbox.received_at)).limit(100)
    
    result = await db.execute(query)
    messages = result.scalars().all()
    
    return messages


@router.get("/{imei}/history", response_model=list[CommandHistoryResponse])
async def get_history(
    imei: str,
    direction: Optional[str] = Query(None, description="Filter: 'outgoing' or 'incoming'"),
    days: int = Query(7, description="Number of days to look back"),
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db)
):
    """Get command history for a unit"""
    
    from_date = datetime.now() - timedelta(days=days)
    
    query = select(CommandHistory).where(
        CommandHistory.imei == imei,
        CommandHistory.created_at >= from_date
    )
    
    if direction:
        query = query.where(CommandHistory.direction == direction)
    
    query = query.order_by(desc(CommandHistory.created_at)).limit(limit)
    
    result = await db.execute(query)
    history = result.scalars().all()
    
    return history


# ============================================
# Global endpoints (for modem service)
# ============================================

@router.get("/outbox/pending", response_model=list[CommandOutboxResponse])
async def get_all_pending(
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db)
):
    """Get all pending commands (for modem service to poll)"""
    
    query = select(CommandOutbox).order_by(
        CommandOutbox.created_at
    ).limit(limit)
    
    result = await db.execute(query)
    commands = result.scalars().all()
    
    return commands


@router.delete("/outbox/{command_id}")
async def cancel_command(
    command_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Cancel a pending command (remove from outbox, add to history)"""
    
    result = await db.execute(
        select(CommandOutbox).where(CommandOutbox.id == command_id)
    )
    cmd = result.scalar_one_or_none()
    
    if not cmd:
        raise HTTPException(status_code=404, detail="Command not found in outbox")
    
    # Add to history before deleting
    history = CommandHistory(
        imei=cmd.imei,
        sim_no=cmd.sim_no,
        direction="outgoing",
        command_text=cmd.command_text,
        config_id=cmd.config_id,
        status="cancelled",
        send_method=cmd.send_method,
        user_id=cmd.user_id,
        created_at=cmd.created_at
    )
    db.add(history)
    
    await db.delete(cmd)
    await db.commit()
    
    return {"success": True, "message": "Command cancelled"}


@router.post("/outbox/{command_id}/send")
async def mark_command_sent(
    command_id: int,
    success: bool = Query(..., description="Whether SMS was sent successfully"),
    error: Optional[str] = Query(None, description="Error message if failed"),
    db: AsyncSession = Depends(get_db)
):
    """Move command from outbox to sent + history (called by modem after sending)"""
    
    # Get from outbox
    result = await db.execute(
        select(CommandOutbox).where(CommandOutbox.id == command_id)
    )
    outbox_cmd = result.scalar_one_or_none()
    
    if not outbox_cmd:
        raise HTTPException(status_code=404, detail="Command not found in outbox")
    
    status = "sent" if success else "failed"
    now = datetime.now()
    
    # Create sent record
    sent_cmd = CommandSent(
        imei=outbox_cmd.imei,
        sim_no=outbox_cmd.sim_no,
        command_text=outbox_cmd.command_text,
        config_id=outbox_cmd.config_id,
        user_id=outbox_cmd.user_id,
        send_method=outbox_cmd.send_method,
        status=status,
        error_message=error,
        created_at=outbox_cmd.created_at,
        sent_at=now
    )
    db.add(sent_cmd)
    
    # Also add to history (outbox is being deleted)
    history = CommandHistory(
        imei=outbox_cmd.imei,
        sim_no=outbox_cmd.sim_no,
        direction="outgoing",
        command_text=outbox_cmd.command_text,
        config_id=outbox_cmd.config_id,
        status=status,
        send_method=outbox_cmd.send_method,
        user_id=outbox_cmd.user_id,
        created_at=outbox_cmd.created_at,
        sent_at=now
    )
    db.add(history)
    
    # Delete from outbox
    await db.delete(outbox_cmd)
    
    await db.commit()
    await db.refresh(sent_cmd)
    
    return {"success": True, "sent_id": sent_cmd.id, "status": sent_cmd.status}


@router.put("/sent/{sent_id}/status")
async def update_sent_status(
    sent_id: int,
    status: str = Query(..., description="New status: sent, failed, successful"),
    db: AsyncSession = Depends(get_db)
):
    """Update sent command status - if successful, also update history and delete from sent"""
    
    result = await db.execute(
        select(CommandSent).where(CommandSent.id == sent_id)
    )
    sent_cmd = result.scalar_one_or_none()
    
    if not sent_cmd:
        raise HTTPException(status_code=404, detail="Sent command not found")
    
    # Update history to match
    result = await db.execute(
        select(CommandHistory).where(
            CommandHistory.sim_no == sent_cmd.sim_no,
            CommandHistory.direction == "outgoing",
            CommandHistory.sent_at == sent_cmd.sent_at
        )
    )
    history_cmd = result.scalar_one_or_none()
    if history_cmd:
        history_cmd.status = status
    
    # If successful, delete from sent (purpose complete)
    if status == "successful":
        await db.delete(sent_cmd)
        await db.commit()
        return {"success": True, "status": status, "message": "Deleted from sent (complete)"}
    else:
        sent_cmd.status = status
        await db.commit()
        return {"success": True, "status": status}


@router.post("/inbox")
async def receive_sms(
    sim_no: str,
    message: str,
    db: AsyncSession = Depends(get_db)
):
    """Record received SMS: add to history, match to sent, clean up sent table"""
    
    # Check for duplicate in history (within 1 minute)
    result = await db.execute(
        select(CommandHistory).where(
            CommandHistory.sim_no == sim_no,
            CommandHistory.command_text == message,
            CommandHistory.direction == "incoming",
            CommandHistory.created_at >= datetime.now() - timedelta(minutes=1)
        )
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        return {"success": True, "message": "SMS already recorded (duplicate)", "history_id": existing.id}
    
    # Try to find unit by SIM number
    result = await db.execute(
        select(Unit).where(Unit.sim_no == sim_no)
    )
    unit = result.scalar_one_or_none()
    
    imei = unit.imei if unit else None
    
    # Add incoming SMS to history
    history = CommandHistory(
        imei=imei,
        sim_no=sim_no,
        direction="incoming",
        command_text=message,
        status="received",
        created_at=datetime.now()
    )
    db.add(history)
    
    matched = False
    
    # Try to match to a sent command and clean up
    if unit:
        result = await db.execute(
            select(CommandSent).where(
                CommandSent.sim_no == sim_no,
                CommandSent.status == "sent",
                CommandSent.sent_at >= datetime.now() - timedelta(minutes=10)
            ).order_by(desc(CommandSent.sent_at)).limit(1)
        )
        sent_cmd = result.scalar_one_or_none()
        
        if sent_cmd:
            # Update history for that outgoing command to 'successful'
            result = await db.execute(
                select(CommandHistory).where(
                    CommandHistory.sim_no == sim_no,
                    CommandHistory.direction == "outgoing",
                    CommandHistory.status == "sent",
                    CommandHistory.sent_at >= datetime.now() - timedelta(minutes=10)
                ).order_by(desc(CommandHistory.sent_at)).limit(1)
            )
            history_cmd = result.scalar_one_or_none()
            if history_cmd:
                history_cmd.status = "successful"
            
            # Delete from sent (purpose complete, already in history)
            await db.delete(sent_cmd)
            matched = True
    
    await db.commit()
    await db.refresh(history)
    
    return {
        "success": True, 
        "message": f"SMS recorded to history{', matched and cleaned sent' if matched else ''}",
        "history_id": history.id
    }


@router.post("/cleanup")
async def cleanup_old_records(
    older_than_hours: int = Query(24, description="Delete sent/inbox older than X hours"),
    db: AsyncSession = Depends(get_db)
):
    """Delete old sent and inbox records (already in history)"""
    
    cutoff = datetime.now() - timedelta(hours=older_than_hours)
    deleted_count = 0
    
    # Delete old sent commands (already in history)
    result = await db.execute(
        select(CommandSent).where(CommandSent.sent_at < cutoff)
    )
    sent_cmds = result.scalars().all()
    
    for cmd in sent_cmds:
        await db.delete(cmd)
        deleted_count += 1
    
    # Delete old inbox messages (already in history)
    result = await db.execute(
        select(CommandInbox).where(CommandInbox.received_at < cutoff)
    )
    inbox_msgs = result.scalars().all()
    
    for msg in inbox_msgs:
        await db.delete(msg)
        deleted_count += 1
    
    await db.commit()
    
    return {"success": True, "deleted_count": deleted_count}

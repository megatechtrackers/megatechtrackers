"""Unit API Routes"""
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload
from typing import Optional
from app.database import get_db
from app.models import Unit, DeviceConfig, UnitConfig, CommandOutbox
from app.schemas.unit import (
    UnitResponse, UnitCreate, UnitUpdate, 
    UnitConfigResponse, UnitSearchResponse,
    SaveValueRequest, SaveValuesRequest,
    CopyUnitConfigRequest, CopyUnitConfigResponse
)
from app.utils.command_builder import build_command_text

router = APIRouter()


@router.get("/search", response_model=list[UnitSearchResponse])
async def search_units(
    q: Optional[str] = Query(None, description="Search by IMEI, SIM, or name"),
    device_name: Optional[str] = Query(None, description="Filter by device config"),
    limit: int = Query(50, le=500),
    db: AsyncSession = Depends(get_db)
):
    """Search units by IMEI, SIM number, or name"""
    
    query = select(Unit)  # Removed is_active filter - unit table doesn't have is_active
    
    if q:
        search_term = f"%{q}%"
        query = query.where(
            or_(
                Unit.imei.ilike(search_term),
                Unit.sim_no.ilike(search_term),
                Unit.mega_id.ilike(search_term),
                Unit.ffid.ilike(search_term)
            )
        )
    
    if device_name:
        query = query.where(Unit.device_name == device_name)
    
    query = query.order_by(Unit.imei.desc()).limit(limit)
    
    result = await db.execute(query)
    units = result.scalars().all()
    
    return units


@router.get("/{imei}", response_model=UnitResponse)
async def get_unit(imei: str, db: AsyncSession = Depends(get_db)):
    """Get unit by IMEI"""
    
    result = await db.execute(
        select(Unit).where(Unit.imei == imei)
    )
    unit = result.scalar_one_or_none()
    
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    return unit


@router.get("/{imei}/settings", response_model=list[UnitConfigResponse])
async def get_unit_settings(imei: str, db: AsyncSession = Depends(get_db)):
    """Get all settings for a unit with current values"""
    
    # Get unit first
    result = await db.execute(select(Unit).where(Unit.imei == imei))
    unit = result.scalar_one_or_none()
    
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    # Get ALL device configs for this device type with LEFT OUTER JOIN to Unit Configs
    # This ensures all settings are shown, even if no value has been saved yet
    query = select(
        DeviceConfig,
        UnitConfig.value.label('current_value')
    ).outerjoin(
        UnitConfig,
        (UnitConfig.device_name == DeviceConfig.device_name) & 
        (UnitConfig.command_id == DeviceConfig.command_id) & 
        (UnitConfig.mega_id == unit.mega_id)
    ).where(
        DeviceConfig.device_name == unit.device_name,  # Filter by unit's device type
        DeviceConfig.config_type == 'Setting'
    ).order_by(
        DeviceConfig.device_name.nullslast(),      # Full hierarchy: DeviceName -> ConfigType -> CategoryTypeDesc -> Category -> Profile -> CommandName
        DeviceConfig.config_type.nullslast(),
        DeviceConfig.category_type_desc.nullslast(),
        DeviceConfig.category.nullslast(),
        DeviceConfig.profile.nullslast(),
        DeviceConfig.command_id.nullslast(),
        DeviceConfig.command_name
    )
    
    result = await db.execute(query)
    rows = result.all()
    
    # Ensure current_value is always a string (handle case where it might be parsed as JSON)
    def normalize_current_value(value):
        if value is None:
            return None
        if isinstance(value, (dict, list)):
            # If it's already parsed as JSON, convert back to string
            import json
            return json.dumps(value)
        return str(value)
    
    # Extract description from first parameter's first SubDetail
    def get_description(parameters_json):
        if parameters_json and isinstance(parameters_json, list) and len(parameters_json) > 0:
            param = parameters_json[0]
            sub_details = param.get('SubDetails', [])
            if sub_details and len(sub_details) > 0:
                return sub_details[0].get('Description')
        return None
    
    return [
        UnitConfigResponse(
            id=config.id,
            device_name=config.device_name,
            command_name=config.command_name,
            category_type_desc=config.category_type_desc,
            category=config.category,
            profile=config.profile,
            command_seprator=config.command_seprator,
            command_syntax=config.command_syntax,
            command_type=config.command_type,
            command_id=config.command_id,
            command_parameters_json=config.command_parameters_json,
            parameters_json=config.parameters_json,
            current_value=normalize_current_value(current_value),
            description=config.description or get_description(config.parameters_json)
        )
        for config, current_value in rows
    ]


@router.get("/{imei}/commands", response_model=list[UnitConfigResponse])
async def get_unit_commands(imei: str, db: AsyncSession = Depends(get_db)):
    """Get all commands for a unit (returns all commands for device type)"""
    
    # Get unit first
    result = await db.execute(select(Unit).where(Unit.imei == imei))
    unit = result.scalar_one_or_none()
    
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    # Get ALL commands for this device type (similar to settings endpoint)
    # Commands don't typically have saved values, so we return all available commands
    query = select(DeviceConfig).where(
        DeviceConfig.device_name == unit.device_name,
        DeviceConfig.config_type == 'Command'
    ).order_by(
        DeviceConfig.device_name.nullslast(),      # Full hierarchy: DeviceName -> ConfigType -> CategoryTypeDesc -> Category -> Profile -> CommandName
        DeviceConfig.config_type.nullslast(),
        DeviceConfig.category_type_desc.nullslast(),
        DeviceConfig.category.nullslast(),
        DeviceConfig.profile.nullslast(),
        DeviceConfig.command_id.nullslast(),
        DeviceConfig.command_name
    )
    
    result = await db.execute(query)
    configs = result.scalars().all()
    
    return [
        UnitConfigResponse(
            id=config.id,
            device_name=config.device_name,
            command_name=config.command_name,
            category_type_desc=config.category_type_desc,
            category=config.category,
            profile=config.profile,
            command_seprator=config.command_seprator,
            command_syntax=config.command_syntax,
            command_type=config.command_type,
            command_id=config.command_id,
            command_parameters_json=config.command_parameters_json,
            parameters_json=config.parameters_json,
            current_value=None,  # Commands don't typically have saved values
            description=config.description
        )
        for config in configs
    ]


@router.put("/{imei}/values")
async def save_unit_configs(
    imei: str,
    request: SaveValuesRequest,
    db: AsyncSession = Depends(get_db)
):
    """Save multiple configuration values for a unit"""
    
    # Verify unit exists
    result = await db.execute(select(Unit).where(Unit.imei == imei))
    unit = result.scalar_one_or_none()
    
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    saved_count = 0
    
    for item in request.values:
        # Check if value exists - use (mega_id, device_name, command_id)
        result = await db.execute(
            select(UnitConfig).where(
                UnitConfig.mega_id == unit.mega_id,
                UnitConfig.device_name == unit.device_name,
                UnitConfig.command_id == item.command_id
            )
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            existing.value = item.value
            existing.modified_by = request.user_id or item.user_id
        else:
            new_value = UnitConfig(
                mega_id=unit.mega_id,
                device_name=unit.device_name,  # Get device_name from unit
                command_id=item.command_id,
                value=item.value,
                modified_by=request.user_id or item.user_id
            )
            db.add(new_value)
        
        saved_count += 1
    
    await db.commit()
    
    return {"success": True, "saved_count": saved_count}


@router.post("/", response_model=UnitResponse)
async def create_unit(unit: UnitCreate, db: AsyncSession = Depends(get_db)):
    """Create a new unit"""
    
    # Check if IMEI already exists
    result = await db.execute(select(Unit).where(Unit.imei == unit.imei))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Unit with this IMEI already exists")
    
    db_unit = Unit(**unit.model_dump())
    db.add(db_unit)
    await db.commit()
    await db.refresh(db_unit)
    
    return db_unit


@router.put("/{imei}", response_model=UnitResponse)
async def update_unit(
    imei: str,
    unit: UnitUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update a unit"""
    
    result = await db.execute(select(Unit).where(Unit.imei == imei))
    db_unit = result.scalar_one_or_none()
    
    if not db_unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    update_data = unit.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_unit, key, value)
    
    await db.commit()
    await db.refresh(db_unit)
    
    return db_unit


@router.delete("/{imei}")
async def delete_unit(imei: str, db: AsyncSession = Depends(get_db)):
    """Soft delete a unit"""
    
    result = await db.execute(select(Unit).where(Unit.imei == imei))
    db_unit = result.scalar_one_or_none()
    
    if not db_unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    # Hard delete - unit table doesn't have is_active
    await db.delete(db_unit)
    await db.commit()
    
    return {"success": True, "message": "Unit deleted"}


@router.post("/copy-config", response_model=CopyUnitConfigResponse)
async def copy_unit_config(
    request: CopyUnitConfigRequest,
    db: AsyncSession = Depends(get_db)
):
    """Copy configuration from source unit to target unit(s)"""
    
    # Get source unit
    result = await db.execute(select(Unit).where(Unit.imei == request.source_imei))
    source_unit = result.scalar_one_or_none()
    
    if not source_unit:
        raise HTTPException(status_code=404, detail=f"Source unit {request.source_imei} not found")
    
    # Get source Unit Configs - use mega_id (not imei or unit_id)
    result = await db.execute(
        select(UnitConfig).where(UnitConfig.mega_id == source_unit.mega_id)
    )
    source_values = result.scalars().all()
    
    if not source_values:
        return CopyUnitConfigResponse(
            success=False,
            message="Source unit has no configuration values to copy"
        )
    
    # Get source device configs to map command_id -> config
    source_command_ids = {uv.command_id for uv in source_values}
    result = await db.execute(
        select(DeviceConfig).where(DeviceConfig.command_id.in_(source_command_ids))
    )
    source_configs = {config.command_id: config for config in result.scalars().all()}
    
    total_configs = len(source_values)
    copied_configs = 0
    skipped_configs = 0
    commands_sent = 0
    errors = {}
    
    # Process each target unit
    for target_imei in request.target_imeis:
        try:
            # Get target unit
            result = await db.execute(select(Unit).where(Unit.imei == target_imei))
            target_unit = result.scalar_one_or_none()
            
            if not target_unit:
                errors[target_imei] = "Unit not found"
                continue
            
            # IMPORTANT: Validate same device type
            if target_unit.device_name != source_unit.device_name:
                errors[target_imei] = f"Device type mismatch: source is '{source_unit.device_name}', target is '{target_unit.device_name}'"
                continue
            
            # Get target device configs - match by command_id only (not device_name)
            # Relationship: unit_config.command_id ↔ device_config.command_id
            result = await db.execute(
                select(DeviceConfig).where(
                    DeviceConfig.command_id.in_(source_command_ids)
                )
            )
            target_configs = {config.command_id: config for config in result.scalars().all()}
            
            # Map source command_ids to target command_ids (same command_id = same setting across devices)
            # If source and target have same device_name, command_ids should match directly
            # If different devices, match by command_id (same command = same setting)
            command_map = {}
            for source_command_id, source_config in source_configs.items():
                # Try to match by command_id first (same command = same setting)
                if source_command_id in target_configs:
                    target_command_id = source_command_id
                    command_map[source_command_id] = target_command_id
                # If no match, try matching by command_name + category_type_desc + category + profile
                else:
                    target_command_id = None
                    for target_config in target_configs.values():
                        if (target_config.command_name == source_config.command_name and
                            target_config.category_type_desc == source_config.category_type_desc and
                            target_config.category == source_config.category and
                            target_config.profile == source_config.profile and
                            target_config.config_type == source_config.config_type):
                            target_command_id = target_config.command_id
                            break
                    
                    if target_command_id:
                        command_map[source_command_id] = target_command_id
            
            # Copy values
            target_values_to_save = []
            for source_value in source_values:
                if source_value.command_id in command_map:
                    target_command_id = command_map[source_value.command_id]
                    
                    # Check if value already exists - use (mega_id, device_name, command_id)
                    result = await db.execute(
                        select(UnitConfig).where(
                            UnitConfig.mega_id == target_unit.mega_id,
                            UnitConfig.device_name == target_unit.device_name,
                            UnitConfig.command_id == target_command_id
                        )
                    )
                    existing = result.scalar_one_or_none()
                    
                    if existing:
                        existing.value = source_value.value
                        existing.modified_by = request.user_id
                    else:
                        new_value = UnitConfig(
                            mega_id=target_unit.mega_id,
                            device_name=target_unit.device_name,  # Get device_name from target unit
                            command_id=target_command_id,
                            value=source_value.value,
                            modified_by=request.user_id
                        )
                        db.add(new_value)
                    
                    target_values_to_save.append((target_command_id, source_value.value))
                    copied_configs += 1
                else:
                    skipped_configs += 1
            
            # Send commands if requested
            if request.send_commands and target_values_to_save:
                for command_id, value in target_values_to_save:
                    config = target_configs.get(command_id)
                    if config:
                        try:
                            # Build command using new format (command_separator + command_parameters_json)
                            command_text = build_command_text(config, value, target_unit)
                            
                            outbox_cmd = CommandOutbox(
                                imei=target_imei,
                                sim_no=target_unit.sim_no,
                                command_text=command_text,
                                config_id=config.id,  # Use config.id (device_config.id)
                                user_id=request.user_id,
                                send_method=request.send_method
                            )
                            db.add(outbox_cmd)
                            commands_sent += 1
                        except (ValueError, Exception) as e:
                            # Skip if command can't be built
                            errors[target_imei] = f"Failed to build command for command_id {command_id}: {str(e)}"
                            continue
            
        except Exception as e:
            errors[target_imei] = str(e)
    
    await db.commit()
    
    success = copied_configs > 0
    message = (
        f"Copied {copied_configs} configuration(s) to {len(request.target_imeis)} unit(s). "
        f"Skipped {skipped_configs} incompatible config(s)."
    )
    if request.send_commands:
        message += f" Sent {commands_sent} command(s)."
    
    return CopyUnitConfigResponse(
        success=success,
        message=message,
        total_configs=total_configs,
        copied_configs=copied_configs,
        skipped_configs=skipped_configs,
        commands_sent=commands_sent,
        errors=errors
    )

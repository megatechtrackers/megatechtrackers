"""Device Configuration API Routes"""
import csv
import io
import json
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, distinct, update, delete
from typing import Optional
from app.database import get_db
from app.models import DeviceConfig
from app.schemas.device import DeviceConfigResponse, DeviceConfigCreate, DeviceListResponse

router = APIRouter()


@router.get("/", response_model=list[DeviceListResponse])
async def get_device_types(db: AsyncSession = Depends(get_db)):
    """Get list of all device configs with counts"""
    
    query = select(
        DeviceConfig.device_name,
        func.count(DeviceConfig.id).label('config_count'),
        func.count(DeviceConfig.id).filter(DeviceConfig.config_type == 'Setting').label('setting_count'),
        func.count(DeviceConfig.id).filter(DeviceConfig.config_type == 'Command').label('command_count')
    ).group_by(
        DeviceConfig.device_name
    ).order_by(
        DeviceConfig.device_name
    )
    
    result = await db.execute(query)
    rows = result.all()
    
    return [
        DeviceListResponse(
            device_name=row.device_name,
            config_count=row.config_count,
            setting_count=row.setting_count,
            command_count=row.command_count
        )
        for row in rows
    ]


@router.get("/{device_name}/configs", response_model=list[DeviceConfigResponse])
async def get_device_configs(
    device_name: str,
    config_type: Optional[str] = Query(None, description="Filter by 'Setting' or 'Command'"),
    category: Optional[str] = Query(None, description="Filter by category"),
    db: AsyncSession = Depends(get_db)
):
    """Get all configurations for a device"""
    
    query = select(DeviceConfig).where(
        DeviceConfig.device_name == device_name
    )
    
    if config_type:
        query = query.where(DeviceConfig.config_type == config_type)
    
    if category:
        query = query.where(DeviceConfig.category == category)
    
    # Order by full hierarchy: DeviceName -> ConfigType -> CategoryTypeDesc -> Category -> Profile -> CommandID -> CommandName
    # CommandID is used for sorting to maintain parameter order
    query = query.order_by(
        DeviceConfig.device_name.nullslast(),
        DeviceConfig.config_type.nullslast(),
        DeviceConfig.category_type_desc.nullslast(),
        DeviceConfig.category.nullslast(),
        DeviceConfig.profile.nullslast(),
        DeviceConfig.command_id.nullslast(),
        DeviceConfig.command_name
    )
    
    result = await db.execute(query)
    configs = result.scalars().all()
    
    return configs


@router.get("/{device_name}/categories")
async def get_device_categories(
    device_name: str,
    db: AsyncSession = Depends(get_db)
):
    """Get list of categories for a device"""
    
    query = select(
        distinct(DeviceConfig.category)
    ).where(
        DeviceConfig.device_name == device_name,
        DeviceConfig.category.isnot(None)
    ).order_by(DeviceConfig.category)
    
    result = await db.execute(query)
    categories = [row[0] for row in result.all()]
    
    return {"categories": categories}


@router.post("/", response_model=DeviceConfigResponse)
async def create_device_config(
    config: DeviceConfigCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new device configuration"""
    
    db_config = DeviceConfig(**config.model_dump())
    db.add(db_config)
    await db.commit()
    await db.refresh(db_config)
    
    return db_config


@router.put("/{config_id}", response_model=DeviceConfigResponse)
async def update_device_config(
    config_id: int,
    config: DeviceConfigCreate,
    db: AsyncSession = Depends(get_db)
):
    """Update a device configuration"""
    
    result = await db.execute(
        select(DeviceConfig).where(DeviceConfig.id == config_id)
    )
    db_config = result.scalar_one_or_none()
    
    if not db_config:
        raise HTTPException(status_code=404, detail="Config not found")
    
    for key, value in config.model_dump().items():
        setattr(db_config, key, value)
    
    await db.commit()
    await db.refresh(db_config)
    
    return db_config


@router.delete("/{config_id}")
async def delete_device_config(
    config_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Delete a device configuration"""
    
    result = await db.execute(
        select(DeviceConfig).where(DeviceConfig.id == config_id)
    )
    db_config = result.scalar_one_or_none()
    
    if not db_config:
        raise HTTPException(status_code=404, detail="Config not found")
    
    await db.delete(db_config)
    await db.commit()
    
    return {"success": True, "message": "Config deleted"}


@router.get("/metadata/control-types")
async def get_control_types():
    """Get list of available control types for device config editor.
    These match the actual control names stored in the database (from CommandSubDetail.Control)"""
    return {
        "control_types": [
            {"value": "TextBox", "label": "Text Box"},
            {"value": "ComboBox", "label": "Dropdown (Select)"},
            {"value": "NumericUpDown", "label": "Numeric Input"},
            {"value": "ScheduleControl", "label": "Schedule Control"},
            {"value": "ZoneControl", "label": "Zone Control"},
            {"value": "OperatorControl", "label": "Operator Control"},
            {"value": "ATFenceControl", "label": "AT Fence Control"},
            {"value": "Command", "label": "Direct Command (Read-Only)"},
        ],
        "config_types": [
            {"value": "Setting", "label": "Setting"},
            {"value": "Command", "label": "Command"},
        ]
    }


@router.get("/metadata/device-names")
async def get_device_names(db: AsyncSession = Depends(get_db)):
    """Get list of unique device names"""
    query = select(distinct(DeviceConfig.device_name)).order_by(DeviceConfig.device_name)
    
    result = await db.execute(query)
    device_names = [row[0] for row in result.all()]
    
    return {"device_names": device_names}


@router.post("/bulk", response_model=list[DeviceConfigResponse])
async def create_bulk_device_configs(
    configs: list[DeviceConfigCreate],
    db: AsyncSession = Depends(get_db)
):
    """Create multiple device configurations at once"""
    
    db_configs = []
    for config in configs:
        db_config = DeviceConfig(**config.model_dump())
        db.add(db_config)
        db_configs.append(db_config)
    
    await db.commit()
    
    for db_config in db_configs:
        await db.refresh(db_config)
    
    return db_configs


# ==================== DEVICE MANAGEMENT ====================

@router.put("/device/{old_device_name}/rename")
async def rename_device(
    old_device_name: str,
    new_device_name: str = Query(..., description="New device name"),
    db: AsyncSession = Depends(get_db)
):
    """Rename a device (updates all configs with the old device name)"""
    
    # Check if old device exists
    result = await db.execute(
        select(func.count(DeviceConfig.id)).where(DeviceConfig.device_name == old_device_name)
    )
    count = result.scalar()
    
    if count == 0:
        raise HTTPException(status_code=404, detail=f"Device '{old_device_name}' not found")
    
    # Check if new name already exists
    result = await db.execute(
        select(func.count(DeviceConfig.id)).where(DeviceConfig.device_name == new_device_name)
    )
    existing_count = result.scalar()
    
    if existing_count > 0:
        raise HTTPException(status_code=400, detail=f"Device '{new_device_name}' already exists")
    
    # Update all configs
    await db.execute(
        update(DeviceConfig).where(DeviceConfig.device_name == old_device_name).values(device_name=new_device_name)
    )
    await db.commit()
    
    return {"success": True, "message": f"Renamed device from '{old_device_name}' to '{new_device_name}'", "configs_updated": count}


@router.delete("/device/{device_name}")
async def delete_device(
    device_name: str,
    db: AsyncSession = Depends(get_db)
):
    """Delete a device and all its configurations"""
    
    # Check if device exists
    result = await db.execute(
        select(func.count(DeviceConfig.id)).where(DeviceConfig.device_name == device_name)
    )
    count = result.scalar()
    
    if count == 0:
        raise HTTPException(status_code=404, detail=f"Device '{device_name}' not found")
    
    # Delete all configs
    await db.execute(
        delete(DeviceConfig).where(DeviceConfig.device_name == device_name)
    )
    await db.commit()
    
    return {"success": True, "message": f"Deleted device '{device_name}' with {count} configurations"}


@router.post("/device/{device_name}/duplicate")
async def duplicate_device(
    device_name: str,
    new_device_name: str = Query(..., description="Name for the duplicated device"),
    db: AsyncSession = Depends(get_db)
):
    """Duplicate a device with all its configurations"""
    
    # Check if source device exists
    result = await db.execute(
        select(DeviceConfig).where(DeviceConfig.device_name == device_name)
    )
    source_configs = result.scalars().all()
    
    if not source_configs:
        raise HTTPException(status_code=404, detail=f"Device '{device_name}' not found")
    
    # Check if new name already exists
    result = await db.execute(
        select(func.count(DeviceConfig.id)).where(DeviceConfig.device_name == new_device_name)
    )
    existing_count = result.scalar()
    
    if existing_count > 0:
        raise HTTPException(status_code=400, detail=f"Device '{new_device_name}' already exists")
    
    # Duplicate all configs
    new_configs = []
    for config in source_configs:
        new_config = DeviceConfig(
            device_name=new_device_name,
            config_type=config.config_type,
            category_type_desc=config.category_type_desc,
            category=config.category,
            profile=config.profile,
            command_name=config.command_name,
            description=config.description,
            command_seprator=config.command_seprator,
            command_syntax=config.command_syntax,
            command_type=config.command_type,
            command_parameters_json=config.command_parameters_json,
            parameters_json=config.parameters_json,
            command_id=None,  # Don't copy command_id - it's unique per original
        )
        db.add(new_config)
        new_configs.append(new_config)
    
    await db.commit()
    
    return {"success": True, "message": f"Duplicated device '{device_name}' to '{new_device_name}'", "configs_created": len(new_configs)}


# ==================== IMPORT/EXPORT ====================

@router.get("/export/csv")
async def export_configs_csv(
    device_name: Optional[str] = Query(None, description="Filter by device name"),
    db: AsyncSession = Depends(get_db)
):
    """Export device configurations to CSV"""
    
    query = select(DeviceConfig)
    if device_name:
        query = query.where(DeviceConfig.device_name == device_name)
    query = query.order_by(DeviceConfig.device_name, DeviceConfig.config_type, DeviceConfig.category, DeviceConfig.command_name)
    
    result = await db.execute(query)
    configs = result.scalars().all()
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow([
        'device_name', 'config_type', 'category_type_desc', 'category', 'profile',
        'command_name', 'description', 'command_seprator', 'command_syntax', 'command_type',
        'command_parameters_json', 'parameters_json', 'command_id'
    ])
    
    # Data
    for config in configs:
        writer.writerow([
            config.device_name,
            config.config_type,
            config.category_type_desc or '',
            config.category or '',
            config.profile or '',
            config.command_name,
            config.description or '',
            config.command_seprator or '',
            config.command_syntax or '',
            config.command_type or '',
            json.dumps(config.command_parameters_json) if config.command_parameters_json else '',
            json.dumps(config.parameters_json) if config.parameters_json else '',
            config.command_id or '',
        ])
    
    output.seek(0)
    
    filename = f"device_configs_{device_name or 'all'}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.post("/import/csv")
async def import_configs_csv(
    file: UploadFile = File(...),
    update_existing: bool = Query(False, description="Update existing configs if command_id matches"),
    db: AsyncSession = Depends(get_db)
):
    """Import device configurations from CSV
    
    CSV columns: device_name, config_type, category_type_desc, category, profile,
                 command_name, description, command_seprator, command_syntax, command_type,
                 command_parameters_json, parameters_json, command_id
    
    If update_existing=True and command_id is provided, updates existing config.
    Otherwise creates new configs.
    """
    
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")
    
    content = await file.read()
    content_str = content.decode('utf-8')
    reader = csv.DictReader(io.StringIO(content_str))
    
    created = 0
    updated = 0
    errors = []
    
    for row_num, row in enumerate(reader, start=2):  # Start at 2 (header is row 1)
        try:
            # Parse JSON fields
            command_params = None
            params = None
            if row.get('command_parameters_json'):
                try:
                    command_params = json.loads(row['command_parameters_json'])
                except json.JSONDecodeError:
                    errors.append(f"Row {row_num}: Invalid JSON in command_parameters_json")
                    continue
            
            if row.get('parameters_json'):
                try:
                    params = json.loads(row['parameters_json'])
                except json.JSONDecodeError:
                    errors.append(f"Row {row_num}: Invalid JSON in parameters_json")
                    continue
            
            # Check for required fields
            if not row.get('device_name') or not row.get('config_type') or not row.get('command_name'):
                errors.append(f"Row {row_num}: Missing required fields (device_name, config_type, command_name)")
                continue
            
            # Check if updating existing
            command_id = int(row['command_id']) if row.get('command_id') else None
            existing_config = None
            
            if update_existing and command_id:
                result = await db.execute(
                    select(DeviceConfig).where(DeviceConfig.command_id == command_id)
                )
                existing_config = result.scalar_one_or_none()
            
            if existing_config:
                # Update existing
                existing_config.device_name = row['device_name']
                existing_config.config_type = row['config_type']
                existing_config.category_type_desc = row.get('category_type_desc') or None
                existing_config.category = row.get('category') or None
                existing_config.profile = row.get('profile') or None
                existing_config.command_name = row['command_name']
                existing_config.description = row.get('description') or None
                existing_config.command_seprator = row.get('command_seprator') or None
                existing_config.command_syntax = row.get('command_syntax') or None
                existing_config.command_type = row.get('command_type') or None
                existing_config.command_parameters_json = command_params
                existing_config.parameters_json = params
                updated += 1
            else:
                # Create new
                new_config = DeviceConfig(
                    device_name=row['device_name'],
                    config_type=row['config_type'],
                    category_type_desc=row.get('category_type_desc') or None,
                    category=row.get('category') or None,
                    profile=row.get('profile') or None,
                    command_name=row['command_name'],
                    description=row.get('description') or None,
                    command_seprator=row.get('command_seprator') or None,
                    command_syntax=row.get('command_syntax') or None,
                    command_type=row.get('command_type') or None,
                    command_parameters_json=command_params,
                    parameters_json=params,
                    command_id=command_id,
                )
                db.add(new_config)
                created += 1
                
        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")
    
    await db.commit()
    
    return {
        "success": True,
        "created": created,
        "updated": updated,
        "errors": errors[:20] if errors else [],  # Limit errors to first 20
        "total_errors": len(errors)
    }

"""
IO Mapping API Routes
Provides CRUD operations for device IO templates and tracker-specific IO mappings
"""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List, Optional
import csv
import io

from app.database import get_db
from app.models import DeviceIOMapping, UnitIOMapping, DeviceConfig, Unit
from app.schemas.io_mapping import (
    DeviceIOMappingCreate,
    DeviceIOMappingUpdate,
    DeviceIOMappingResponse,
    DeviceIOMappingBulkCreate,
    UnitIOMappingCreate,
    UnitIOMappingUpdate,
    UnitIOMappingResponse,
    UnitIOMappingBulkCreate,
    ApplyTemplateRequest,
    ApplyTemplateResponse
)
from app.utils.metrics import record_io_mapping_operation

router = APIRouter()


# =============================================================================
# Device IO Mapping Templates
# =============================================================================

@router.get("/device-templates", response_model=List[DeviceIOMappingResponse], tags=["Device IO Templates"])
async def list_device_templates(
    device_name: Optional[str] = Query(None, description="Filter by device name"),
    db: AsyncSession = Depends(get_db)
):
    """List all device IO mapping templates, optionally filtered by device name"""
    query = select(DeviceIOMapping)
    if device_name:
        query = query.where(DeviceIOMapping.device_name == device_name)
    query = query.order_by(DeviceIOMapping.device_name, DeviceIOMapping.io_id)
    
    result = await db.execute(query)
    mappings = result.scalars().all()
    return mappings


@router.get("/device-templates/devices", response_model=List[str], tags=["Device IO Templates"])
async def list_devices_with_templates(db: AsyncSession = Depends(get_db)):
    """List all device types that have IO templates"""
    query = select(DeviceIOMapping.device_name).distinct().order_by(DeviceIOMapping.device_name)
    result = await db.execute(query)
    devices = result.scalars().all()
    return devices


@router.get("/device-templates/{template_id}", response_model=DeviceIOMappingResponse, tags=["Device IO Templates"])
async def get_device_template(template_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific device IO mapping template"""
    result = await db.execute(
        select(DeviceIOMapping).where(DeviceIOMapping.id == template_id)
    )
    mapping = result.scalar_one_or_none()
    if not mapping:
        raise HTTPException(status_code=404, detail="Device IO template not found")
    return mapping


@router.post("/device-templates", response_model=DeviceIOMappingResponse, tags=["Device IO Templates"])
async def create_device_template(
    mapping: DeviceIOMappingCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new device IO mapping template"""
    # Verify device exists
    device_result = await db.execute(
        select(DeviceConfig).where(DeviceConfig.device_name == mapping.device_name)
    )
    if not device_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Device '{mapping.device_name}' not found")
    
    db_mapping = DeviceIOMapping(**mapping.model_dump())
    db.add(db_mapping)
    await db.commit()
    await db.refresh(db_mapping)
    
    record_io_mapping_operation('create', 'device')
    return db_mapping


@router.post("/device-templates/bulk", response_model=List[DeviceIOMappingResponse], tags=["Device IO Templates"])
async def bulk_create_device_templates(
    request: DeviceIOMappingBulkCreate,
    db: AsyncSession = Depends(get_db)
):
    """Bulk create device IO mapping templates for a device type"""
    # Verify device exists
    device_result = await db.execute(
        select(DeviceConfig).where(DeviceConfig.device_name == request.device_name)
    )
    if not device_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Device '{request.device_name}' not found")
    
    created_mappings = []
    for mapping_data in request.mappings:
        db_mapping = DeviceIOMapping(
            device_name=request.device_name,
            **mapping_data.model_dump()
        )
        db.add(db_mapping)
        created_mappings.append(db_mapping)
    
    await db.commit()
    for m in created_mappings:
        await db.refresh(m)
    
    record_io_mapping_operation('bulk_create', 'device')
    return created_mappings


@router.put("/device-templates/{template_id}", response_model=DeviceIOMappingResponse, tags=["Device IO Templates"])
async def update_device_template(
    template_id: int,
    updates: DeviceIOMappingUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update a device IO mapping template"""
    result = await db.execute(
        select(DeviceIOMapping).where(DeviceIOMapping.id == template_id)
    )
    mapping = result.scalar_one_or_none()
    if not mapping:
        raise HTTPException(status_code=404, detail="Device IO template not found")
    
    update_data = updates.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(mapping, field, value)
    
    await db.commit()
    await db.refresh(mapping)
    
    record_io_mapping_operation('update', 'device')
    return mapping


@router.delete("/device-templates/{template_id}", tags=["Device IO Templates"])
async def delete_device_template(template_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a device IO mapping template"""
    result = await db.execute(
        select(DeviceIOMapping).where(DeviceIOMapping.id == template_id)
    )
    mapping = result.scalar_one_or_none()
    if not mapping:
        raise HTTPException(status_code=404, detail="Device IO template not found")
    
    await db.delete(mapping)
    await db.commit()
    
    record_io_mapping_operation('delete', 'device')
    return {"status": "deleted", "id": template_id}


@router.delete("/device-templates/device/{device_name}", tags=["Device IO Templates"])
async def delete_device_templates_by_device(device_name: str, db: AsyncSession = Depends(get_db)):
    """Delete all IO templates for a device type"""
    result = await db.execute(
        delete(DeviceIOMapping).where(DeviceIOMapping.device_name == device_name)
    )
    await db.commit()
    
    record_io_mapping_operation('bulk_delete', 'device')
    return {"status": "deleted", "device_name": device_name, "count": result.rowcount}


# =============================================================================
# Device IO Template Import/Export
# =============================================================================

@router.get("/device-templates/export/csv", tags=["Device IO Templates"])
async def export_device_templates_csv(
    device_name: Optional[str] = Query(None, description="Filter by device name"),
    db: AsyncSession = Depends(get_db)
):
    """Export device IO templates to CSV"""
    query = select(DeviceIOMapping)
    if device_name:
        query = query.where(DeviceIOMapping.device_name == device_name)
    query = query.order_by(DeviceIOMapping.device_name, DeviceIOMapping.io_id)
    
    result = await db.execute(query)
    mappings = result.scalars().all()
    
    # Create CSV in memory
    output = io.StringIO()
    fieldnames = [
        'device_name', 'io_id', 'io_multiplier', 'io_type', 'io_name', 
        'value_name', 'value', 'target', 'column_name', 
        'start_time', 'end_time', 'is_alarm', 'is_sms', 'is_email', 'is_call'
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    
    for mapping in mappings:
        writer.writerow({
            'device_name': mapping.device_name,
            'io_id': mapping.io_id,
            'io_multiplier': mapping.io_multiplier,
            'io_type': mapping.io_type,
            'io_name': mapping.io_name,
            'value_name': mapping.value_name or '',
            'value': mapping.value if mapping.value is not None else '',
            'target': mapping.target,
            'column_name': mapping.column_name or '',
            'start_time': str(mapping.start_time) if mapping.start_time else '00:00:00',
            'end_time': str(mapping.end_time) if mapping.end_time else '23:59:59',
            'is_alarm': mapping.is_alarm or 0,
            'is_sms': mapping.is_sms or 0,
            'is_email': mapping.is_email or 0,
            'is_call': mapping.is_call or 0
        })
    
    output.seek(0)
    filename = f"io_templates_{device_name or 'all'}.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.post("/device-templates/import/csv", tags=["Device IO Templates"])
async def import_device_templates_csv(
    file: UploadFile = File(...),
    device_name: str = Query(..., description="Target device name"),
    update_existing: bool = Query(False, description="Update existing templates by io_id+value"),
    db: AsyncSession = Depends(get_db)
):
    """Import device IO templates from CSV"""
    # Verify device exists
    device_result = await db.execute(
        select(DeviceConfig).where(DeviceConfig.device_name == device_name)
    )
    if not device_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Device '{device_name}' not found")
    
    # Read CSV content
    content = await file.read()
    try:
        text = content.decode('utf-8')
    except UnicodeDecodeError:
        text = content.decode('latin-1')
    
    reader = csv.DictReader(io.StringIO(text))
    
    created = 0
    updated = 0
    errors = []
    
    for row_num, row in enumerate(reader, start=2):
        try:
            io_id = int(row.get('io_id', 0))
            io_type = int(row.get('io_type', 2))
            io_name = row.get('io_name', '').strip()
            
            if not io_id or not io_name:
                errors.append(f"Row {row_num}: io_id and io_name are required")
                continue
            
            value = None
            if row.get('value') and row.get('value').strip():
                try:
                    value = float(row['value'])
                except ValueError:
                    value = None
            
            # Check if exists
            existing_result = await db.execute(
                select(DeviceIOMapping).where(
                    DeviceIOMapping.device_name == device_name,
                    DeviceIOMapping.io_id == io_id,
                    DeviceIOMapping.value == value if value is not None else DeviceIOMapping.value.is_(None)
                )
            )
            existing = existing_result.scalar_one_or_none()
            
            mapping_data = {
                'io_multiplier': float(row.get('io_multiplier', 1.0) or 1.0),
                'io_type': io_type,
                'io_name': io_name,
                'value_name': row.get('value_name', '').strip(),
                'value': value,
                'target': int(row.get('target', 0) or 0),
                'column_name': row.get('column_name', '').strip(),
                'is_alarm': int(row.get('is_alarm', 0) or 0),
                'is_sms': int(row.get('is_sms', 0) or 0),
                'is_email': int(row.get('is_email', 0) or 0),
                'is_call': int(row.get('is_call', 0) or 0)
            }
            
            if existing and update_existing:
                for key, val in mapping_data.items():
                    setattr(existing, key, val)
                updated += 1
            elif not existing:
                new_mapping = DeviceIOMapping(
                    device_name=device_name,
                    io_id=io_id,
                    **mapping_data
                )
                db.add(new_mapping)
                created += 1
            
        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")
    
    await db.commit()
    record_io_mapping_operation('import', 'device')
    
    return {
        "success": len(errors) == 0,
        "created": created,
        "updated": updated,
        "errors": errors[:20],  # Limit errors to 20
        "total_errors": len(errors)
    }


# =============================================================================
# Tracker IO Mappings
# =============================================================================

@router.get("/tracker", response_model=List[UnitIOMappingResponse], tags=["Tracker IO Mappings"])
async def list_tracker_mappings(
    imei: Optional[int] = Query(None, description="Filter by IMEI"),
    db: AsyncSession = Depends(get_db)
):
    """List all tracker IO mappings, optionally filtered by IMEI"""
    query = select(UnitIOMapping)
    if imei:
        query = query.where(UnitIOMapping.imei == imei)
    query = query.order_by(UnitIOMapping.imei, UnitIOMapping.io_id)
    
    result = await db.execute(query)
    mappings = result.scalars().all()
    return mappings


@router.get("/tracker/{imei}", response_model=List[UnitIOMappingResponse], tags=["Tracker IO Mappings"])
async def get_tracker_mappings(imei: int, db: AsyncSession = Depends(get_db)):
    """Get all IO mappings for a specific tracker"""
    result = await db.execute(
        select(UnitIOMapping).where(UnitIOMapping.imei == imei).order_by(UnitIOMapping.io_id)
    )
    mappings = result.scalars().all()
    return mappings


@router.get("/tracker/{imei}/{mapping_id}", response_model=UnitIOMappingResponse, tags=["Tracker IO Mappings"])
async def get_tracker_mapping(imei: int, mapping_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific IO mapping for a tracker"""
    result = await db.execute(
        select(UnitIOMapping).where(UnitIOMapping.id == mapping_id, UnitIOMapping.imei == imei)
    )
    mapping = result.scalar_one_or_none()
    if not mapping:
        raise HTTPException(status_code=404, detail="IO mapping not found")
    return mapping


@router.post("/tracker", response_model=UnitIOMappingResponse, tags=["Tracker IO Mappings"])
async def create_tracker_mapping(
    mapping: UnitIOMappingCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new IO mapping for a tracker"""
    # Verify tracker exists
    unit_result = await db.execute(
        select(Unit).where(Unit.imei == mapping.imei)
    )
    if not unit_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Tracker with IMEI {mapping.imei} not found")
    
    db_mapping = UnitIOMapping(**mapping.model_dump())
    db.add(db_mapping)
    await db.commit()
    await db.refresh(db_mapping)
    
    record_io_mapping_operation('create', 'tracker')
    return db_mapping


@router.post("/tracker/bulk", response_model=List[UnitIOMappingResponse], tags=["Tracker IO Mappings"])
async def bulk_create_tracker_mappings(
    request: UnitIOMappingBulkCreate,
    db: AsyncSession = Depends(get_db)
):
    """Bulk create IO mappings for a tracker"""
    # Verify tracker exists
    unit_result = await db.execute(
        select(Unit).where(Unit.imei == request.imei)
    )
    if not unit_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Tracker with IMEI {request.imei} not found")
    
    created_mappings = []
    for mapping_data in request.mappings:
        db_mapping = UnitIOMapping(
            imei=request.imei,
            **mapping_data.model_dump()
        )
        db.add(db_mapping)
        created_mappings.append(db_mapping)
    
    await db.commit()
    for m in created_mappings:
        await db.refresh(m)
    
    record_io_mapping_operation('bulk_create', 'tracker')
    return created_mappings


@router.put("/tracker/{imei}/{mapping_id}", response_model=UnitIOMappingResponse, tags=["Tracker IO Mappings"])
async def update_tracker_mapping(
    imei: int,
    mapping_id: int,
    updates: UnitIOMappingUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update an IO mapping for a tracker"""
    result = await db.execute(
        select(UnitIOMapping).where(UnitIOMapping.id == mapping_id, UnitIOMapping.imei == imei)
    )
    mapping = result.scalar_one_or_none()
    if not mapping:
        raise HTTPException(status_code=404, detail="IO mapping not found")
    
    update_data = updates.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(mapping, field, value)
    
    await db.commit()
    await db.refresh(mapping)
    
    record_io_mapping_operation('update', 'tracker')
    return mapping


@router.delete("/tracker/{imei}/{mapping_id}", tags=["Tracker IO Mappings"])
async def delete_tracker_mapping(imei: int, mapping_id: int, db: AsyncSession = Depends(get_db)):
    """Delete an IO mapping for a tracker"""
    result = await db.execute(
        select(UnitIOMapping).where(UnitIOMapping.id == mapping_id, UnitIOMapping.imei == imei)
    )
    mapping = result.scalar_one_or_none()
    if not mapping:
        raise HTTPException(status_code=404, detail="IO mapping not found")
    
    await db.delete(mapping)
    await db.commit()
    
    record_io_mapping_operation('delete', 'tracker')
    return {"status": "deleted", "id": mapping_id}


@router.delete("/tracker/{imei}", tags=["Tracker IO Mappings"])
async def delete_tracker_mappings(imei: int, db: AsyncSession = Depends(get_db)):
    """Delete all IO mappings for a tracker"""
    result = await db.execute(
        delete(UnitIOMapping).where(UnitIOMapping.imei == imei)
    )
    await db.commit()
    
    record_io_mapping_operation('bulk_delete', 'tracker')
    return {"status": "deleted", "imei": imei, "count": result.rowcount}


# =============================================================================
# Template Application
# =============================================================================

@router.post("/apply-template", response_model=ApplyTemplateResponse, tags=["Template Operations"])
async def apply_device_template(
    request: ApplyTemplateRequest,
    db: AsyncSession = Depends(get_db)
):
    """Apply device IO template to a tracker"""
    # Verify tracker exists
    unit_result = await db.execute(
        select(Unit).where(Unit.imei == request.imei)
    )
    if not unit_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Tracker with IMEI {request.imei} not found")
    
    # Get device templates
    template_result = await db.execute(
        select(DeviceIOMapping).where(DeviceIOMapping.device_name == request.device_name)
    )
    templates = template_result.scalars().all()
    
    if not templates:
        raise HTTPException(status_code=404, detail=f"No IO templates found for device '{request.device_name}'")
    
    # Get existing tracker mappings
    existing_result = await db.execute(
        select(UnitIOMapping).where(UnitIOMapping.imei == request.imei)
    )
    existing_mappings = {(m.io_id, m.value) for m in existing_result.scalars().all()}
    
    if request.overwrite:
        # Delete existing mappings
        await db.execute(delete(UnitIOMapping).where(UnitIOMapping.imei == request.imei))
        existing_mappings = set()
    
    # Apply templates
    created_count = 0
    skipped_count = 0
    
    for template in templates:
        key = (template.io_id, template.value)
        if key in existing_mappings:
            skipped_count += 1
            continue
        
        # Create new mapping from template
        new_mapping = UnitIOMapping(
            imei=request.imei,
            io_id=template.io_id,
            io_multiplier=template.io_multiplier,
            io_type=template.io_type,
            io_name=template.io_name,
            value_name=template.value_name,
            value=template.value,
            target=template.target,
            column_name=template.column_name,
            start_time=template.start_time,
            end_time=template.end_time,
            is_alarm=template.is_alarm,
            is_sms=template.is_sms,
            is_email=template.is_email,
            is_call=template.is_call
        )
        db.add(new_mapping)
        created_count += 1
    
    await db.commit()
    
    record_io_mapping_operation('apply_template', 'tracker')
    
    return ApplyTemplateResponse(
        imei=request.imei,
        device_name=request.device_name,
        mappings_created=created_count,
        mappings_skipped=skipped_count,
        message=f"Applied {created_count} mappings from {request.device_name} template"
    )


@router.post("/copy-tracker/{source_imei}/{target_imei}", response_model=ApplyTemplateResponse, tags=["Template Operations"])
async def copy_tracker_mappings(
    source_imei: int,
    target_imei: int,
    overwrite: bool = Query(default=False, description="Overwrite existing mappings"),
    db: AsyncSession = Depends(get_db)
):
    """Copy IO mappings from one tracker to another"""
    # Verify both trackers exist
    for imei in [source_imei, target_imei]:
        result = await db.execute(select(Unit).where(Unit.imei == imei))
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"Tracker with IMEI {imei} not found")
    
    # Get source mappings
    source_result = await db.execute(
        select(UnitIOMapping).where(UnitIOMapping.imei == source_imei)
    )
    source_mappings = source_result.scalars().all()
    
    if not source_mappings:
        raise HTTPException(status_code=404, detail=f"No IO mappings found for source tracker {source_imei}")
    
    # Get existing target mappings
    target_result = await db.execute(
        select(UnitIOMapping).where(UnitIOMapping.imei == target_imei)
    )
    existing_mappings = {(m.io_id, m.value) for m in target_result.scalars().all()}
    
    if overwrite:
        await db.execute(delete(UnitIOMapping).where(UnitIOMapping.imei == target_imei))
        existing_mappings = set()
    
    # Copy mappings
    created_count = 0
    skipped_count = 0
    
    for source in source_mappings:
        key = (source.io_id, source.value)
        if key in existing_mappings:
            skipped_count += 1
            continue
        
        new_mapping = UnitIOMapping(
            imei=target_imei,
            io_id=source.io_id,
            io_multiplier=source.io_multiplier,
            io_type=source.io_type,
            io_name=source.io_name,
            value_name=source.value_name,
            value=source.value,
            target=source.target,
            column_name=source.column_name,
            start_time=source.start_time,
            end_time=source.end_time,
            is_alarm=source.is_alarm,
            is_sms=source.is_sms,
            is_email=source.is_email,
            is_call=source.is_call
        )
        db.add(new_mapping)
        created_count += 1
    
    await db.commit()
    
    record_io_mapping_operation('copy_tracker', 'tracker')
    
    return ApplyTemplateResponse(
        imei=target_imei,
        device_name=f"tracker_{source_imei}",
        mappings_created=created_count,
        mappings_skipped=skipped_count,
        message=f"Copied {created_count} mappings from tracker {source_imei}"
    )


@router.post("/reset-to-device/{imei}", response_model=ApplyTemplateResponse, tags=["Template Operations"])
async def reset_to_device_defaults(
    imei: int,
    db: AsyncSession = Depends(get_db)
):
    """Reset tracker IO mappings to device defaults (deletes all custom mappings and applies device template)"""
    # Get tracker and its device type
    unit_result = await db.execute(
        select(Unit).where(Unit.imei == imei)
    )
    unit = unit_result.scalar_one_or_none()
    if not unit:
        raise HTTPException(status_code=404, detail=f"Tracker with IMEI {imei} not found")
    
    device_name = unit.device_name
    
    # Get device templates
    template_result = await db.execute(
        select(DeviceIOMapping).where(DeviceIOMapping.device_name == device_name)
    )
    templates = template_result.scalars().all()
    
    if not templates:
        raise HTTPException(status_code=404, detail=f"No IO templates found for device '{device_name}'")
    
    # Delete all existing mappings for this tracker
    delete_result = await db.execute(
        delete(UnitIOMapping).where(UnitIOMapping.imei == imei)
    )
    deleted_count = delete_result.rowcount
    
    # Apply all device templates
    created_count = 0
    for template in templates:
        new_mapping = UnitIOMapping(
            imei=imei,
            io_id=template.io_id,
            io_multiplier=template.io_multiplier,
            io_type=template.io_type,
            io_name=template.io_name,
            value_name=template.value_name,
            value=template.value,
            target=template.target,
            column_name=template.column_name,
            start_time=template.start_time,
            end_time=template.end_time,
            is_alarm=template.is_alarm,
            is_sms=template.is_sms,
            is_email=template.is_email,
            is_call=template.is_call
        )
        db.add(new_mapping)
        created_count += 1
    
    await db.commit()
    
    record_io_mapping_operation('reset_to_device', 'tracker')
    
    return ApplyTemplateResponse(
        imei=imei,
        device_name=device_name,
        mappings_created=created_count,
        mappings_skipped=deleted_count,  # Using skipped to report deleted count
        message=f"Reset to {device_name} defaults: deleted {deleted_count} custom mappings, applied {created_count} templates"
    )

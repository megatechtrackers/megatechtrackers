"""
Location References (POI) API Routes
Provides CRUD operations for location references
"""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func, text
from typing import List, Optional
import csv
import io

from app.database import get_db
from app.models import LocationReference
from app.schemas.location_reference import (
    LocationReferenceCreate,
    LocationReferenceUpdate,
    LocationReferenceResponse,
    LocationReferenceBulkCreate,
    NearestLocationReferenceResponse
)

router = APIRouter()


@router.get("/", response_model=List[LocationReferenceResponse])
async def list_location_references(
    search: Optional[str] = Query(None, description="Search in location reference name"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    """List location references with optional search"""
    query = select(LocationReference)
    
    if search:
        query = query.where(LocationReference.reference.ilike(f"%{search}%"))
    
    query = query.order_by(LocationReference.id).offset(offset).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/count")
async def count_location_references(
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """Get total count of location references"""
    query = select(func.count(LocationReference.id))
    if search:
        query = query.where(LocationReference.reference.ilike(f"%{search}%"))
    
    result = await db.execute(query)
    return {"count": result.scalar()}


@router.get("/nearest", response_model=List[NearestLocationReferenceResponse])
async def get_nearest_location_reference(
    lat: float = Query(..., ge=-90, le=90, description="Latitude"),
    lng: float = Query(..., ge=-180, le=180, description="Longitude"),
    limit: int = Query(5, ge=1, le=50),
    max_distance_km: float = Query(100, ge=0, description="Max distance in km"),
    db: AsyncSession = Depends(get_db)
):
    """Find nearest location reference to given coordinates"""
    # Using PostGIS ST_Distance for accurate distance calculation
    # Note: This assumes geom column is populated
    query = text("""
        SELECT 
            id, latitude, longitude, reference,
            ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography) / 1000 as distance_km
        FROM location_reference
        WHERE ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
            :max_distance_m
        )
        ORDER BY distance_km
        LIMIT :limit
    """)
    
    result = await db.execute(query, {
        "lat": lat,
        "lng": lng,
        "max_distance_m": max_distance_km * 1000,
        "limit": limit
    })
    rows = result.fetchall()
    
    return [
        NearestLocationReferenceResponse(
            id=row.id,
            latitude=row.latitude,
            longitude=row.longitude,
            reference=row.reference,
            distance_km=round(row.distance_km, 3)
        )
        for row in rows
    ]


@router.get("/{reference_id}", response_model=LocationReferenceResponse)
async def get_location_reference(reference_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific location reference"""
    result = await db.execute(
        select(LocationReference).where(LocationReference.id == reference_id)
    )
    location_reference = result.scalar_one_or_none()
    if not location_reference:
        raise HTTPException(status_code=404, detail="Location reference not found")
    return location_reference


@router.post("/", response_model=LocationReferenceResponse)
async def create_location_reference(
    ref: LocationReferenceCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new location reference"""
    # Check if ID already exists
    if ref.id:
        existing = await db.execute(
            select(LocationReference).where(LocationReference.id == ref.id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"Location reference with ID {ref.id} already exists")
    
    db_ref = LocationReference(
        id=ref.id if ref.id else None,
        latitude=ref.latitude,
        longitude=ref.longitude,
        reference=ref.reference
    )
    db.add(db_ref)
    await db.commit()
    await db.refresh(db_ref)
    
    # Update geom column using PostGIS
    await db.execute(text("""
        UPDATE location_reference 
        SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
        WHERE id = :id
    """), {"id": db_ref.id})
    await db.commit()
    
    return db_ref


@router.post("/bulk", response_model=List[LocationReferenceResponse])
async def bulk_create_references(
    request: LocationReferenceBulkCreate,
    db: AsyncSession = Depends(get_db)
):
    """Bulk create location references"""
    created = []
    for ref in request.references:
        db_ref = LocationReference(
            id=ref.id if ref.id else None,
            latitude=ref.latitude,
            longitude=ref.longitude,
            reference=ref.reference
        )
        db.add(db_ref)
        created.append(db_ref)
    
    await db.commit()
    
    # Refresh all and update geom
    for ref in created:
        await db.refresh(ref)
    
    # Update geom for all new records
    await db.execute(text("""
        UPDATE location_reference 
        SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
        WHERE geom IS NULL
    """))
    await db.commit()
    
    return created


@router.put("/{reference_id}", response_model=LocationReferenceResponse)
async def update_location_reference(
    reference_id: int,
    updates: LocationReferenceUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update a location reference"""
    result = await db.execute(
        select(LocationReference).where(LocationReference.id == reference_id)
    )
    location_reference = result.scalar_one_or_none()
    if not location_reference:
        raise HTTPException(status_code=404, detail="Location reference not found")
    
    update_data = updates.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(location_reference, field, value)
    
    await db.commit()
    
    # Update geom if lat/lng changed
    if 'latitude' in update_data or 'longitude' in update_data:
        await db.execute(text("""
            UPDATE location_reference 
            SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
            WHERE id = :id
        """), {"id": reference_id})
        await db.commit()
    
    await db.refresh(location_reference)
    return location_reference


@router.delete("/{reference_id}")
async def delete_location_reference(reference_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a location reference"""
    result = await db.execute(
        select(LocationReference).where(LocationReference.id == reference_id)
    )
    location_reference = result.scalar_one_or_none()
    if not location_reference:
        raise HTTPException(status_code=404, detail="Location reference not found")
    
    await db.delete(location_reference)
    await db.commit()
    return {"status": "deleted", "id": reference_id}


@router.delete("/")
async def delete_all_location_references(
    confirm: bool = Query(False, description="Confirm deletion"),
    db: AsyncSession = Depends(get_db)
):
    """Delete all location references (requires confirmation)"""
    if not confirm:
        raise HTTPException(status_code=400, detail="Set confirm=true to delete all location references")
    
    result = await db.execute(delete(LocationReference))
    await db.commit()
    return {"status": "deleted", "count": result.rowcount}


# =============================================================================
# Import/Export
# =============================================================================

@router.get("/export/csv")
async def export_location_references_csv(db: AsyncSession = Depends(get_db)):
    """Export all location references to CSV"""
    result = await db.execute(select(LocationReference).order_by(LocationReference.id))
    location_references = result.scalars().all()
    
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=['id', 'latitude', 'longitude', 'reference'])
    writer.writeheader()
    
    for ref in location_references:
        writer.writerow({
            'id': ref.id,
            'latitude': ref.latitude,
            'longitude': ref.longitude,
            'reference': ref.reference
        })
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=location_references.csv"}
    )


@router.post("/import/csv")
async def import_location_references_csv(
    file: UploadFile = File(...),
    update_existing: bool = Query(False, description="Update existing by ID"),
    db: AsyncSession = Depends(get_db)
):
    """Import location references from CSV"""
    content = await file.read()
    try:
        text_content = content.decode('utf-8')
    except UnicodeDecodeError:
        text_content = content.decode('latin-1')
    
    reader = csv.DictReader(io.StringIO(text_content))
    
    created = 0
    updated = 0
    errors = []
    
    for row_num, row in enumerate(reader, start=2):
        try:
            ref_id = int(row.get('id')) if row.get('id') else None
            lat = float(row.get('latitude', 0))
            lng = float(row.get('longitude', 0))
            reference = row.get('reference', '').strip()
            
            if not reference:
                errors.append(f"Row {row_num}: reference name required")
                continue
            
            if ref_id and update_existing:
                existing = await db.execute(
                    select(LocationReference).where(LocationReference.id == ref_id)
                )
                existing_ref = existing.scalar_one_or_none()
                if existing_ref:
                    existing_ref.latitude = lat
                    existing_ref.longitude = lng
                    existing_ref.reference = reference
                    updated += 1
                    continue
            
            db_ref = LocationReference(
                id=ref_id,
                latitude=lat,
                longitude=lng,
                reference=reference
            )
            db.add(db_ref)
            created += 1
            
        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")
    
    await db.commit()
    
    # Update geom for all records
    await db.execute(text("""
        UPDATE location_reference 
        SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
        WHERE geom IS NULL OR latitude != ST_Y(geom) OR longitude != ST_X(geom)
    """))
    await db.commit()
    
    return {
        "success": len(errors) == 0,
        "created": created,
        "updated": updated,
        "errors": errors[:20],
        "total_errors": len(errors)
    }

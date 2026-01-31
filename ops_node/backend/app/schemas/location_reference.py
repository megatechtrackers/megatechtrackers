"""
Location References (POI) Schemas
"""
from pydantic import BaseModel, Field
from typing import Optional, List


class LocationReferenceBase(BaseModel):
    """Base schema for location references"""
    latitude: float = Field(..., ge=-90, le=90, description="Latitude in decimal degrees")
    longitude: float = Field(..., ge=-180, le=180, description="Longitude in decimal degrees")
    reference: str = Field(..., min_length=1, max_length=500, description="Location reference name/description")


class LocationReferenceCreate(LocationReferenceBase):
    """Schema for creating a location reference"""
    id: Optional[int] = Field(None, description="Optional custom ID")


class LocationReferenceUpdate(BaseModel):
    """Schema for updating a location reference"""
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    reference: Optional[str] = Field(None, min_length=1, max_length=500)


class LocationReferenceResponse(LocationReferenceBase):
    """Schema for location reference response"""
    id: int
    
    class Config:
        from_attributes = True


class LocationReferenceBulkCreate(BaseModel):
    """Schema for bulk creating location references"""
    references: List[LocationReferenceCreate]


class NearestLocationReferenceResponse(LocationReferenceResponse):
    """Response with distance for nearest search"""
    distance_km: float = Field(..., description="Distance in kilometers")

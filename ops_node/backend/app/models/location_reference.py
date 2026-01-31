"""
Location Reference Points (POI/landmarks) Model
"""
from sqlalchemy import Column, Integer, Float, Text
from app.database import Base


class LocationReference(Base):
    """Location reference points (POI/landmarks)"""
    __tablename__ = "location_reference"
    
    id = Column(Integer, primary_key=True, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    reference = Column(Text, nullable=False)
    # Note: geom column is managed by PostGIS trigger, not explicitly in model

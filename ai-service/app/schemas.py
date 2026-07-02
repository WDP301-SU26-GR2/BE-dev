from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, HttpUrl


class SegmentMode(str, Enum):
    MODEL = "MODEL"
    HEURISTIC = "HEURISTIC"


class RegionType(str, Enum):
    PANEL = "PANEL"
    SPEECH_BUBBLE = "SPEECH_BUBBLE"
    CHARACTER = "CHARACTER"


class BBox(BaseModel):
    x: float = Field(ge=0)
    y: float = Field(ge=0)
    width: float = Field(gt=0)
    height: float = Field(gt=0)


class SegmentRegion(BaseModel):
    type: RegionType
    subtype: Optional[str] = None
    bbox: BBox
    confidence: float = Field(ge=0, le=1)


class SegmentRequest(BaseModel):
    imageUrl: HttpUrl
    mode: SegmentMode = SegmentMode.MODEL


class SegmentResponse(BaseModel):
    modelVersion: str
    imageWidth: int = Field(gt=0)
    imageHeight: int = Field(gt=0)
    regions: list[SegmentRegion]

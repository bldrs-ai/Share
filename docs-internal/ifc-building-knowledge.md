# IFC Building Modeling Knowledge Base

Comprehensive reference for an AI agent that creates realistic building models in IFC format.

---

## 1. Building Architecture Fundamentals

### What Makes a Realistic Building

A building consists of these major systems, bottom to top:

1. **Foundation** -- Footings, base slabs, grade beams that transfer loads to the ground
2. **Structure** -- Columns, beams, load-bearing walls, floor slabs forming the skeleton
3. **Envelope** -- Exterior walls, roof, windows, doors that enclose the conditioned space
4. **Interior** -- Partition walls, interior doors, staircases, railings, spaces/rooms
5. **Services** -- MEP systems (not modeled geometrically by this agent)

### Standard Room Dimensions

#### Residential

| Room | Minimum Size | Comfortable Size |
|------|-------------|-----------------|
| Living room | 3600 x 4800 mm | 5400 x 7200 mm |
| Bedroom (single) | 2700 x 3000 mm (min 7 m2) | 3000 x 3600 mm |
| Bedroom (master) | 3000 x 3600 mm | 4200 x 4800 mm |
| Kitchen | 2500 x 3000 mm | 3000 x 4200 mm |
| Bathroom | 1500 x 2400 mm | 2400 x 3000 mm |
| Dining room | 3000 x 3600 mm | 3600 x 4200 mm |
| Hallway width | 900 mm min | 1200 mm comfortable |
| Entry clearance | 1200 x 1200 mm min | 1500 x 1500 mm |

#### Commercial

| Room | Typical Size |
|------|-------------|
| Office (single) | 3000 x 3600 mm |
| Open office per person | 6-8 m2 |
| Conference room (8 people) | 4200 x 6000 mm |
| Corridor width | 1500 mm min (1800 mm for accessibility) |

### Wall Construction Types and Thicknesses

| Wall Type | Typical Thickness | Notes |
|-----------|------------------|-------|
| Interior drywall partition | 100-150 mm | Single stud + 2 layers gypsum |
| Interior masonry | 100-200 mm | Single brick or block |
| Exterior cavity brick | 250-300 mm | Brick + cavity + brick |
| Exterior insulated | 200-350 mm | Structure + insulation + cladding |
| Load-bearing concrete | 200-300 mm | Reinforced concrete |
| Curtain wall | 100-150 mm | Aluminum frame + glass |
| Fire-rated partition | 150-250 mm | Enhanced drywall assembly |

### Floor-to-Floor Heights

| Building Type | Floor-to-Floor Height | Clear Ceiling Height |
|--------------|----------------------|---------------------|
| Residential | 2800-3200 mm | 2400-2700 mm |
| Commercial office | 3600-4200 mm | 2700-3000 mm |
| Retail | 4000-5000 mm | 3000-4000 mm |
| Industrial | 5000-8000 mm | 4000-7000 mm |

The minimum habitable ceiling height is 2400 mm (240 cm / 95 in).

### Window Placement Rules

| Parameter | Standard Value |
|-----------|---------------|
| Sill height (standard) | 750-900 mm from floor |
| Sill height (privacy, upper floors) | 1000-1100 mm from floor |
| Head height | 2100-2400 mm from floor |
| Window height (typical) | 1200-1500 mm |
| Window width (single) | 600-1200 mm |
| Window width (double/triple) | 1800-2500 mm |
| Egress window sill max height | 1118 mm (44 in) from floor |
| Distance from corner | min 600 mm from wall corner |
| Proportion guidance | Width:Height ratio typically 1:1.2 to 1:2 |

### Door Standard Sizes

| Door Type | Width | Height | Notes |
|-----------|-------|--------|-------|
| Interior single | 800-900 mm | 2100 mm | 80 cm min clearance |
| Entry/exterior single | 900-1000 mm | 2100 mm | 90 cm min for accessibility |
| Double door | 1600 mm (2 x 800) | 2100 mm | |
| Accessible door | 900 mm min clear | 2100 mm | Wheelchair passage |
| Bathroom/toilet | 600-750 mm | 2000 mm | |
| Garage door | 2500 mm | 2300 mm | |
| Commercial entry | 900-1100 mm | 2100-2400 mm | |
| Fire door | 900 mm | 2100 mm | Self-closing, rated |

### Staircase Geometry

| Parameter | Residential | Commercial/Public |
|-----------|------------|-------------------|
| Riser height (max) | 196 mm (7.75 in) | 178 mm (7 in) |
| Riser height (comfortable) | 170 mm | 150 mm |
| Tread depth (min) | 254 mm (10 in) | 279 mm (11 in) |
| Tread depth (comfortable) | 280 mm | 300 mm |
| Stair width (min) | 900 mm (36 in) | 1200 mm (47 in) |
| Headroom (min) | 2100 mm (83 in) | 2100 mm |
| Landing depth | 900 mm min (= stair width) | 1200 mm |
| Handrail height | 900-1000 mm | 900-1000 mm |
| Ideal pitch angle | 30-37 degrees | 30-35 degrees |
| Blondel formula | 2R + T = 600-640 mm | Classic comfort rule |

To calculate number of risers for a given floor-to-floor height:
- risers = floor_height / riser_height (rounded to integer)
- treads = risers - 1 (for a straight flight)
- stair run = treads x tread_depth

### Roof Types

| Roof Type | IfcRoofTypeEnum | Description |
|-----------|----------------|-------------|
| Flat | FLAT_ROOF | No slope, or slight pitch for drainage |
| Shed | SHED_ROOF | Single slope |
| Gable | GABLE_ROOF | Two slopes from central ridge, gable at each end |
| Hip | HIP_ROOF | Sloping ends and sides meeting at inclined angle |
| Hipped gable | HIPPED_GABLE_ROOF | Hipped end truncating a gable |
| Gambrel | GAMBREL_ROOF | Each side has shallower slope above steeper one |
| Mansard | MANSARD_ROOF | Each side has steeper lower part and shallower upper |
| Barrel | BARREL_ROOF | Semicylindrical form |
| Butterfly | BUTTERFLY_ROOF | Two slopes descending inward from eaves |
| Pavilion | PAVILION_ROOF | Pyramidal hip roof |
| Dome | DOME_ROOF | Hemispherical hip roof |
| Freeform | FREEFORM | Complex or non-regular shapes |

### Balcony Construction and Dimensions

| Parameter | Standard Value |
|-----------|---------------|
| Depth (typical) | 1500-2000 mm |
| Minimum usable depth | 1200 mm |
| Railing height (residential) | 1000-1100 mm (42 in code min) |
| Railing height (commercial) | 1070 mm (42 in) |
| Balusters max spacing | 100 mm (4 in sphere test) |
| Slab thickness | 150-200 mm |
| Drainage slope | 2% away from building |
| Load capacity | 20 lbs/linear foot lateral on railing |

---

## 2. IFC Entity Reference for Building Elements

### IFC4 Schema Overview

The IFC file uses ISO 10303-21 (STEP Physical File) format. Each entity instance is on a line starting with `#` followed by an integer ID.

#### File Structure

```
ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [DesignTransferView_V1]'),'2;1');
FILE_NAME('model.ifc','2024-01-01T00:00:00',('Author'),('Org'),'IfcOpenShell','App','None');
FILE_SCHEMA(('IFC4'));
ENDSEC;

DATA;
/* Entity instances here */
#1=IFCPROJECT('GlobalId',$,'Name',$,$,$,$,(#context),#units);
...
ENDSEC;

END-ISO-10303-21;
```

### Core Spatial Structure Entities

Every IFC model requires this hierarchy:

```
IfcProject
  └── IfcSite (via IfcRelAggregates)
       └── IfcBuilding (via IfcRelAggregates)
            ├── IfcBuildingStorey "Ground Floor" Elevation=0.0 (via IfcRelAggregates)
            ├── IfcBuildingStorey "First Floor" Elevation=3000.0 (via IfcRelAggregates)
            └── IfcBuildingStorey "Second Floor" Elevation=6000.0 (via IfcRelAggregates)
```

### IfcWall / IfcWallStandardCase

**Note:** `IfcWallStandardCase` is deprecated in IFC4x1+. Use `IfcWall` with `IfcMaterialLayerSetUsage` instead.

#### EXPRESS Definition

```
ENTITY IfcWall
  SUBTYPE OF (IfcBuildingElement);
    PredefinedType : OPTIONAL IfcWallTypeEnum;
END_ENTITY;
```

PredefinedType values: MOVABLE, PARAPET, PARTITIONING, PLUMBINGWALL, SHEAR, SOLIDWALL, STANDARD, POLYGONAL, ELEMENTEDWALL, RETAININGWALL, USERDEFINED, NOTDEFINED

#### Complete Wall STEP Example (from BuildingSMART)

```step
/* Unit definitions */
#22= IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#23= IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);
#24= IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);
#25= IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);
#21= IFCUNITASSIGNMENT((#22,#23,#24,#25));

/* Geometric contexts */
#28= IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,0.0001,#30,#31);
#29= IFCCARTESIANPOINT((0.0,0.0,0.0));
#30= IFCAXIS2PLACEMENT3D(#29,$,$);
#31= IFCDIRECTION((0.0,1.0));
#32= IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#28,$,.MODEL_VIEW.,$);

/* Project and Building */
#20= IFCPROJECT('0$WU4A9R19$vKWO$AdOnKA',$,'Project',$,$,$,$,(#28),#21);
#10= IFCCARTESIANPOINT((0.0,0.0,0.0));
#11= IFCAXIS2PLACEMENT3D(#10,$,$);
#12= IFCLOCALPLACEMENT($,#11);
#13= IFCBUILDING('39t4Pu3nTC4ekXYRIHJB9W',$,'Building',$,$,#12,$,$,$,$,$,$);
#27= IFCRELAGGREGATES('091a6ewbvCMQ2Vyiqspa7a',$,'Project Container','',#20,(#13));

/* Material layers */
#50= IFCMATERIAL('Masonry - Brick - Brown',$,$);
#52= IFCMATERIAL('Masonry',$,$);
#54= IFCMATERIALLAYER(#50,110.0,.F.,'Finish',$,$,$);
#56= IFCMATERIALLAYER($,50.0,.T.,'Air Infiltration Barrier',$,$,$);
#58= IFCMATERIALLAYER(#52,110.0,.F.,'Core',$,$,$);
#60= IFCMATERIALLAYERSET((#54,#56,#58),'Double Brick - 270',$);

/* Wall type */
#300= IFCWALLTYPE('2aG1gZj7PD2PztLOx2$IVX',$,'Double Brick - 270',$,$,$,$,$,$,.NOTDEFINED.);
#61= IFCRELASSOCIATESMATERIAL('36U74BIPDD89cYkx9bkV$Y',$,'MatAssoc','',(#300),#60);

/* Material layer set usage for wall occurrence */
#302= IFCMATERIALLAYERSETUSAGE(#60,.AXIS2.,.POSITIVE.,-135.0,$);
#303= IFCRELASSOCIATESMATERIAL('1BYoVhjtLADPUZYzipA826',$,'MatAssoc','',(#307),#302);

/* Wall placement */
#304= IFCCARTESIANPOINT((0.0,0.0,0.0));
#305= IFCAXIS2PLACEMENT3D(#304,$,$);
#306= IFCLOCALPLACEMENT(#12,#305);

/* Wall instance */
#307= IFCWALLSTANDARDCASE('0DWgwt6o1FOx7466fPk$jl',$,$,$,$,#306,#319,$,$);

/* Wall axis (2D line along wall centerline) */
#308= IFCCARTESIANPOINT((0.0,0.0,0.0));
#309= IFCCARTESIANPOINT((5000.0,0.0,0.0));
#310= IFCPOLYLINE((#308,#309));
#311= IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Axis','Model',*,*,*,*,#28,$,.MODEL_VIEW.,$);
#312= IFCSHAPEREPRESENTATION(#311,'Axis','Curve3D',(#310));

/* Wall body geometry (extruded rectangle) */
#313= IFCRECTANGLEPROFILEDEF(.AREA.,$,$,5000.0,270.0);
#314= IFCCARTESIANPOINT((2500.0,0.0,0.0));
#315= IFCAXIS2PLACEMENT3D(#314,$,$);
#317= IFCDIRECTION((0.0,0.0,1.0));
#316= IFCEXTRUDEDAREASOLID(#313,#315,#317,2000.0);
#318= IFCSHAPEREPRESENTATION(#32,'Body','SweptSolid',(#316));

/* Product shape combining axis + body */
#319= IFCPRODUCTDEFINITIONSHAPE($,$,(#312,#318));

/* Spatial containment */
#14= IFCRELCONTAINEDINSPATIALSTRUCTURE('3Sa3dTJGn0H8TQIGiuGQd5',$,'Building','Container',(#307),#13);
```

Key observations:
- Wall axis is a 2D polyline along the wall centerline
- Body is an `IfcExtrudedAreaSolid` using `IfcRectangleProfileDef`
- Profile XDim = wall length, YDim = wall thickness
- Profile is centered, so Position offsets by half the length
- Extrusion direction is (0,0,1) = upward, Depth = wall height
- `IfcMaterialLayerSetUsage` OffsetFromReferenceLine = -135.0 means layers are offset from the axis

### Wall with Opening, Door, and Window

The entity chain for inserting a door/window into a wall:

```
IfcWall ←── IfcRelVoidsElement ──→ IfcOpeningElement
                                        ↑
                               IfcRelFillsElement
                                        ↑
                                   IfcDoor / IfcWindow
```

#### STEP Syntax for Opening in Wall

```step
/* Opening element geometry (slightly thicker than wall to ensure full void) */
#400= IFCCARTESIANPOINT((0.0,0.0,0.0));
#401= IFCAXIS2PLACEMENT3D(#400,$,$);
#402= IFCRECTANGLEPROFILEDEF(.AREA.,$,$,1000.0,400.0);
#403= IFCDIRECTION((0.0,0.0,1.0));
#404= IFCEXTRUDEDAREASOLID(#402,#401,#403,2100.0);
#405= IFCSHAPEREPRESENTATION(#32,'Body','SweptSolid',(#404));
#406= IFCPRODUCTDEFINITIONSHAPE($,$,(#405));

/* Opening placement (relative to wall, offset along wall axis) */
#407= IFCCARTESIANPOINT((1500.0,0.0,0.0));
#408= IFCAXIS2PLACEMENT3D(#407,$,$);
#409= IFCLOCALPLACEMENT(#306,#408);

/* Opening element */
#410= IFCOPENINGELEMENT('OpeningGUID',$,'Door Opening',$,$,#409,#406,$,.OPENING.);

/* Relationship: wall is voided by opening */
#411= IFCRELVOIDSELEMENT('VoidGUID',$,'Wall Opening','',#307,#410);
```

#### STEP Syntax for Door Filling the Opening

```step
/* Door placement (relative to the opening) */
#420= IFCCARTESIANPOINT((0.0,0.0,0.0));
#421= IFCAXIS2PLACEMENT3D(#420,$,$);
#422= IFCLOCALPLACEMENT(#409,#421);

/* Door entity */
#425= IFCDOOR('DoorGUID',$,'Main Door',$,$,#422,#doorshape,$,1000.0,2100.0,.DOOR.,.SINGLE_SWING_LEFT.,$);

/* Relationship: opening is filled by door */
#426= IFCRELFILLSELEMENT('FillGUID',$,'Door Fill','',#410,#425);

/* Spatial containment (door also contained in storey) */
#427= IFCRELCONTAINEDINSPATIALSTRUCTURE('ContGUID',$,'','',(...,#425),#storey);
```

### IfcDoor

#### EXPRESS Definition

```
ENTITY IfcDoor
  SUPERTYPE OF (IfcDoorStandardCase)
  SUBTYPE OF (IfcBuildingElement);
    OverallHeight : OPTIONAL IfcPositiveLengthMeasure;
    OverallWidth : OPTIONAL IfcPositiveLengthMeasure;
    PredefinedType : OPTIONAL IfcDoorTypeEnum;
    OperationType : OPTIONAL IfcDoorTypeOperationEnum;
    UserDefinedOperationType : OPTIONAL IfcLabel;
END_ENTITY;
```

**IfcDoorTypeEnum values:** DOOR, GATE, TRAPDOOR, USERDEFINED, NOTDEFINED

**IfcDoorTypeOperationEnum values:** SINGLE_SWING_LEFT, SINGLE_SWING_RIGHT, DOUBLE_SWING, DOUBLE_DOOR_SINGLE_SWING, SLIDING_TO_LEFT, SLIDING_TO_RIGHT, FOLDING_TO_LEFT, FOLDING_TO_RIGHT, REVOLVING, SWING_FIXED_LEFT, SWING_FIXED_RIGHT, USERDEFINED, NOTDEFINED

**Placement Rules:**
- If inserted in an opening, door's LocalPlacement is relative to the opening's LocalPlacement
- The Y-axis of the door's ObjectPlacement determines the opening direction
- Door must also be contained in the spatial structure via IfcRelContainedInSpatialStructure

#### IfcDoorLiningProperties

```
ENTITY IfcDoorLiningProperties
    SUBTYPE OF (IfcPreDefinedPropertySet);
    LiningDepth : OPTIONAL IfcPositiveLengthMeasure;       -- frame depth (often = wall thickness)
    LiningThickness : OPTIONAL IfcNonNegativeLengthMeasure; -- frame thickness (e.g. 50mm)
    ThresholdDepth : OPTIONAL IfcPositiveLengthMeasure;     -- bottom sill depth
    ThresholdThickness : OPTIONAL IfcNonNegativeLengthMeasure;
    TransomThickness : OPTIONAL IfcNonNegativeLengthMeasure; -- horizontal divider
    TransomOffset : OPTIONAL IfcLengthMeasure;               -- divider vertical position
    LiningOffset : OPTIONAL IfcLengthMeasure;
    ThresholdOffset : OPTIONAL IfcLengthMeasure;
    CasingThickness : OPTIONAL IfcPositiveLengthMeasure;    -- trim around frame
    CasingDepth : OPTIONAL IfcPositiveLengthMeasure;
    LiningToPanelOffsetX : OPTIONAL IfcLengthMeasure;      -- IFC4 addition
    LiningToPanelOffsetY : OPTIONAL IfcLengthMeasure;      -- IFC4 addition
END_ENTITY;
```

### IfcWindow

#### EXPRESS Definition

```
ENTITY IfcWindow
  SUBTYPE OF (IfcBuildingElement);
    OverallHeight : OPTIONAL IfcPositiveLengthMeasure;  -- Z dimension of bounding box
    OverallWidth : OPTIONAL IfcPositiveLengthMeasure;   -- X dimension of bounding box
    PredefinedType : OPTIONAL IfcWindowTypeEnum;
    PartitioningType : OPTIONAL IfcWindowTypePartitioningEnum;
    UserDefinedPartitioningType : OPTIONAL IfcLabel;
END_ENTITY;
```

**IfcWindowTypeEnum:** WINDOW, SKYLIGHT, LIGHTDOME, USERDEFINED, NOTDEFINED

**IfcWindowTypePartitioningEnum:** SINGLE_PANEL, DOUBLE_PANEL_VERTICAL, DOUBLE_PANEL_HORIZONTAL, TRIPLE_PANEL_VERTICAL, TRIPLE_PANEL_HORIZONTAL, TRIPLE_PANEL_BOTTOM, TRIPLE_PANEL_TOP, TRIPLE_PANEL_LEFT, TRIPLE_PANEL_RIGHT, USERDEFINED, NOTDEFINED

**Placement Rules:**
- Same as door: relative to opening if filling one
- Sill height is determined by the opening placement Z offset from the storey

#### Window in Wall -- Complete STEP Pattern

```step
/* 1. Create the opening in the wall */
#500= IFCRECTANGLEPROFILEDEF(.AREA.,$,$,1200.0,400.0);
#501= IFCAXIS2PLACEMENT3D(#origin,$,$);
#502= IFCDIRECTION((0.0,0.0,1.0));
#503= IFCEXTRUDEDAREASOLID(#500,#501,#502,1500.0);
#504= IFCSHAPEREPRESENTATION(#bodyctx,'Body','SweptSolid',(#503));
#505= IFCPRODUCTDEFINITIONSHAPE($,$,(#504));

/* Opening placed at sill height 900mm, offset 2000mm along wall */
#506= IFCCARTESIANPOINT((2000.0,0.0,900.0));
#507= IFCAXIS2PLACEMENT3D(#506,$,$);
#508= IFCLOCALPLACEMENT(#wallplacement,#507);
#509= IFCOPENINGELEMENT('WinOpenGUID',$,'Window Opening',$,$,#508,#505,$,.OPENING.);
#510= IFCRELVOIDSELEMENT('VoidGUID2',$,'','',#wall,#509);

/* 2. Create the window and fill the opening */
#520= IFCLOCALPLACEMENT(#508,#defaultplacement);
#525= IFCWINDOW('WinGUID',$,'Window W1',$,$,#520,#winshape,$,1200.0,1500.0,.WINDOW.,.SINGLE_PANEL.,$);
#526= IFCRELFILLSELEMENT('FillGUID2',$,'','',#509,#525);
```

### IfcSlab

#### EXPRESS Definition

```
ENTITY IfcSlab
  SUBTYPE OF (IfcBuiltElement);
    PredefinedType : OPTIONAL IfcSlabTypeEnum;
END_ENTITY;
```

**IfcSlabTypeEnum values:**
- **FLOOR** -- Standard floor slab (default)
- **ROOF** -- Roof slab
- **LANDING** -- Stair/ramp landing
- **BASESLAB** -- Foundation slab (mat foundation)
- **USERDEFINED**
- **NOTDEFINED**

#### Typical Slab Thicknesses

| Type | Thickness |
|------|-----------|
| Residential floor | 150-200 mm |
| Commercial floor | 200-300 mm |
| Roof slab | 150-200 mm |
| Stair landing | 150-200 mm |
| Base slab / foundation | 200-400 mm |

#### STEP Syntax for Floor Slab

```step
/* Slab profile (rectangular footprint) */
#600= IFCCARTESIANPOINT((0.0,0.0));
#601= IFCCARTESIANPOINT((10000.0,0.0));
#602= IFCCARTESIANPOINT((10000.0,8000.0));
#603= IFCCARTESIANPOINT((0.0,8000.0));
#604= IFCPOLYLINE((#600,#601,#602,#603,#600));
#605= IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#604);

/* Extrude downward or upward */
#606= IFCAXIS2PLACEMENT3D(#origin,$,$);
#607= IFCDIRECTION((0.0,0.0,1.0));
#608= IFCEXTRUDEDAREASOLID(#605,#606,#607,200.0);
#609= IFCSHAPEREPRESENTATION(#bodyctx,'Body','SweptSolid',(#608));
#610= IFCPRODUCTDEFINITIONSHAPE($,$,(#609));

/* Slab placement at storey elevation */
#611= IFCCARTESIANPOINT((0.0,0.0,0.0));
#612= IFCAXIS2PLACEMENT3D(#611,$,$);
#613= IFCLOCALPLACEMENT(#storeyplacement,#612);

/* Slab entity */
#614= IFCSLAB('SlabGUID',$,'Ground Floor Slab',$,$,#613,#610,$,.FLOOR.);
#615= IFCRELCONTAINEDINSPATIALSTRUCTURE('ContGUID',$,'','',(...,#614),#storey);
```

### IfcStairFlight + IfcStair

#### IfcStair EXPRESS Definition

```
ENTITY IfcStair
  SUBTYPE OF (IfcBuildingElement);
    PredefinedType : OPTIONAL IfcStairTypeEnum;
END_ENTITY;
```

**IfcStairTypeEnum values:** STRAIGHT_RUN_STAIR, TWO_STRAIGHT_RUN_STAIR, QUARTER_WINDING_STAIR, QUARTER_TURN_STAIR, HALF_WINDING_STAIR, HALF_TURN_STAIR, TWO_QUARTER_WINDING_STAIR, TWO_QUARTER_TURN_STAIR, THREE_QUARTER_WINDING_STAIR, THREE_QUARTER_TURN_STAIR, SPIRAL_STAIR, DOUBLE_RETURN_STAIR, CURVED_RUN_STAIR, TWO_CURVED_RUN_STAIR, USERDEFINED, NOTDEFINED

#### IfcStairFlight EXPRESS Definition

```
ENTITY IfcStairFlight
  SUBTYPE OF (IfcBuildingElement);
    NumberOfRisers : OPTIONAL IfcInteger;
    NumberOfTreads : OPTIONAL IfcInteger;
    RiserHeight : OPTIONAL IfcPositiveLengthMeasure;
    TreadLength : OPTIONAL IfcPositiveLengthMeasure;
    PredefinedType : OPTIONAL IfcStairFlightTypeEnum;
END_ENTITY;
```

#### Stair Aggregation Pattern

```
IfcStair (container, no own geometry if decomposed)
  ├── IfcStairFlight "Lower Flight"  (via IfcRelAggregates)
  ├── IfcSlab "Landing" PredefinedType=LANDING  (via IfcRelAggregates)
  ├── IfcStairFlight "Upper Flight"  (via IfcRelAggregates)
  ├── IfcRailing "Left Handrail"  (via IfcRelAggregates)
  └── IfcRailing "Right Handrail"  (via IfcRelAggregates)
```

#### Stair Flight Geometry Using IfcArbitraryClosedProfileDef

A stair flight profile is a 2D stepped shape extruded along the stair width:

```
For a flight with 3 risers (R=170mm) and 3 treads (T=280mm):

Profile points (in XY plane):
  (0, 0)          -- bottom of first riser
  (0, 170)        -- top of first riser
  (280, 170)      -- end of first tread
  (280, 340)      -- top of second riser
  (560, 340)      -- end of second tread
  (560, 510)      -- top of third riser
  (840, 510)      -- end of third tread (top landing edge)
  (840, 0)        -- bottom right (close the profile underneath)
  (0, 0)          -- back to start (closed)
```

STEP syntax for this profile:

```step
/* Stair profile points */
#700= IFCCARTESIANPOINT((0.0,0.0));
#701= IFCCARTESIANPOINT((0.0,170.0));
#702= IFCCARTESIANPOINT((280.0,170.0));
#703= IFCCARTESIANPOINT((280.0,340.0));
#704= IFCCARTESIANPOINT((560.0,340.0));
#705= IFCCARTESIANPOINT((560.0,510.0));
#706= IFCCARTESIANPOINT((840.0,510.0));
#707= IFCCARTESIANPOINT((840.0,0.0));
#708= IFCPOLYLINE((#700,#701,#702,#703,#704,#705,#706,#707,#700));
#709= IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#708);

/* Extrude along stair width */
#710= IFCAXIS2PLACEMENT3D(#origin,$,$);
#711= IFCDIRECTION((0.0,1.0,0.0));
#712= IFCEXTRUDEDAREASOLID(#709,#710,#711,1200.0);
#713= IFCSHAPEREPRESENTATION(#bodyctx,'Body','SweptSolid',(#712));

/* Stair flight entity */
#714= IFCSTAIRFLIGHT('FlightGUID',$,'Lower Flight',$,$,#flightplacement,#713shape,$,
    3,3,170.0,280.0,.STRAIGHT.);
```

The stair flight is then placed and rotated so the profile XY plane is vertical and extrusion goes along the width axis. Use `IfcAxis2Placement3D` with custom direction vectors to orient the extrusion correctly.

### IfcRoof

#### EXPRESS Definition

```
ENTITY IfcRoof
  SUBTYPE OF (IfcBuiltElement);
    PredefinedType : OPTIONAL IfcRoofTypeEnum;
END_ENTITY;
```

An IfcRoof is a container that aggregates its component slabs:

```
IfcRoof (container)
  ├── IfcSlab "South Slope" PredefinedType=ROOF (via IfcRelAggregates)
  └── IfcSlab "North Slope" PredefinedType=ROOF (via IfcRelAggregates)
```

#### Gable Roof Modeling

For a gable roof, create two sloped IfcSlab elements:

1. Create a rectangular slab representation with `add_wall_representation` using the `x_angle` parameter for slope
2. Rotate the slab using placement direction vectors so it tilts at the roof angle
3. Position one slab on each side of the ridge

```python
# South roof slope
south_repr = ios.geometry.add_wall_representation(
    file, context=body,
    length=roof_length,           # along the ridge
    height=roof_width / 2,        # half the building width + overhang
    thickness=roof_thickness,
    x_angle=roof_angle_rad        # slope angle in radians
)
```

The placement matrix rotates the slab so it slopes from ridge to eave. The x_local and z_local direction vectors in the placement matrix control the orientation.

### IfcColumn + IfcBeam

#### EXPRESS Definition

```
ENTITY IfcColumn SUBTYPE OF (IfcBuildingElement);
    PredefinedType : OPTIONAL IfcColumnTypeEnum;
END_ENTITY;

ENTITY IfcBeam SUBTYPE OF (IfcBuildingElement);
    PredefinedType : OPTIONAL IfcBeamTypeEnum;
END_ENTITY;
```

#### Supported Profile Types

| Profile | Entity | Usage |
|---------|--------|-------|
| Rectangle | IfcRectangleProfileDef | Concrete columns/beams |
| Circle | IfcCircleProfileDef | Round columns, pipes |
| I-Shape | IfcIShapeProfileDef | Steel beams/columns |
| L-Shape | IfcLShapeProfileDef | Steel angles |
| U-Shape | IfcUShapeProfileDef | Steel channels |
| C-Shape | IfcCShapeProfileDef | Cold-formed steel |
| T-Shape | IfcTShapeProfileDef | Steel tees |
| Z-Shape | IfcZShapeProfileDef | Z-purlins |
| Arbitrary | IfcArbitraryClosedProfileDef | Custom shapes |

#### STEP Syntax for Column

```step
/* Rectangular concrete column 300x300mm, 3000mm tall */
#800= IFCRECTANGLEPROFILEDEF(.AREA.,'300x300',$,300.0,300.0);
#801= IFCAXIS2PLACEMENT3D(#origin,$,$);
#802= IFCDIRECTION((0.0,0.0,1.0));
#803= IFCEXTRUDEDAREASOLID(#800,#801,#802,3000.0);
#804= IFCSHAPEREPRESENTATION(#bodyctx,'Body','SweptSolid',(#803));
#805= IFCPRODUCTDEFINITIONSHAPE($,$,(#804));
#806= IFCCOLUMN('ColGUID',$,'Column C1',$,$,#colplacement,#805,$,.COLUMN.);

/* Circular steel column, radius 150mm */
#810= IFCCIRCLEPROFILEDEF(.AREA.,'300D',$,150.0);
#811= IFCEXTRUDEDAREASOLID(#810,#origin3d,#zdir,3000.0);

/* I-beam: OverallWidth=200, OverallDepth=400, Web=10, Flange=15, Fillet=10 */
#820= IFCISHAPEPROFILEDEF(.AREA.,'HEA200',$,200.0,400.0,10.0,15.0,10.0);
#821= IFCEXTRUDEDAREASOLID(#820,#beamorigin,#beamdir,6000.0);
```

### IfcRailing

#### EXPRESS Definition

```
ENTITY IfcRailing
  SUBTYPE OF (IfcBuildingElement);
    PredefinedType : OPTIONAL IfcRailingTypeEnum;
END_ENTITY;
```

**IfcRailingTypeEnum:** HANDRAIL, GUARDRAIL, BALUSTRADE, FENCE, USERDEFINED, NOTDEFINED

- HANDRAIL: A rail for gripping at stair or ramp
- GUARDRAIL: A rail preventing falls (at elevated edges)
- BALUSTRADE: A guardrail at the edge of a floor/balcony/rooftop

Railings can be aggregated by an IfcStair or modeled independently.

### IfcSpace

#### EXPRESS Definition

```
ENTITY IfcSpace
  SUBTYPE OF (IfcSpatialStructureElement);
    PredefinedType : OPTIONAL IfcSpaceTypeEnum;
    ElevationWithFlooring : OPTIONAL IfcLengthMeasure;
END_ENTITY;
```

**IfcSpaceTypeEnum:** SPACE, PARKING, GFA (Gross Floor Area), INTERNAL, EXTERNAL, USERDEFINED, NOTDEFINED

**Relationship to Storey:**
Spaces are aggregated by their storey via IfcRelAggregates:

```
IfcBuildingStorey
  ├── IfcSpace "Living Room"  (via IfcRelAggregates)
  ├── IfcSpace "Kitchen"      (via IfcRelAggregates)
  └── IfcSpace "Bedroom 1"   (via IfcRelAggregates)
```

Elements (furniture, etc.) are contained in spaces via IfcRelContainedInSpatialStructure.

**Geometry:** Typically an IfcExtrudedAreaSolid using IfcArbitraryClosedProfileDef (room footprint polyline) extruded to room height.

---

## 3. IFC Geometry Deep Dive

### IfcExtrudedAreaSolid

The primary geometry type for building elements. Creates a 3D solid by sweeping a 2D profile along a direction.

```
ENTITY IfcExtrudedAreaSolid
  SUBTYPE OF (IfcSweptAreaSolid);
    ExtrudedDirection : IfcDirection;      -- sweep direction vector
    Depth : IfcPositiveLengthMeasure;      -- distance to sweep
END_ENTITY;
```

Inherited attributes from IfcSweptAreaSolid:
- `SweptArea` : IfcProfileDef -- the 2D profile to sweep
- `Position` : IfcAxis2Placement3D (optional) -- repositions the solid; defaults to local origin

**Common usage patterns:**

| Element | Profile | ExtrudedDirection | Depth |
|---------|---------|------------------|-------|
| Wall | IfcRectangleProfileDef (length x thickness) | (0,0,1) up | wall height |
| Slab | IfcArbitraryClosedProfileDef (footprint) | (0,0,1) up | slab thickness |
| Column | IfcRectangleProfileDef or IfcCircleProfileDef | (0,0,1) up | column height |
| Beam | IfcIShapeProfileDef or IfcRectangleProfileDef | (1,0,0) or (0,1,0) along span | beam length |
| Stair flight | IfcArbitraryClosedProfileDef (step profile) | (0,1,0) or (0,0,1) | stair width |

### IfcRectangleProfileDef

```step
IFCRECTANGLEPROFILEDEF(.AREA.,'ProfileName',#placement2d,XDim,YDim);
```

- `.AREA.` = profile type (AREA for solid, CURVE for outline)
- `#placement2d` = IfcAxis2Placement2D (center of rectangle), or $ for default
- `XDim` = width
- `YDim` = height/depth

### IfcCircleProfileDef

```step
IFCCIRCLEPROFILEDEF(.AREA.,'ProfileName',#placement2d,Radius);
```

### IfcArbitraryClosedProfileDef

For custom shapes defined by a polyline:

```step
/* Points defining the shape */
#p1= IFCCARTESIANPOINT((0.0,0.0));
#p2= IFCCARTESIANPOINT((5000.0,0.0));
#p3= IFCCARTESIANPOINT((5000.0,3000.0));
#p4= IFCCARTESIANPOINT((2500.0,4500.0));
#p5= IFCCARTESIANPOINT((0.0,3000.0));
#poly= IFCPOLYLINE((#p1,#p2,#p3,#p4,#p5,#p1));
#profile= IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,'Gable Shape',#poly);
```

Can also use IfcIndexedPolyCurve for more complex shapes with arcs.

### IfcBooleanClippingResult

Used to cut shapes, especially walls under sloped roofs.

```
ENTITY IfcBooleanClippingResult
  SUBTYPE OF (IfcBooleanResult);
  -- Operator is always DIFFERENCE
  -- FirstOperand: IfcSweptAreaSolid or another IfcBooleanClippingResult
  -- SecondOperand: IfcHalfSpaceSolid
END_ENTITY;
```

**Clipping a wall for a gable roof:**

```step
/* The base wall solid (extruded beyond roof) */
#900= IFCEXTRUDEDAREASOLID(#wallprofile,#wallpos,#zdir,5000.0);

/* Clipping plane for south roof slope */
#901= IFCCARTESIANPOINT((0.0,0.0,3000.0));  /* point on the plane (at wall top) */
#902= IFCAXIS2PLACEMENT3D(#901,#roofnormal,#xdir);
#903= IFCPLANE(#902);
#904= IFCHALFSPACESOLID(#903,.T.);  /* .T. = agreement flag, material is below plane */

/* Boolean clipping */
#905= IFCBOOLEANCLIPPINGRESULT(.DIFFERENCE.,#900,#904);

/* For a second clip (north slope), chain from first result */
#906= IFCHALFSPACESOLID(#northplane,.T.);
#907= IFCBOOLEANCLIPPINGRESULT(.DIFFERENCE.,#905,#906);

/* Use in shape representation with type 'Clipping' */
#908= IFCSHAPEREPRESENTATION(#bodyctx,'Body','Clipping',(#907));
```

The representation type changes from 'SweptSolid' to 'Clipping' when boolean operations are used.

### IfcPolygonalBoundedHalfSpace

A refinement of IfcHalfSpaceSolid that limits the clipping to a polygonal boundary:

```step
#910= IFCPLANE(#planeposition);
#911= IFCPOLYLINE((#p1,#p2,#p3,#p4,#p1));  /* boundary polygon */
#912= IFCPOLYGONALBOUNDEDHALFSPACE(#910,.T.,#boundaryposition,#911);
```

### Placement and Rotation (IfcLocalPlacement + IfcAxis2Placement3D)

#### IfcAxis2Placement3D

```
ENTITY IfcAxis2Placement3D;
    Location : IfcCartesianPoint;     -- XYZ position
    Axis : OPTIONAL IfcDirection;     -- local Z direction (default: 0,0,1)
    RefDirection : OPTIONAL IfcDirection; -- local X direction (default: 1,0,0)
    -- local Y direction is derived: Axis x RefDirection
END_ENTITY;
```

**Default (no rotation):**
```step
#100= IFCCARTESIANPOINT((X,Y,Z));
#101= IFCAXIS2PLACEMENT3D(#100,$,$);  /* $ = use defaults */
```

**Rotated 90 degrees around Z-axis (wall along Y instead of X):**
```step
#100= IFCCARTESIANPOINT((X,Y,Z));
#xdir= IFCDIRECTION((0.0,1.0,0.0));  /* X-axis now points in global Y */
#zdir= IFCDIRECTION((0.0,0.0,1.0));  /* Z-axis still points up */
#101= IFCAXIS2PLACEMENT3D(#100,#zdir,#xdir);
```

**Tilted for a roof slope (30 degrees from horizontal):**
```step
#100= IFCCARTESIANPOINT((X,Y,Z));
#xdir= IFCDIRECTION((1.0,0.0,0.0));
#zdir= IFCDIRECTION((0.0,-0.5,0.866));  /* Z tilted 30 deg from vertical */
#101= IFCAXIS2PLACEMENT3D(#100,#zdir,#xdir);
```

#### IfcLocalPlacement

```
ENTITY IfcLocalPlacement;
    PlacementRelTo : OPTIONAL IfcObjectPlacement;  -- parent placement (or $ for absolute)
    RelativePlacement : IfcAxis2Placement;          -- position relative to parent
END_ENTITY;
```

**Hierarchy example:**
```step
/* Building at origin */
#bldgplace= IFCLOCALPLACEMENT($,#originplacement);

/* Ground floor at building origin */
#gfplace= IFCLOCALPLACEMENT(#bldgplace,#originplacement);

/* First floor at Z=3000 relative to building */
#fforigin= IFCCARTESIANPOINT((0.0,0.0,3000.0));
#ffaxis= IFCAXIS2PLACEMENT3D(#fforigin,$,$);
#ffplace= IFCLOCALPLACEMENT(#bldgplace,#ffaxis);

/* Wall on first floor at X=1000, Y=500 */
#wallorigin= IFCCARTESIANPOINT((1000.0,500.0,0.0));
#wallaxis= IFCAXIS2PLACEMENT3D(#wallorigin,$,$);
#wallplace= IFCLOCALPLACEMENT(#ffplace,#wallaxis);
```

Each element's coordinate is relative to its parent placement. The storey's Z offset propagates to all contained elements.

### Non-Axis-Aligned Walls

To create a wall at an angle (e.g., 45 degrees from X-axis):

```step
/* Wall origin */
#wp= IFCCARTESIANPOINT((2000.0,1000.0,0.0));
/* X-axis rotated 45 degrees */
#wxdir= IFCDIRECTION((0.707,0.707,0.0));
#wzdir= IFCDIRECTION((0.0,0.0,1.0));
#waxis= IFCAXIS2PLACEMENT3D(#wp,#wzdir,#wxdir);
#wplace= IFCLOCALPLACEMENT(#storeyplace,#waxis);
```

The wall geometry (profile and extrusion) is always defined in local coordinates along the local X-axis. The placement rotates it into position.

---

## 4. IFC Relationships

### IfcRelAggregates

Decomposes a whole into parts. Used for the spatial hierarchy and composite elements.

```step
/* Project contains Site */
IFCRELAGGREGATES('GUID',$,'ProjectContainer','',#project,(#site));

/* Site contains Building */
IFCRELAGGREGATES('GUID',$,'SiteContainer','',#site,(#building));

/* Building contains Storeys */
IFCRELAGGREGATES('GUID',$,'BuildingContainer','',#building,(#storey_gf,#storey_ff));

/* Storey contains Spaces */
IFCRELAGGREGATES('GUID',$,'StoreySpaces','',#storey,(#space1,#space2));

/* Stair contains flights and landings */
IFCRELAGGREGATES('GUID',$,'StairComponents','',#stair,(#flight1,#landing,#flight2));

/* Roof contains slabs */
IFCRELAGGREGATES('GUID',$,'RoofSlabs','',#roof,(#southslab,#northslab));
```

### IfcRelContainedInSpatialStructure

Assigns building elements to their spatial container (storey, building, site).

```step
/* Walls and slabs in ground floor */
IFCRELCONTAINEDINSPATIALSTRUCTURE('GUID',$,'GroundFloor','Elements',
    (#wall1,#wall2,#wall3,#wall4,#slab1,#door1,#window1),#storey_gf);

/* Elements on first floor */
IFCRELCONTAINEDINSPATIALSTRUCTURE('GUID',$,'FirstFloor','Elements',
    (#wall5,#wall6,#slab2),#storey_ff);
```

Each element should be contained in exactly one spatial structure element.

### IfcRelVoidsElement

Creates an opening void in an element.

```step
IFCRELVOIDSELEMENT('GUID',$,'WallOpening','Description',
    #wallElement,      -- RelatingBuildingElement (the wall being voided)
    #openingElement    -- RelatedOpeningElement (the opening)
);
```

### IfcRelFillsElement

Fills an opening with a door, window, or other element.

```step
IFCRELFILLSELEMENT('GUID',$,'DoorFill','Description',
    #openingElement,   -- RelatingOpeningElement
    #doorElement       -- RelatedBuildingElement (the door/window)
);
```

This is a one-to-one relationship: each opening can have at most one filling.

### IfcRelAssociatesMaterial

Associates material definitions with elements.

```step
/* Associate material layer set with wall type */
IFCRELASSOCIATESMATERIAL('GUID',$,'MatAssoc','',
    (#wallType),       -- RelatedObjects (elements or types)
    #materialLayerSet  -- RelatingMaterial
);

/* Associate material layer set USAGE with wall occurrence */
IFCRELASSOCIATESMATERIAL('GUID',$,'MatAssoc','',
    (#wallInstance),
    #materialLayerSetUsage
);
```

### IfcRelDefinesByProperties

Links property sets to element occurrences.

```step
/* Property values */
#pv1= IFCPROPERTYSINGLEVALUE('IsExternal',$,IFCBOOLEAN(.T.),$);
#pv2= IFCPROPERTYSINGLEVALUE('LoadBearing',$,IFCBOOLEAN(.T.),$);
#pv3= IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('REI 120'),$);
#pv4= IFCPROPERTYSINGLEVALUE('ThermalTransmittance',$,IFCTHERMALTRANSMITTANCEMEASURE(0.24),$);

/* Property set */
#ps1= IFCPROPERTYSET('PsetGUID',$,'Pset_WallCommon',$,(#pv1,#pv2,#pv3,#pv4));

/* Link property set to wall */
#pd1= IFCRELDEFINESBYPROPERTIES('RelGUID',$,'','',
    (#wallInstance),   -- RelatedObjects
    #ps1               -- RelatingPropertyDefinition
);
```

---

## 5. Multi-Storey Buildings

### Defining Multiple Storeys

Each storey has its own IfcBuildingStorey with a distinct Elevation value. The Elevation is the base height of the storey relative to the building's zero reference.

```step
/* Ground Floor at elevation 0 */
#gf_origin= IFCCARTESIANPOINT((0.0,0.0,0.0));
#gf_axis= IFCAXIS2PLACEMENT3D(#gf_origin,$,$);
#gf_place= IFCLOCALPLACEMENT(#bldg_place,#gf_axis);
#gf= IFCBUILDINGSTOREY('GFGUID',$,'Ground Floor',$,$,#gf_place,$,$,.ELEMENT.,0.0);

/* First Floor at elevation 3200 */
#ff_origin= IFCCARTESIANPOINT((0.0,0.0,3200.0));
#ff_axis= IFCAXIS2PLACEMENT3D(#ff_origin,$,$);
#ff_place= IFCLOCALPLACEMENT(#bldg_place,#ff_axis);
#ff= IFCBUILDINGSTOREY('FFGUID',$,'First Floor',$,$,#ff_place,$,$,.ELEMENT.,3200.0);

/* Second Floor at elevation 6400 */
#sf_origin= IFCCARTESIANPOINT((0.0,0.0,6400.0));
#sf_axis= IFCAXIS2PLACEMENT3D(#sf_origin,$,$);
#sf_place= IFCLOCALPLACEMENT(#bldg_place,#sf_axis);
#sf= IFCBUILDINGSTOREY('SFGUID',$,'Second Floor',$,$,#sf_place,$,$,.ELEMENT.,6400.0);

/* Aggregate all storeys under building */
IFCRELAGGREGATES('GUID',$,'BuildingStoreys','',#building,(#gf,#ff,#sf));
```

### Upper Floor Element Placement

Elements on upper floors use local placement relative to their storey. Coordinates are always relative to the storey origin, so Z=0 for an element means it sits on that floor:

```step
/* Wall on first floor (Z=0 means at first floor level) */
#uf_wallorigin= IFCCARTESIANPOINT((1000.0,0.0,0.0));
#uf_wallaxis= IFCAXIS2PLACEMENT3D(#uf_wallorigin,$,$);
#uf_wallplace= IFCLOCALPLACEMENT(#ff_place,#uf_wallaxis);
#uf_wall= IFCWALL('WallGUID',$,'First Floor Wall',$,$,#uf_wallplace,#wallshape,$,$);

/* Contain it in the first floor storey */
IFCRELCONTAINEDINSPATIALSTRUCTURE('GUID',$,'','',(...,#uf_wall),#ff);
```

### Staircase Spanning Multiple Storeys

A staircase connecting floors is typically contained in the lower storey. The stair flight geometry extends upward through the floor-to-floor height. If the stair spans multiple storeys, it can be referenced in the upper storey via `IfcRelReferencedInSpatialStructure`.

```step
/* Stair contained in ground floor */
IFCRELCONTAINEDINSPATIALSTRUCTURE('GUID',$,'','',(...,#stair),#gf);

/* Also referenced by first floor */
IFCRELREFERENCEDINSPATIALSTRUCTURE('GUID',$,'StairRef','',
    (#stair),#ff);
```

### Floor Slab Between Storeys

The floor slab at an upper storey level is typically contained in the upper storey, placed at Z=0 relative to that storey (or at a negative offset if the structural slab is below the finish floor level):

```step
/* First floor slab, contained in first floor storey, placed at Z=0 */
#ffslab_place= IFCLOCALPLACEMENT(#ff_place,#originplacement);
#ffslab= IFCSLAB('SlabGUID',$,'First Floor Slab',$,$,#ffslab_place,#slabshape,$,.FLOOR.);
IFCRELCONTAINEDINSPATIALSTRUCTURE('GUID',$,'','',(...,#ffslab),#ff);
```

---

## 6. Property Sets

### Common Property Sets

#### Pset_WallCommon

| Property | Data Type | Description |
|----------|-----------|-------------|
| Reference | IfcIdentifier | Type reference ID (deprecated) |
| Status | PEnum_ElementStatus | New, Existing, Demolish, Temporary |
| AcousticRating | IfcLabel | Sound transmission resistance |
| FireRating | IfcLabel | e.g. "REI 120", "1 Hour" |
| Combustible | IfcBoolean | Material combustibility |
| SurfaceSpreadOfFlame | IfcLabel | Flame spread classification |
| ThermalTransmittance | IfcThermalTransmittanceMeasure | U-value in W/(m2K) |
| IsExternal | IfcBoolean | Exterior (TRUE) or interior (FALSE) |
| LoadBearing | IfcBoolean | Structural (TRUE) or partition (FALSE) |
| ExtendToStructure | IfcBoolean | Extends to structure above |
| Compartmentation | IfcBoolean | Fire compartment boundary |

#### Pset_DoorCommon

| Property | Data Type | Description |
|----------|-----------|-------------|
| Reference | IfcIdentifier | Type reference |
| Status | PEnum_ElementStatus | Element condition |
| FireRating | IfcLabel | Fire safety class |
| AcousticRating | IfcLabel | Sound rating |
| SecurityRating | IfcLabel | Security level |
| IsExternal | IfcBoolean | Exterior/interior |
| ThermalTransmittance | IfcThermalTransmittanceMeasure | U-value |
| GlazingAreaFraction | IfcPositiveRatioMeasure | Glass percentage |
| HandicapAccessible | IfcBoolean | ADA compliant |
| FireExit | IfcBoolean | Emergency exit |
| HasDrive | IfcBoolean | Automatic operation |
| SelfClosing | IfcBoolean | Auto-closure |
| SmokeStop | IfcBoolean | Smoke barrier |

#### Pset_WindowCommon

Same pattern as doors: IsExternal, FireRating, AcousticRating, SecurityRating, ThermalTransmittance, GlazingAreaFraction, plus Infiltration (air leakage).

#### Pset_SlabCommon

IsExternal, LoadBearing, FireRating, AcousticRating, ThermalTransmittance, Compartmentation.

#### Pset_StairFlightCommon

NumberOfRiser, NumberOfTreads, RiserHeight, TreadLength, NosingLength, WaistThickness, WalkingLineOffset, TreadLengthAtOffset, TreadLengthAtInnerSide.

#### Pset_SpaceCommon

Reference, IsExternal, GrossPlannedArea, NetPlannedArea, PubliclyAccessible, HandicapAccessible.

### How to Attach Properties to Elements

#### STEP Syntax

```step
/* Create individual property values */
#p1= IFCPROPERTYSINGLEVALUE('IsExternal',$,IFCBOOLEAN(.T.),$);
#p2= IFCPROPERTYSINGLEVALUE('LoadBearing',$,IFCBOOLEAN(.F.),$);
#p3= IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('EI 60'),$);
#p4= IFCPROPERTYSINGLEVALUE('ThermalTransmittance',$,
    IFCTHERMALTRANSMITTANCEMEASURE(0.35),$);

/* Group into a property set */
#pset= IFCPROPERTYSET('PsetGUID',$,'Pset_WallCommon',$,(#p1,#p2,#p3,#p4));

/* Relate to one or more elements */
#rel= IFCRELDEFINESBYPROPERTIES('RelGUID',$,$,$,(#wall1,#wall2),#pset);
```

#### IfcOpenShell Python API

```python
# Create and populate a property set
pset = ifcopenshell.api.pset.add_pset(model, product=wall, name='Pset_WallCommon')
ifcopenshell.api.pset.edit_pset(model, pset=pset, properties={
    'IsExternal': True,
    'LoadBearing': True,
    'FireRating': 'REI 120',
    'ThermalTransmittance': 0.24,
})
```

---

## 7. IfcOpenShell Python API Reference

### Complete Building Creation Workflow

```python
import ifcopenshell
import ifcopenshell.api.root
import ifcopenshell.api.unit
import ifcopenshell.api.context
import ifcopenshell.api.project
import ifcopenshell.api.spatial
import ifcopenshell.api.geometry
import ifcopenshell.api.aggregate
import ifcopenshell.api.material
import ifcopenshell.api.style
import ifcopenshell.api.pset
import ifcopenshell.api.feature
import numpy

# === 1. Initialize Model ===
model = ifcopenshell.api.project.create_file(version='IFC4')
project = ifcopenshell.api.root.create_entity(model, ifc_class='IfcProject', name='My Building')
ifcopenshell.api.unit.assign_unit(model)

# === 2. Geometry Context ===
ctx = ifcopenshell.api.context.add_context(model, context_type='Model')
body = ifcopenshell.api.context.add_context(
    model, context_type='Model', context_identifier='Body',
    target_view='MODEL_VIEW', parent=ctx)

# === 3. Spatial Structure ===
site = ifcopenshell.api.root.create_entity(model, ifc_class='IfcSite', name='Site')
building = ifcopenshell.api.root.create_entity(model, ifc_class='IfcBuilding', name='Building')
storey_gf = ifcopenshell.api.root.create_entity(model, ifc_class='IfcBuildingStorey', name='Ground Floor')
storey_ff = ifcopenshell.api.root.create_entity(model, ifc_class='IfcBuildingStorey', name='First Floor')

ifcopenshell.api.aggregate.assign_object(model, relating_object=project, products=[site])
ifcopenshell.api.aggregate.assign_object(model, relating_object=site, products=[building])
ifcopenshell.api.aggregate.assign_object(model, relating_object=building, products=[storey_gf, storey_ff])

# Set storey elevations via placement
ifcopenshell.api.geometry.edit_object_placement(model, product=storey_gf)  # Z=0
matrix_ff = numpy.eye(4)
matrix_ff[2, 3] = 3.2  # Z=3200mm if using meters, or 3200 if mm
ifcopenshell.api.geometry.edit_object_placement(model, product=storey_ff, matrix=matrix_ff)

# === 4. Create Walls ===
wall = ifcopenshell.api.root.create_entity(model, ifc_class='IfcWall', name='South Wall',
                                            predefined_type='SOLIDWALL')
ifcopenshell.api.geometry.edit_object_placement(model, product=wall)
wall_repr = ifcopenshell.api.geometry.add_wall_representation(
    model, context=body, length=10.0, height=3.0, thickness=0.2)
ifcopenshell.api.geometry.assign_representation(model, product=wall, representation=wall_repr)
ifcopenshell.api.spatial.assign_container(model, relating_structure=storey_gf, products=[wall])

# === 5. Create Opening in Wall ===
opening = ifcopenshell.api.root.create_entity(model, ifc_class='IfcOpeningElement')
opening_repr = ifcopenshell.api.geometry.add_wall_representation(
    model, context=body, length=1.0, height=2.1, thickness=0.4)  # thicker than wall
ifcopenshell.api.geometry.assign_representation(model, product=opening, representation=opening_repr)

# Position opening at 2m along wall, at floor level
matrix_opening = numpy.eye(4)
matrix_opening[0, 3] = 2.0  # X offset along wall
ifcopenshell.api.geometry.edit_object_placement(model, product=opening, matrix=matrix_opening)

# Void the wall
ifcopenshell.api.feature.add_feature(model, feature=opening, element=wall)

# === 6. Create Door and Fill Opening ===
door = ifcopenshell.api.root.create_entity(model, ifc_class='IfcDoor', name='Main Door',
                                            predefined_type='DOOR')
door_repr = ifcopenshell.api.geometry.add_door_representation(
    model, context=body, overall_height=2.1, overall_width=1.0,
    operation_type='SINGLE_SWING_LEFT')
ifcopenshell.api.geometry.assign_representation(model, product=door, representation=door_repr)
ifcopenshell.api.geometry.edit_object_placement(model, product=door)
ifcopenshell.api.spatial.assign_container(model, relating_structure=storey_gf, products=[door])

# Fill the opening with the door
ifcopenshell.api.feature.add_filling(model, opening=opening, element=door)

# === 7. Create Window ===
win_opening = ifcopenshell.api.root.create_entity(model, ifc_class='IfcOpeningElement')
win_opening_repr = ifcopenshell.api.geometry.add_wall_representation(
    model, context=body, length=1.2, height=1.5, thickness=0.4)
ifcopenshell.api.geometry.assign_representation(model, product=win_opening, representation=win_opening_repr)

# Position at 5m along wall, sill at 900mm
matrix_win = numpy.eye(4)
matrix_win[0, 3] = 5.0
matrix_win[2, 3] = 0.9  # sill height
ifcopenshell.api.geometry.edit_object_placement(model, product=win_opening, matrix=matrix_win)
ifcopenshell.api.feature.add_feature(model, feature=win_opening, element=wall)

window = ifcopenshell.api.root.create_entity(model, ifc_class='IfcWindow', name='Window W1',
                                              predefined_type='WINDOW')
win_repr = ifcopenshell.api.geometry.add_window_representation(
    model, context=body, overall_height=1.5, overall_width=1.2,
    partition_type='SINGLE_PANEL')
ifcopenshell.api.geometry.assign_representation(model, product=window, representation=win_repr)
ifcopenshell.api.geometry.edit_object_placement(model, product=window)
ifcopenshell.api.spatial.assign_container(model, relating_structure=storey_gf, products=[window])
ifcopenshell.api.feature.add_filling(model, opening=win_opening, element=window)

# === 8. Floor Slab ===
slab = ifcopenshell.api.root.create_entity(model, ifc_class='IfcSlab', name='Ground Slab',
                                            predefined_type='FLOOR')
slab_repr = ifcopenshell.api.geometry.add_slab_representation(
    model, context=body, depth=0.2)
ifcopenshell.api.geometry.assign_representation(model, product=slab, representation=slab_repr)
ifcopenshell.api.geometry.edit_object_placement(model, product=slab)
ifcopenshell.api.spatial.assign_container(model, relating_structure=storey_gf, products=[slab])

# === 9. Materials ===
brick = ifcopenshell.api.material.add_material(model, name='Brick', category='brick')
wall_layerset = ifcopenshell.api.material.add_material_set(
    model, name='Wall', set_type='IfcMaterialLayerSet')
brick_layer = ifcopenshell.api.material.add_layer(
    model, layer_set=wall_layerset, material=brick)
ifcopenshell.api.material.edit_layer(
    model, layer=brick_layer, attributes={'LayerThickness': 0.2})
ifcopenshell.api.material.assign_material(
    model, product=wall, type='IfcMaterialLayerSet', material=wall_layerset)

# === 10. Property Sets ===
pset = ifcopenshell.api.pset.add_pset(model, product=wall, name='Pset_WallCommon')
ifcopenshell.api.pset.edit_pset(model, pset=pset, properties={
    'IsExternal': True,
    'LoadBearing': True,
    'FireRating': 'REI 120',
    'ThermalTransmittance': 0.24,
})

# === 11. Styles (Colors) ===
wall_style = ifcopenshell.api.style.add_style(model)
ifcopenshell.api.style.add_surface_style(
    model, style=wall_style, ifc_class='IfcSurfaceStyleShading',
    attributes={'Red': 0.75, 'Green': 0.73, 'Blue': 0.68})
ifcopenshell.api.style.assign_representation_styles(
    model, shape_representation=wall_repr, styles=[wall_style])

# === 12. Write File ===
model.write('/path/to/building.ifc')
```

### Key API Functions Summary

| Module | Function | Purpose |
|--------|----------|---------|
| `project` | `create_file()` | Create blank IFC model |
| `root` | `create_entity(model, ifc_class, name, predefined_type)` | Create any IFC entity |
| `unit` | `assign_unit(model)` | Set metric units |
| `context` | `add_context(model, context_type, ...)` | Create geometry context |
| `aggregate` | `assign_object(model, relating_object, products)` | Aggregate hierarchy |
| `spatial` | `assign_container(model, relating_structure, products)` | Spatial containment |
| `geometry` | `edit_object_placement(model, product, matrix)` | Position/rotate element |
| `geometry` | `add_wall_representation(model, context, length, height, thickness, ...)` | Wall geometry |
| `geometry` | `add_door_representation(model, context, overall_height, overall_width, ...)` | Door geometry |
| `geometry` | `add_window_representation(model, context, overall_height, overall_width, ...)` | Window geometry |
| `geometry` | `add_slab_representation(model, context, depth, ...)` | Slab geometry |
| `geometry` | `add_profile_representation(model, context, profile, depth)` | Profile extrusion |
| `geometry` | `add_railing_representation(model, context, railing_path, ...)` | Railing geometry |
| `geometry` | `add_mesh_representation(model, context, vertices, faces)` | Mesh geometry |
| `geometry` | `create_2pt_wall(model, element, context, p1, p2, ...)` | Wall between 2 points |
| `geometry` | `assign_representation(model, product, representation)` | Assign geometry to element |
| `feature` | `add_feature(model, feature, element)` | Creates IfcRelVoidsElement |
| `feature` | `add_filling(model, opening, element)` | Creates IfcRelFillsElement |
| `material` | `add_material(model, name, category)` | Create material |
| `material` | `add_material_set(model, name, set_type)` | Create layer/profile set |
| `material` | `add_layer(model, layer_set, material)` | Add layer to set |
| `material` | `assign_material(model, product, type, material)` | Assign to element |
| `pset` | `add_pset(model, product, name)` | Create property set |
| `pset` | `edit_pset(model, pset, properties)` | Set property values |
| `style` | `add_style(model)` | Create visual style |
| `style` | `add_surface_style(model, style, ifc_class, attributes)` | Set color/appearance |
| `style` | `assign_representation_styles(model, shape_representation, styles)` | Apply style |

### Geometry API Parameters Detail

#### add_wall_representation

```python
add_wall_representation(file, context, length=1.0, height=3.0,
    direction_sense='POSITIVE', offset=0.0, thickness=0.2,
    x_angle=0.0, clippings=None, booleans=None)
```

- `length`: Wall length in model units (meters)
- `height`: Wall height in model units
- `thickness`: Wall thickness
- `x_angle`: Slope angle in radians (for roof slabs)
- `clippings`: List of clipping plane definitions for boolean cuts

#### add_door_representation

```python
add_door_representation(file, context, overall_height=None, overall_width=None,
    operation_type='SINGLE_SWING_LEFT', lining_properties=None,
    panel_properties=None)
```

#### add_window_representation

```python
add_window_representation(file, context, overall_height=None, overall_width=None,
    partition_type='SINGLE_PANEL', lining_properties=None,
    panel_properties=None)
```

#### add_slab_representation

```python
add_slab_representation(file, context, depth=0.2, direction_sense='POSITIVE',
    offset=0.0, x_angle=0.0, clippings=None, polyline=None)
```

#### add_profile_representation

```python
add_profile_representation(file, context, profile, depth=1.0,
    cardinal_point=5, clippings=None, placement_zx_axes=(None, None))
```

For columns, beams, and custom-shaped elements. The profile is an IfcProfileDef entity.

#### add_railing_representation

```python
add_railing_representation(file, context, railing_type='WALL_MOUNTED_HANDRAIL',
    railing_path, use_manual_supports=False, support_spacing=None,
    railing_diameter=None, clear_width=None, terminal_type='180',
    height=None, looped_path=False)
```

### Creating Profiles Programmatically

```python
# Rectangle profile
profile = model.create_entity("IfcRectangleProfileDef",
    ProfileName="300x300", ProfileType="AREA", XDim=300, YDim=300)

# Circle profile
profile = model.create_entity("IfcCircleProfileDef",
    ProfileName="D300", ProfileType="AREA", Radius=150)

# I-Shape profile (steel)
profile = model.create_entity("IfcIShapeProfileDef",
    ProfileName="HEA200", ProfileType="AREA",
    OverallWidth=200, OverallDepth=400, WebThickness=10,
    FlangeThickness=15, FilletRadius=10)

# Arbitrary profile via ShapeBuilder
from ifcopenshell.util.shape_builder import ShapeBuilder, V
builder = ShapeBuilder(model)
outer = builder.polyline(
    [(0,0), (5000,0), (5000,3000), (2500,4500), (0,3000)], closed=True)
profile = builder.profile(outer, name="Gable")

# Extrude any profile
repr = ifcopenshell.api.geometry.add_profile_representation(
    model, context=body, profile=profile, depth=200)
```

### Rotation with Matrices

```python
import numpy
from ifcopenshell.util.placement import rotation

# Rotate 90 degrees around Z axis
matrix = rotation(90, "Z")
matrix[:, 3][0:3] = (x, y, z)  # set translation
ifcopenshell.api.geometry.edit_object_placement(model, product=element, matrix=matrix)

# Rotate 45 degrees around Z
matrix = rotation(45, "Z")
matrix[:, 3][0:3] = (2.0, 1.0, 0.0)

# For roof slope: rotate around X axis
matrix = rotation(30, "X")  # 30 degree pitch
matrix[:, 3][0:3] = (0, 0, wall_height)
```

---

## 8. Material Layer Configuration

### IfcMaterialLayerSetUsage

Controls how material layers are positioned relative to the element's reference axis.

```
ENTITY IfcMaterialLayerSetUsage
  SUBTYPE OF (IfcMaterialUsageDefinition);
    ForLayerSet : IfcMaterialLayerSet;
    LayerSetDirection : IfcLayerSetDirectionEnum;  -- AXIS1, AXIS2, or AXIS3
    DirectionSense : IfcDirectionSenseEnum;        -- POSITIVE or NEGATIVE
    OffsetFromReferenceLine : IfcLengthMeasure;
    ReferenceExtent : OPTIONAL IfcPositiveLengthMeasure;
END_ENTITY;
```

**For walls:**
- `LayerSetDirection` = AXIS2 (perpendicular to wall axis)
- `DirectionSense` = POSITIVE (layers grow in +Y direction from reference)
- `OffsetFromReferenceLine` = distance from wall axis to first layer edge
  - For centered wall: offset = -(total_thickness / 2)
  - For left-aligned: offset = 0
  - For right-aligned: offset = -total_thickness

**For slabs:**
- `LayerSetDirection` = AXIS3 (perpendicular to slab plane, i.e., Z)
- `DirectionSense` = POSITIVE (layers grow upward)

### Example: Cavity Wall Material Layers

```python
# Materials
finish_brick = ifcopenshell.api.material.add_material(model, name='Face Brick')
insulation = ifcopenshell.api.material.add_material(model, name='Insulation')
inner_block = ifcopenshell.api.material.add_material(model, name='Concrete Block')

# Layer set
layerset = ifcopenshell.api.material.add_material_set(
    model, name='Cavity Wall - 300mm', set_type='IfcMaterialLayerSet')

# Add layers (order matters: outside to inside)
l1 = ifcopenshell.api.material.add_layer(model, layer_set=layerset, material=finish_brick)
ifcopenshell.api.material.edit_layer(model, layer=l1, attributes={'LayerThickness': 0.11})

l2 = ifcopenshell.api.material.add_layer(model, layer_set=layerset, material=insulation)
ifcopenshell.api.material.edit_layer(model, layer=l2, attributes={
    'LayerThickness': 0.08, 'IsVentilated': True})

l3 = ifcopenshell.api.material.add_layer(model, layer_set=layerset, material=inner_block)
ifcopenshell.api.material.edit_layer(model, layer=l3, attributes={'LayerThickness': 0.11})

# Assign to wall
ifcopenshell.api.material.assign_material(
    model, product=wall, type='IfcMaterialLayerSet', material=layerset)
```

---

## Sources

- [BuildingSMART IFC4 Documentation](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/HTML/)
- [IfcOpenShell Code Examples](https://docs.ifcopenshell.org/ifcopenshell-python/code_examples.html)
- [IfcOpenShell Geometry Creation](https://docs.ifcopenshell.org/ifcopenshell-python/geometry_creation.html)
- [IfcOpenShell API - geometry](https://docs.ifcopenshell.org/autoapi/ifcopenshell/api/geometry/index.html)
- [IfcOpenShell API - feature (openings/fillings)](https://docs.ifcopenshell.org/autoapi/ifcopenshell/api/feature/index.html)
- [IfcOpenHouse Tutorial](https://cvillagrasa.github.io/IfcOpenHouse/generation.html)
- [BuildingSMART Wall.ifc Example](https://github.com/BuildingSMART/IfcScript/blob/master/Examples/Wall.ifc)
- [BuildingSMART Wall with Opening and Window](https://standards.buildingsmart.org/IFC/DEV/IFC4_2/FINAL/HTML/annex/annex-e/wall-with-opening-and-window.htm)
- [IfcWallStandardCase](https://standards.buildingsmart.org/IFC/DEV/IFC4_2/FINAL/HTML/schema/ifcsharedbldgelements/lexical/ifcwallstandardcase.htm)
- [IfcDoor](https://standards.buildingsmart.org/IFC/DEV/IFC4_2/FINAL/HTML/schema/ifcsharedbldgelements/lexical/ifcdoor.htm)
- [IfcWindow](https://standards.buildingsmart.org/IFC/DEV/IFC4_2/FINAL/HTML/schema/ifcsharedbldgelements/lexical/ifcwindow.htm)
- [IfcSlab](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcSlab.htm)
- [IfcStairFlight](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2/HTML/schema/ifcsharedbldgelements/lexical/ifcstairflight.htm)
- [IfcStair](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD1/HTML/schema/ifcsharedbldgelements/lexical/ifcstair.htm)
- [IfcRoof](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcRoof.htm)
- [IfcRoofTypeEnum](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2/HTML/schema/ifcsharedbldgelements/lexical/ifcrooftypeenum.htm)
- [IfcSpace](https://standards.buildingsmart.org/IFC/DEV/IFC4_2/FINAL/HTML/schema/ifcproductextension/lexical/ifcspace.htm)
- [IfcBuildingStorey](https://standards.buildingsmart.org/IFC/DEV/IFC4_2/FINAL/HTML/schema/ifcproductextension/lexical/ifcbuildingstorey.htm)
- [IfcExtrudedAreaSolid](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcExtrudedAreaSolid.htm)
- [IfcBooleanClippingResult](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD1/HTML/schema/ifcgeometricmodelresource/lexical/ifcbooleanclippingresult.htm)
- [IfcMaterialLayerSetUsage](https://standards.buildingsmart.org/IFC/DEV/IFC4_2/FINAL/HTML/schema/ifcmaterialresource/lexical/ifcmateriallayersetusage.htm)
- [IfcDoorLiningProperties](https://standards.buildingsmart.org/IFC/DEV/IFC4_2/FINAL/HTML/schema/ifcarchitecturedomain/lexical/ifcdoorliningproperties.htm)
- [IfcRelFillsElement](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcRelFillsElement.htm)
- [IfcRelVoidsElement](https://standards.buildingsmart.org/IFC/DEV/IFC4_2/FINAL/HTML/schema/ifcproductextension/lexical/ifcrelvoidselement.htm)
- [Pset_WallCommon](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/Pset_WallCommon.htm)
- [Pset_DoorCommon](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/Pset_DoorCommon.htm)
- [100 Architecture Dimensions](https://postdigitalarchitecture.com/blogs/articles/the-100-golden-dimensions-every-architect-should-know-by-heart)
- [Standard Building Dimensions](https://civiconcepts.com/blog/building-dimensions-standard)
- [xBim Wall Example](https://docs.xbim.net/examples/proper-wall-in-3d.html)

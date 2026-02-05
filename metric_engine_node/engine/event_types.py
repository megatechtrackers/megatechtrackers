"""
Plan § 7.7: Event category and event type constants (single source; must match METRIC_CATALOG.md metric_events).
Calculators should use these constants so new event types are added in one place.
"""

# event_category values (METRIC_CATALOG.md § metric_events)
EVENT_CATEGORY_HARSH = "Harsh"
EVENT_CATEGORY_SPEED = "Speed"
EVENT_CATEGORY_FENCE = "Fence"
EVENT_CATEGORY_FUEL = "Fuel"
EVENT_CATEGORY_IDLE = "Idle"
EVENT_CATEGORY_SENSOR = "Sensor"
EVENT_CATEGORY_SEATBELT = "Seatbelt"
EVENT_CATEGORY_DRIVING = "Driving"
EVENT_CATEGORY_ROUTE = "Route"

# event_type values by category (METRIC_CATALOG.md)
EVENT_TYPE_HARSH_BRAKE = "Harsh_Brake"
EVENT_TYPE_HARSH_ACCEL = "Harsh_Accel"
EVENT_TYPE_HARSH_CORNER = "Harsh_Corner"
EVENT_TYPE_OVERSPEED = "Overspeed"
EVENT_TYPE_UNDERSPEED = "Underspeed"
EVENT_TYPE_FENCE_ENTER = "Fence_Enter"
EVENT_TYPE_FENCE_EXIT = "Fence_Exit"
EVENT_TYPE_FUEL_FILL = "Fuel_Fill"
EVENT_TYPE_FUEL_THEFT = "Fuel_Theft"
EVENT_TYPE_IDLE_VIOLATION = "Idle_Violation"
EVENT_TYPE_TEMP_HIGH = "Temp_High"
EVENT_TYPE_TEMP_LOW = "Temp_Low"
EVENT_TYPE_HUMIDITY_HIGH = "Humidity_High"
EVENT_TYPE_HUMIDITY_LOW = "Humidity_Low"
EVENT_TYPE_SENSOR_STUCK = "Sensor_Stuck"
EVENT_TYPE_SEATBELT_VIOLATION = "Seatbelt_Violation"
EVENT_TYPE_CONTINUOUS_DRIVING_VIOLATION = "Continuous_Driving_Violation"
EVENT_TYPE_REST_TIME_VIOLATION = "Rest_Time_Violation"
EVENT_TYPE_NIGHT_DRIVING = "Night_Driving"
EVENT_TYPE_ROUTE_DEVIATION = "Route_Deviation"
EVENT_TYPE_WAYPOINT_MISSED = "Waypoint_Missed"
EVENT_TYPE_ETA_VIOLATION = "ETA_Violation"

# All categories (for recalc/delete by category)
EVENT_CATEGORIES_ALL: tuple = (
    EVENT_CATEGORY_HARSH,
    EVENT_CATEGORY_SPEED,
    EVENT_CATEGORY_FENCE,
    EVENT_CATEGORY_FUEL,
    EVENT_CATEGORY_IDLE,
    EVENT_CATEGORY_SENSOR,
    EVENT_CATEGORY_SEATBELT,
    EVENT_CATEGORY_DRIVING,
    EVENT_CATEGORY_ROUTE,
)

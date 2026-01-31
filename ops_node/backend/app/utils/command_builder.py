"""Command Building Utilities

Command Building Logic:
1. StartCharacter - Direct concatenation
2. commandid - Direct concatenation
3. ALL configurable values - Joined with CommandSeparator
4. Add separator at END after last configurable value
5. EndCharacter handling:
   - NoComma: Remove trailing separator
   - NoComma#: Remove trailing separator, add #
   - Any other value: Replace trailing separator with that value
   - No EndCharacter: Keep trailing separator
"""
from typing import Optional, Any, Union, List, Dict
import json
from app.models import DeviceConfig, Unit, UnitConfig
from sqlalchemy.ext.asyncio import AsyncSession


def build_command_text(
    config: DeviceConfig,
    value: Optional[Union[str, List[str], Dict[str, str]]] = None,
    unit: Optional[Unit] = None,
    db: Optional[AsyncSession] = None,
    unit_config: Optional[UnitConfig] = None
) -> str:
    """
    Build command text from command_parameters_json.
    
    Logic:
    1. StartCharacter - Direct concatenation
    2. commandid - Direct concatenation
    3. ALL configurable values - Joined with CommandSeparator
    4. Add separator at END after last value
    5. EndCharacter handling
    
    Args:
        config: DeviceConfig with command_seprator and command_parameters_json (note: typo in DB column name)
        value: Optional value(s) - can be:
            - str: Single value or JSON array string
            - List[str]: Multiple values in order
            - Dict[str, str]: Values by parameter name
        unit: Optional Unit to add username/password from
        db: Optional database session (unused, for interface compatibility)
        unit_config: Optional UnitConfig to load saved values from
    
    Returns:
        Built command text string
    """
    # Get separator (default to comma) - note: typo in DB column name (command_seprator)
    separator = config.command_seprator if config.command_seprator else ","
    
    # If command_parameters_json exists, use it to build command
    if config.command_parameters_json and isinstance(config.command_parameters_json, list):
        params = config.command_parameters_json
        
        # Extract parts by parameter name
        start_character = ""
        command_id = ""
        end_character = ""
        
        # Track configurable parameters (in order) - ORDER IS CRITICAL for command building
        # CommandParametersJSON is ordered by CommandDetail.ID, and we must preserve this order
        configurable_indices = []
        
        for i, param in enumerate(params):
            if not isinstance(param, dict):
                continue
            param_name = param.get("ParameterName", "").lower()
            param_type = str(param.get("ParameterType", ""))
            default_value = param.get("DefaultValue", "")
            
            if param_type == "1":
                # Fixed parameter - extract by name
                if param_name == "startcharacter":
                    start_character = str(default_value) if default_value else ""
                elif param_name == "commandid":
                    command_id = str(default_value) if default_value else ""
                elif param_name == "endcharacter":
                    end_character = str(default_value) if default_value else ""
            elif param_type == "2":
                # Configurable parameter - track index to preserve order from CommandParametersJSON
                configurable_indices.append(i)
        
        # Get ALL values for configurable parameters
        configurable_values = _get_configurable_values(
            params, configurable_indices, value, unit_config
        )
        
        # Build command:
        # StartCharacter + commandid + configurableValues.join(separator) + separator
        result = start_character + command_id
        
        if configurable_values:
            # Join all configurable values with separator
            result += separator.join(configurable_values)
            # Add trailing separator
            result += separator
        
        # Handle EndCharacter special cases
        if end_character:
            end_char_lower = end_character.lower().strip()
            if end_char_lower == "nocomma":
                # Remove last separator
                if result.endswith(separator):
                    result = result[:-len(separator)]
            elif end_char_lower == "nocomma#":
                # Remove last separator and add #
                if result.endswith(separator):
                    result = result[:-len(separator)]
                result += "#"
            else:
                # Replace trailing separator with EndCharacter
                if result.endswith(separator):
                    result = result[:-len(separator)]
                result += end_character
        else:
            # No EndCharacter - remove trailing separator (matches original backend)
            if result.endswith(separator):
                result = result[:-len(separator)]
        
        command_text = result.strip()
    
    else:
        # No command_parameters_json - use command_syntax directly (for direct commands)
        # This is how the original system handles commands without parameters
        if config.command_syntax:
            command_text = config.command_syntax
        elif hasattr(config, 'command_name') and config.command_name:
            # Fallback to command_name if no syntax available
            command_text = config.command_name
        else:
            raise ValueError("Config has no command_parameters_json or command_syntax")
    
    return command_text


def _get_configurable_values(
    params: list,
    configurable_indices: List[int],
    value: Optional[Union[str, List[str], Dict[str, str]]],
    unit_config: Optional[UnitConfig]
) -> List[str]:
    """
    Extract ALL configurable values from user input or saved unit_config.
    Returns a list of values in order of configurable parameters.
    """
    num_configurable = len(configurable_indices)
    
    if num_configurable == 0:
        return []
    
    configurable_values = []
    
    if value is not None:
        # User provided value(s)
        if isinstance(value, dict):
            # Dict: map by parameter name (case-insensitive)
            for idx in configurable_indices:
                param = params[idx]
                param_name = param.get("ParameterName", "").lower()
                configurable_values.append(
                    str(value.get(param_name, param.get("DefaultValue", "")))
                )
        elif isinstance(value, list):
            # List: use in order
            for i, idx in enumerate(configurable_indices):
                param = params[idx]
                if i < len(value):
                    configurable_values.append(str(value[i]))
                else:
                    configurable_values.append(str(param.get("DefaultValue", "")))
        else:
            # Single string value - parse it
            configurable_values = _parse_string_value(
                str(value), params, configurable_indices
            )
    elif unit_config and unit_config.value:
        # Load from unit_config (JSON array stored)
        configurable_values = _parse_string_value(
            unit_config.value, params, configurable_indices
        )
    else:
        # Use defaults from parameters
        for idx in configurable_indices:
            param = params[idx]
            configurable_values.append(str(param.get("DefaultValue", "")))
    
    return configurable_values


def _parse_string_value(
    value_str: str,
    params: list,
    configurable_indices: List[int]
) -> List[str]:
    """
    Parse a value string into configurable values.
    Handles:
    - JSON array with ParameterID: [{"ParameterID": 123, "Value": "val1"}, ...]
    - Simple JSON array: ["val1", "val2", "val3"]
    - Plain string: "val1" (single value for single-param commands)
    - Comma-separated: "val1,val2,val3" (multiple values for multi-param commands)
    """
    num_configurable = len(configurable_indices)
    
    # First, try to parse as JSON
    try:
        parsed = json.loads(value_str)
        
        if isinstance(parsed, list) and len(parsed) > 0:
            # Check if it's the ParameterID format: [{"ParameterID": 123, "Value": "val1"}, ...]
            if isinstance(parsed[0], dict) and "ParameterID" in parsed[0]:
                # Build a map by ParameterID for efficient lookup
                value_map = {
                    item.get("ParameterID"): item.get("Value") 
                    for item in parsed if isinstance(item, dict)
                }
                # Extract values in order of configurable parameters
                configurable_values = []
                for idx in configurable_indices:
                    param = params[idx]
                    param_id = param.get("ParameterID")
                    if param_id and param_id in value_map:
                        configurable_values.append(str(value_map[param_id] or ""))
                    else:
                        configurable_values.append(str(param.get("DefaultValue", "")))
                return configurable_values
            
            # Simple array of values: ["val1", "val2", ...]
            configurable_values = []
            for i, idx in enumerate(configurable_indices):
                param = params[idx]
                if i < len(parsed):
                    configurable_values.append(str(parsed[i] or ""))
                else:
                    configurable_values.append(str(param.get("DefaultValue", "")))
            return configurable_values
        
        # JSON parsed to a scalar (number, boolean, etc.) - use it as single value
        if not isinstance(parsed, (dict, list)):
            # Single value - use it for the first configurable param, defaults for rest
            configurable_values = []
            for i, idx in enumerate(configurable_indices):
                param = params[idx]
                if i == 0:
                    configurable_values.append(str(parsed))
                else:
                    configurable_values.append(str(param.get("DefaultValue", "")))
            return configurable_values
            
    except (json.JSONDecodeError, TypeError):
        pass
    
    # Plain string handling
    # For single-param commands: use the string directly
    # For multi-param commands: try comma-separated (heuristic)
    if num_configurable == 1:
        # Single param: use entire string as the value
        return [value_str]
    
    # Multi-param: try comma-separated split
    # Note: This is a heuristic - if values contain commas, this won't work correctly
    # The proper format should be JSON array
    parts = value_str.split(",")
    configurable_values = []
    for i, idx in enumerate(configurable_indices):
        param = params[idx]
        if i < len(parts):
            configurable_values.append(parts[i].strip())
        else:
            configurable_values.append(str(param.get("DefaultValue", "")))
    return configurable_values

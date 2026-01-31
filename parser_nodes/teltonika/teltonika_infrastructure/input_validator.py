"""
Input validation and sanitization utilities for Teltonika Gateway
Security-focused input validation to prevent injection attacks
"""
import re
import logging
from typing import Optional, Any

logger = logging.getLogger(__name__)

# IMEI validation: 15 digits, numeric only
IMEI_PATTERN = re.compile(r'^\d{15}$')

# Command data validation: alphanumeric, spaces, and common command characters
COMMAND_DATA_PATTERN = re.compile(r'^[a-zA-Z0-9\s\-\_\.\:]+$')


def validate_imei(imei: Any) -> Optional[str]:
    """
    Validate and sanitize IMEI input.
    
    Args:
        imei: IMEI value (string, int, or other)
        
    Returns:
        Validated IMEI string (15 digits) or None if invalid
        
    Security:
        - Only allows numeric IMEI (15 digits)
        - Prevents injection attacks
        - Handles various input types safely
    """
    if imei is None:
        return None
    
    # Convert to string and strip whitespace
    imei_str = str(imei).strip()
    
    # Remove any non-numeric characters (defensive)
    imei_clean = re.sub(r'[^\d]', '', imei_str)
    
    # Validate length and format
    if not IMEI_PATTERN.match(imei_clean):
        logger.warning(f"Invalid IMEI format: {imei} (cleaned: {imei_clean})")
        return None
    
    return imei_clean


def sanitize_command_data(command_data: Any) -> Optional[str]:
    """
    Sanitize command data input.
    
    Args:
        command_data: Command data string
        
    Returns:
        Sanitized command data or None if invalid
        
    Security:
        - Allows alphanumeric, spaces, and safe command characters
        - Prevents injection attacks
        - Limits length to prevent DoS
    """
    if command_data is None:
        return None
    
    command_str = str(command_data).strip()
    
    # Limit length to prevent DoS (max 1000 characters)
    if len(command_str) > 1000:
        logger.warning(f"Command data too long: {len(command_str)} characters, truncating")
        command_str = command_str[:1000]
    
    # Validate pattern
    if not COMMAND_DATA_PATTERN.match(command_str):
        logger.warning(f"Invalid command data format: {command_data[:50]}...")
        # Return sanitized version (remove dangerous characters)
        sanitized = re.sub(r'[^a-zA-Z0-9\s\-\_\.\:]', '', command_str)
        return sanitized if sanitized else None
    
    return command_str


def validate_port(port: Any) -> Optional[int]:
    """
    Validate port number.
    
    Args:
        port: Port number (int, string, or other)
        
    Returns:
        Valid port number (1-65535) or None if invalid
    """
    try:
        port_int = int(port)
        if 1 <= port_int <= 65535:
            return port_int
        else:
            logger.warning(f"Port out of range: {port_int}")
            return None
    except (ValueError, TypeError):
        logger.warning(f"Invalid port format: {port}")
        return None


def sanitize_string_input(value: Any, max_length: int = 255, allow_empty: bool = True) -> Optional[str]:
    """
    Generic string sanitization.
    
    Args:
        value: Input value
        max_length: Maximum allowed length
        allow_empty: Whether to allow empty strings
        
    Returns:
        Sanitized string or None if invalid
    """
    if value is None:
        return None if not allow_empty else ""
    
    value_str = str(value).strip()
    
    if not allow_empty and not value_str:
        return None
    
    if len(value_str) > max_length:
        logger.warning(f"String input too long: {len(value_str)} characters, truncating to {max_length}")
        value_str = value_str[:max_length]
    
    return value_str

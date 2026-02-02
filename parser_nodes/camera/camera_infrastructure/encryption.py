"""
Encryption utility for CMS credentials and sensitive configuration data
Compatible with Alarm Service encryption (AES-256-GCM)
"""
import os
import base64
import hashlib
import logging
import secrets
from typing import Optional

logger = logging.getLogger(__name__)

# Try to import cryptography
try:
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    from cryptography.hazmat.backends import default_backend
    HAS_CRYPTOGRAPHY = True
except ImportError:
    HAS_CRYPTOGRAPHY = False
    logger.warning("cryptography package not installed - encryption disabled")


def _get_encryption_key() -> bytes:
    """
    Get encryption key from environment variable.
    Uses scrypt to derive a 32-byte key (compatible with Node.js crypto.scryptSync)
    
    IMPORTANT: Node.js uses different salts:
    - Default key (no CONFIG_ENCRYPTION_KEY): salt = 'salt'
    - With CONFIG_ENCRYPTION_KEY: salt = 'encryption-salt'
    """
    key = os.environ.get('CONFIG_ENCRYPTION_KEY', '')
    
    if not key:
        logger.warning('CONFIG_ENCRYPTION_KEY not set! Using insecure default key.')
        key = 'default-dev-key-change-in-production'
        salt = b'salt'  # Node.js uses 'salt' for default key
    else:
        salt = b'encryption-salt'  # Node.js uses 'encryption-salt' when key is set
    
    # Derive key using scrypt (compatible with Node.js crypto.scryptSync)
    # Parameters match Node.js defaults: N=16384, r=8, p=1
    derived = hashlib.scrypt(
        key.encode('utf-8'),
        salt=salt,
        n=16384,
        r=8,
        p=1,
        dklen=32
    )
    return derived


def encrypt(plaintext: str) -> Optional[str]:
    """
    Encrypt a string using AES-256-GCM.
    
    Args:
        plaintext: The string to encrypt
        
    Returns:
        Encrypted string in format: iv:authTag:encrypted (all base64)
        Returns None if encryption fails
    """
    if not HAS_CRYPTOGRAPHY:
        logger.warning("Encryption unavailable - cryptography not installed")
        return None
    
    if not plaintext:
        return ''
    
    try:
        # Generate random IV
        iv = secrets.token_bytes(12)  # 96-bit IV for GCM
        
        # Get the key
        key = _get_encryption_key()
        
        # Encrypt using AES-256-GCM
        cipher = Cipher(
            algorithms.AES(key),
            modes.GCM(iv),
            backend=default_backend()
        )
        encryptor = cipher.encryptor()
        encrypted = encryptor.update(plaintext.encode('utf-8')) + encryptor.finalize()
        
        # Get authentication tag
        auth_tag = encryptor.tag
        
        # Encode to base64 and format as iv:authTag:encrypted
        iv_b64 = base64.b64encode(iv).decode('utf-8')
        auth_tag_b64 = base64.b64encode(auth_tag).decode('utf-8')
        encrypted_b64 = base64.b64encode(encrypted).decode('utf-8')
        
        return f"{iv_b64}:{auth_tag_b64}:{encrypted_b64}"
        
    except Exception as e:
        logger.error(f"Encryption error: {type(e).__name__}: {e}")
        return None


def decrypt(encrypted_data: str) -> str:
    """
    Decrypt an encrypted string.
    
    Args:
        encrypted_data: Encrypted string in format: iv:authTag:encrypted (all base64)
        
    Returns:
        Decrypted plaintext string
        Returns original data if decryption fails (might be plaintext)
    """
    if not encrypted_data:
        return ''
    
    # If encryption is not available, return as-is
    if not HAS_CRYPTOGRAPHY:
        return encrypted_data
    
    try:
        # Parse the encrypted data
        parts = encrypted_data.split(':')
        if len(parts) != 3:
            logger.debug('Data not in encrypted format, returning as-is')
            return encrypted_data  # Return as-is if not encrypted
        
        iv_b64, auth_tag_b64, encrypted_b64 = parts
        
        # Decode from base64
        iv = base64.b64decode(iv_b64)
        auth_tag = base64.b64decode(auth_tag_b64)
        encrypted = base64.b64decode(encrypted_b64)
        
        # Get the key
        key = _get_encryption_key()
        
        # Decrypt using AES-256-GCM
        cipher = Cipher(
            algorithms.AES(key),
            modes.GCM(iv, auth_tag),
            backend=default_backend()
        )
        decryptor = cipher.decryptor()
        decrypted = decryptor.update(encrypted) + decryptor.finalize()
        
        return decrypted.decode('utf-8')
    
    except Exception as e:
        logger.debug(f'Decryption failed (might be plaintext): {type(e).__name__}')
        # Return as-is if decryption fails (might be plaintext)
        return encrypted_data


def is_encrypted(data: str) -> bool:
    """
    Check if a string appears to be encrypted.
    
    Args:
        data: String to check
        
    Returns:
        True if the string appears to be in encrypted format
    """
    if not data:
        return False
    
    parts = data.split(':')
    if len(parts) != 3:
        return False
    
    # Check if all parts are valid base64
    try:
        for part in parts:
            decoded = base64.b64decode(part)
            # IV should be 12 bytes, auth tag should be 16 bytes
            if len(decoded) == 0:
                return False
        return True
    except Exception:
        return False


def decrypt_password(password: str) -> str:
    """
    Decrypt a password if it's encrypted, otherwise return as-is.
    
    This is a convenience function for CMS password handling.
    
    Args:
        password: Password string (may be encrypted or plaintext)
        
    Returns:
        Decrypted password (or original if not encrypted)
    """
    if is_encrypted(password):
        return decrypt(password)
    return password


def encrypt_if_not_encrypted(password: str) -> Optional[str]:
    """
    Encrypt a password if it's not already encrypted.
    
    This is a convenience function for CMS password handling.
    
    Args:
        password: Password string (may be encrypted or plaintext)
        
    Returns:
        Encrypted password (or original if already encrypted, None on error)
    """
    if is_encrypted(password):
        return password
    return encrypt(password)

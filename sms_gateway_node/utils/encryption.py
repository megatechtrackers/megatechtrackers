"""
Encryption utility for sensitive configuration data
Compatible with Alarm Service encryption (alarm_node folder). AES-256-GCM.
"""
import os
import base64
import hashlib
import logging
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

logger = logging.getLogger(__name__)


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


def decrypt(encrypted_data: str) -> str:
    """
    Decrypt an encrypted string.
    Expects format: iv:authTag:encrypted (all base64)
    Compatible with Alarm Service encryption (alarm_node folder).
    """
    if not encrypted_data:
        return ''
    
    try:
        # Parse the encrypted data
        parts = encrypted_data.split(':')
        if len(parts) != 3:
            logger.warning('Invalid encrypted data format, returning as-is')
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
        logger.error(f'Decryption error: {type(e).__name__}: {e}')
        import traceback
        logger.debug(f'Decryption traceback: {traceback.format_exc()}')
        # Return as-is if decryption fails (might be plaintext)
        return encrypted_data


def is_encrypted(data: str) -> bool:
    """
    Check if a string appears to be encrypted.
    (Simple check: has the format iv:authTag:encrypted)
    """
    if not data:
        return False
    
    parts = data.split(':')
    if len(parts) != 3:
        return False
    
    # Check if all parts are valid base64
    try:
        for part in parts:
            base64.b64decode(part)
        return True
    except Exception:
        return False

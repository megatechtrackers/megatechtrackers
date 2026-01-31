#!/usr/bin/env python3
"""
Helper script to get the SSL certificate fingerprint from your Teltonika RUT200
Run this to get the cert_fingerprint value for your database configuration
"""

import ssl
import socket
import hashlib
import sys

def get_certificate_fingerprint(hostname: str, port: int = 443) -> str:
    """
    Get the SHA256 fingerprint of the server's SSL certificate.
    
    Args:
        hostname: The IP address or hostname of your RUT200
        port: HTTPS port (usually 443)
    
    Returns:
        Certificate fingerprint in format: AA:BB:CC:DD:...
    """
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE  # Don't verify, just get the cert
    
    try:
        with socket.create_connection((hostname, port), timeout=10) as sock:
            with context.wrap_socket(sock, server_hostname=hostname) as secure_sock:
                cert_der = secure_sock.getpeercert(binary_form=True)
                
                # Calculate SHA256 fingerprint
                fingerprint = hashlib.sha256(cert_der).hexdigest().upper()
                
                # Format as AA:BB:CC:DD:...
                formatted = ':'.join(fingerprint[i:i+2] for i in range(0, len(fingerprint), 2))
                
                return formatted
    except Exception as e:
        raise Exception(f"Failed to get certificate from {hostname}:{port} - {str(e)}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python get_rut200_fingerprint.py <hostname_or_ip> [port]")
        print("")
        print("Examples:")
        print("  python get_rut200_fingerprint.py 192.168.1.101")
        print("  python get_rut200_fingerprint.py 192.168.1.101 443")
        print("")
        sys.exit(1)
    
    hostname = sys.argv[1]
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 443
    
    print(f"Connecting to {hostname}:{port}...")
    print("")
    
    try:
        fingerprint = get_certificate_fingerprint(hostname, port)
        
        print("=" * 80)
        print("SUCCESS! Certificate fingerprint retrieved:")
        print("=" * 80)
        print("")
        print(fingerprint)
        print("")
        print("=" * 80)
        print("")
        print("Copy this fingerprint and update your database:")
        print("")
        print("1. Via UI (Recommended):")
        print("   - Go to http://localhost:3004/config")
        print("   - Click 'SMS Modems' tab")
        print("   - Edit 'Real Teltonika RUT200 #1'")
        print(f"   - Paste fingerprint: {fingerprint}")
        print("")
        print("2. Via SQL:")
        print("   UPDATE alarms_sms_modems")
        print(f"   SET cert_fingerprint = '{fingerprint}'")
        print("   WHERE name = 'Real Teltonika RUT200 #1';")
        print("")
        
    except Exception as e:
        print("=" * 80)
        print("ERROR!")
        print("=" * 80)
        print("")
        print(str(e))
        print("")
        print("Troubleshooting:")
        print("  - Check that the RUT200 is accessible at this IP")
        print("  - Verify HTTPS is enabled on the device")
        print("  - Check firewall settings")
        print("  - Try accessing https://{hostname} in your browser")
        print("")
        sys.exit(1)


if __name__ == "__main__":
    main()

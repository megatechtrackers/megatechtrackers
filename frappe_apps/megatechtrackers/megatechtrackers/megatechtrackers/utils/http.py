"""
HTTP utility functions for Megatechtrackers
"""
import frappe


def after_request(response):
    """
    Modify response headers to allow iframe embedding from Next.js app.
    This enables Frappe forms to be embedded in iframes from localhost:3002.
    """
    # Allow embedding from local dev apps.
    # In production, replace/override with actual domains.
    #
    # NOTE: Expo web runs on a dynamic port (19000+). We allow localhost:* to avoid port-chasing.
    allowed_origins = [
        "http://localhost:3002",
        "https://localhost:3002",  # HTTPS variant
        "http://127.0.0.1:3002",
        "https://127.0.0.1:3002",
        # Expo web / local dev ports
        "http://localhost:*",
        "https://localhost:*",
        "http://127.0.0.1:*",
        "https://127.0.0.1:*",
    ]
    
    # Get Next.js URL from site config if available, otherwise use defaults
    nextjs_url = frappe.conf.get("nextjs_url") or frappe.conf.get("NEXTJS_URL")
    if nextjs_url:
        allowed_origins.append(nextjs_url)
        # Also add HTTPS variant if HTTP was provided
        if nextjs_url.startswith("http://"):
            allowed_origins.append(nextjs_url.replace("http://", "https://"))
    
    # Allow overriding/adding frame ancestors via site config if needed.
    extra = frappe.conf.get("frame_ancestors") or frappe.conf.get("FRAME_ANCESTORS")
    if extra:
        # Accept comma- or space-separated
        for token in str(extra).replace(",", " ").split():
            if token and token not in allowed_origins:
                allowed_origins.append(token)

    # Set Content-Security-Policy frame-ancestors to allow embedding
    # This is the modern way to control iframe embedding (replaces X-Frame-Options)
    frame_ancestors = " ".join(allowed_origins)
    csp_value = f"frame-ancestors 'self' {frame_ancestors}"
    
    # Set the header
    response.headers["Content-Security-Policy"] = csp_value
    
    # Also remove or relax X-Frame-Options if it's set to DENY
    # (Content-Security-Policy takes precedence, but we'll set it to SAMEORIGIN for compatibility)
    if "X-Frame-Options" in response.headers:
        if response.headers["X-Frame-Options"] == "DENY":
            response.headers["X-Frame-Options"] = "SAMEORIGIN"
    
    return response

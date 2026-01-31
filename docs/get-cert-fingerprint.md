# How to Get Your RUT200 Certificate Fingerprint

## Why Do You Need This?

The Teltonika RUT200 uses **HTTPS with a self-signed certificate**. For security, we verify the certificate fingerprint to prevent man-in-the-middle attacks.

**Without the correct fingerprint, the SMS client will not connect to your RUT200!**

---

## Method 1: Use the Helper Script (Easiest)

### Step 1: Navigate to tools directory
```bash
cd C:\hdd\.mov\myapps\megatechtrackers\tools
```

### Step 2: Run the script with your RUT200 IP
```bash
python get_rut200_fingerprint.py 192.168.1.101
```

**Replace `192.168.1.101` with your actual RUT200 IP address!**

### Step 3: Copy the fingerprint
You'll see output like:
```
================================================================================
SUCCESS! Certificate fingerprint retrieved:
================================================================================

3E:8C:8F:95:49:1E:85:E4:22:6E:81:F7:79:88:91:17:F0:02:38:9B:89:09:77:AE:55:D4:0A:93:4E:3B:8F:6A

================================================================================
```

Copy that fingerprint!

---

## Method 2: Use sms-test Client

If you already have `sms-test` working:

### Step 1: Open Python REPL
```bash
cd C:\hdd\.mov\myapps\sms-test
python
```

### Step 2: Run this code
```python
from sms_client import SMSClient

# Create client with your RUT200 details
client = SMSClient(
    url="https://192.168.1.101",  # Your RUT200 IP
    username="admin",
    password="your_password"
)

# Get the fingerprint
fingerprint = client._get_certificate_fingerprint("192.168.1.101")
print(f"Fingerprint: {fingerprint}")
```

### Step 3: Copy the fingerprint from output

---

## Method 3: From sms-test Example Code

Check your `sms-test/sms_client.py` file around line 322:
```python
DEVICE_URL = "https://192.168.1.101"
```

If you've already tested with certificate verification, the fingerprint should be in your code or logs.

---

## Method 4: Using OpenSSL (Advanced)

```bash
# Get certificate
openssl s_client -connect 192.168.1.101:443 -showcerts < /dev/null 2>/dev/null | \
  openssl x509 -outform DER | \
  openssl dgst -sha256 -hex | \
  awk '{print toupper($2)}' | \
  sed 's/../&:/g;s/:$//'
```

---

## Update Your Database Configuration

### Option A: Via UI (Recommended)

1. Go to: http://localhost:3004/config
2. Click **"SMS Modems"** tab
3. Click **Edit** on "Real Teltonika RUT200 #1"
4. Paste your fingerprint in **"Certificate Fingerprint"** field
5. Click **Save**

### Option B: Via SQL

```sql
-- Connect to database
docker exec -it postgres-primary psql -U postgres -d tracking_db

-- Update the fingerprint
UPDATE alarms_sms_modems 
SET cert_fingerprint = '3E:8C:8F:95:49:1E:85:E4:22:6E:81:F7:79:88:91:17:F0:02:38:9B:89:09:77:AE:55:D4:0A:93:4E:3B:8F:6A'
WHERE name = 'Real Teltonika RUT200 #1';

-- Verify
SELECT name, host, cert_fingerprint FROM alarms_sms_modems;
```

**Replace with YOUR actual fingerprint!**

---

## Important Notes

⚠️ **The fingerprint in the database is just a PLACEHOLDER/EXAMPLE**

You MUST replace it with your actual RUT200's certificate fingerprint!

### Why?
- Each RUT200 has a **unique self-signed certificate**
- The fingerprint verifies you're connecting to YOUR specific device
- Using the wrong fingerprint = connection will fail
- Using NULL = less secure (skips verification)

### When to Update?
- ✅ **Before enabling the real modem** in production
- ✅ After replacing/resetting your RUT200
- ✅ After firmware updates that regenerate certificates
- ✅ When switching to a different RUT200 device

---

## Verification

After updating, test the connection:

1. Enable the modem in `/config` UI
2. Check logs: `docker logs -f alarm-service`
3. Look for: 
   - ✅ `"Certificate fingerprint verified"`
   - ✅ `"Session established for modem: Real Teltonika RUT200 #1"`
   - ❌ `"Certificate fingerprint mismatch!"` → Wrong fingerprint!

---

## Troubleshooting

### Error: "Certificate fingerprint mismatch"
**Cause:** The fingerprint in database doesn't match your actual RUT200  
**Fix:** Run the helper script again and update the database

### Error: "Could not retrieve certificate fingerprint"
**Cause:** Can't connect to RUT200  
**Fix:** 
- Check RUT200 is powered on
- Verify IP address is correct
- Check network connectivity: `ping 192.168.1.101`
- Ensure HTTPS is enabled on RUT200

### Error: "Connection refused"
**Cause:** RUT200 not accessible or wrong port  
**Fix:**
- Verify HTTPS is enabled on RUT200 (usually port 443)
- Check firewall settings
- Try accessing `https://192.168.1.101` in browser

---

## Security Best Practices

✅ **Always use certificate fingerprint verification** for production  
✅ **Keep fingerprints updated** after firmware changes  
✅ **Use unique passwords** for each RUT200  
✅ **Store fingerprints securely** in your documentation  

❌ Don't set `cert_fingerprint` to NULL in production  
❌ Don't share your actual fingerprints publicly  
❌ Don't skip certificate verification on public networks  

---

## Quick Reference

```bash
# Get fingerprint
python tools/get_rut200_fingerprint.py YOUR_RUT200_IP

# Update via UI
http://localhost:3004/config → SMS Modems → Edit

# Update via SQL
docker exec postgres-primary psql -U postgres -d tracking_db -c \
  "UPDATE alarms_sms_modems SET cert_fingerprint = 'YOUR_FINGERPRINT' WHERE id = 3;"

# Verify connection
docker logs -f alarm-service
```

---

For more help, see:
- 📄 `docs/SETUP_GUIDE.md` - Complete setup guide
- 📄 `docs/SMS_SESSION_MANAGEMENT.md` - Session details
- 📄 `sms-test/README.md` - RUT200 client reference

# ⚠️ IMPORTANT: GPRS vs SMS Command Authentication

## Key Difference

| Method | Authentication Required | Command Format |
|--------|------------------------|----------------|
| **SMS** | ✅ YES | `<login> <password> <command>` |
| **GPRS (Codec 12)** | ❌ NO | `<command>` only |

---

## How It Works

### SMS Commands
When sending commands via SMS, Teltonika devices require authentication:
```
opa opa getver
```
- `opa` = login
- `opa` = password  
- `getver` = actual command

### GPRS Commands (Codec 12)
When sending commands via GPRS/TCP using Codec 12 protocol, **NO credentials are needed**:
```
getver
```
The device is already authenticated via the TCP connection.

---

## Parser Behavior

The `CommandEncoder` in `parser_nodes/teltonika/teltonika_commands/command_encoder.py` **automatically strips credentials** from GPRS commands.

If you send `opa opa getver` via GPRS:
- Parser detects 3-part format: `login password command`
- Strips to just: `getver`
- Encodes and sends via Codec 12

This allows the Operations Service UI to use the same command format for both SMS and GPRS, with the parser service handling the difference automatically.

---

## Teltonika Codec 12 Reference

From Teltonika documentation:
> "SMS over GPRS" means that all standard SMS commands text can be sent to the device via GPRS in Codec12 format.

However, the **authentication part is NOT included** in the GPRS packet - only the command itself.

### Example from Teltonika Docs
```
Server request: 000000000000000F0C010500000007676574696E666F0100004312
Command (HEX): 676574696E666F = "getinfo" (7 bytes, NO credentials)
```

---

## Common Commands

| Command | Description |
|---------|-------------|
| `getver` | Device version, IMEI, firmware info |
| `getinfo` | Runtime system information |
| `getstatus` | Modem status |
| `getgps` | Current GPS data |
| `getio` | I/O status |
| `getparam <id>` | Get specific parameter |
| `setparam <id>:<value>` | Set parameter |

---

## Troubleshooting

If device responds with **"unknown command or invalid format"**:

1. ✅ Check if command is supported by device model (FMB, FMC, FMM have different commands)
2. ✅ Verify device has GPRS commands enabled in configuration
3. ✅ Ensure command syntax is correct for your firmware version

---

*Last updated: January 2026*

# Mock Teltonika Tracker

A testing tool that simulates Teltonika GPS trackers sending data to parser services. Located at `tools/mock_tracker/`.

## Features

- **Multiple tracker simulation**: Simulate many devices at once
- **Valid Codec 8 packets**: Generates proper Teltonika protocol packets
- **GPS movement simulation**: Trackers move realistically
- **Configurable IO elements**: Battery, voltage, ignition, etc.
- **Edge case testing**: Duplicate packets, connection drops, high load
- **Docker support**: Run as a container for continuous testing
- **Periodic stats**: Reports throughput and success rates

## Docker Usage (Recommended)

```bash
# Start the mock tracker (uses 'testing' profile)
docker compose --profile testing up -d mock-tracker

# View logs
docker logs mock-tracker -f
```

### Configure via Environment Variables

In `docker-compose.yml`:
- `NUM_TRACKERS`: Number of simulated devices (default: 20)
- `SEND_RATE`: Seconds between packets per tracker (default: 2.0)
- `IMEI_PREFIX`: IMEI prefix for mock devices (default: 99900000)
- `TRACKER_HOST`: Target host (default: haproxy-tracker)
- `TRACKER_PORT`: Target port (default: 2001)

### System Robustness Testing

With mock tracker running:
- Stop a parser service – traffic redistributes to others
- Stop RabbitMQ load balancer – verify "DATA ACK NOT SENT" and recovery
- Restart services – should auto-recover

## Manual Usage (Development)

```bash
# Basic test (10 trackers, 1 packet/second)
python mock_teltonika_tracker.py --host localhost --port 5027 --trackers 10

# High load (100 trackers, 2 packets/second each)
python mock_teltonika_tracker.py --host localhost --port 5027 --trackers 100 --rate 0.5
```

## Command Line Options

| Option | Default | Description |
|--------|---------|-------------|
| `--host` | localhost | Parser host |
| `--port` | 5027 | Parser port |
| `--trackers` | 10 | Number of simulated trackers |
| `--rate` | 1.0 | Seconds between packets per tracker |
| `--scenario` | load_test | load_test, duplicate_test, connection_drop |
| `--debug` | false | Enable debug logging |

## Test Scenarios

- **Load Test**: Multiple trackers sending continuously (stress, RabbitMQ, DB).
- **Duplicate Test**: Same packet sent multiple times (deduplication, ON CONFLICT).
- **Connection Drop**: Connect, send, disconnect, repeat (reconnection, cleanup).

## Protocol

Generates valid Teltonika Codec 8 packets with IMEI authentication, preamble, data length, codec ID, AVL data, and CRC-16.

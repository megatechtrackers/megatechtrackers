# Fleet Monitor

A clean, professional fleet monitoring application for CMSV6 MDVR systems.

## Features

- **Device Tree**: Dynamic sidebar showing all vehicles and devices from CMS
- **Real-time Status**: Live GPS, speed, mileage, and network status
- **Alarm History**: View device alarm records
- **Video Recordings**: Browse and access recorded videos
- **Live Streaming**: Get live stream URLs for devices
- **AI Safety**: ADAS/DSM/BSD status monitoring

## Quick Start

### 1. Install Dependencies

```bash
cd fleet-monitor
pip install -r requirements.txt
```

### 2. Configure Environment

Edit `.env` file with your CMS credentials:

```
CMS_BASE_URL=http://43.225.52.157:8082
CMS_USERNAME=admintld
CMS_PASSWORD=tld_321
FLASK_PORT=5002
```

### 3. Run the Server

```bash
cd server
python app.py
```

### 4. Open the Application

Open your browser and go to:
```
http://localhost:5002
```

## Project Structure

```
fleet-monitor/
├── .env                 # Environment configuration
├── requirements.txt     # Python dependencies
├── README.md
├── server/
│   ├── app.py          # Flask API server
│   └── cms_api.py      # CMS API client
└── client/
    ├── index.html      # Main HTML page
    ├── styles.css      # Professional light theme
    └── app.js          # Frontend JavaScript
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/vehicles` | Get all vehicles and devices |
| `GET /api/devices/status` | Get status for all devices |
| `GET /api/device/<id>/status` | Get single device status |
| `GET /api/device/<id>/alarms` | Get device alarm history |
| `GET /api/device/<id>/videos` | Get device video recordings |
| `GET /api/device/<id>/stream` | Get live stream URL |

## Technology Stack

- **Backend**: Python 3, Flask
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Styling**: Custom professional light theme
- **API**: CMSV6 Standard API

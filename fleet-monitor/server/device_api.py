"""
CMS Device API - Device management and status functionality
"""

import requests
from typing import Dict, List, Any

from cms_base import CMSApiBase
from utils import (
    parse_coordinates,
    convert_speed,
    parse_timestamp,
    get_network_type,
    convert_plate_type_to_number,
    get_api_error_message,
    parse_adas_dsm_capability,
)


class CMSDeviceApi(CMSApiBase):
    """CMS API methods for device management."""
    
    # =========================================================================
    # Device Online Status
    # =========================================================================
    
    def _get_devices_online_status(self, device_ids: List[str]) -> Dict[str, bool]:
        """Fetch online status for multiple devices."""
        if not device_ids:
            return {}
            
        session = self._ensure_session()
        url = f"{self.base_url}/StandardApiAction_getDeviceOlStatus.action"
        device_ids_str = ','.join(str(d) for d in device_ids)
        
        try:
            response = requests.get(url, params={
                'jsession': session,
                'devIdno': device_ids_str
            }, timeout=self.timeout)
            
            data = response.json()
            if data.get('result') != 0:
                print(f"[Online Status] API returned error: {data.get('result')}")
                return {}
            
            online_status = {}
            for item in data.get('onlines', []):
                did = item.get('did')
                vid = item.get('vid')
                is_online = item.get('online') in [1, '1', True]
                
                if did:
                    online_status[did] = is_online
                if vid:
                    online_status[vid] = is_online
            
            print(f"[Online Status] Fetched status for {len(online_status)} devices")
            return online_status
            
        except Exception as e:
            print(f"[Online Status] Error fetching online status: {e}")
            return {}
    
    # =========================================================================
    # Device Parsing
    # =========================================================================
    
    def _parse_device_from_vehicle(self, vehicle: Dict[str, Any], 
                                    device_info: Dict[str, Any] = None) -> Dict[str, Any]:
        """Parse device information from vehicle data."""
        plate_number = vehicle.get('nm') or 'Unknown'
        group_name = vehicle.get('pnm') or 'Ungrouped'
        
        # Get device ID and channels
        if device_info:
            device_id = device_info.get('id') or device_info.get('did') or plate_number
            channels = device_info.get('cc') or device_info.get('chs')
            if channels is None:
                cn = device_info.get('cn') or ''
                if isinstance(cn, str) and cn.strip():
                    channels = len([x for x in cn.split(',') if x.strip()])
            sim = device_info.get('sim') or ''
        else:
            device_id = vehicle.get('did') or vehicle.get('id') or plate_number
            channels = vehicle.get('cc') or vehicle.get('chs')
            if channels is None:
                cn = vehicle.get('cn') or ''
                if isinstance(cn, str) and cn.strip():
                    channels = len([x for x in cn.split(',') if x.strip()])
            sim = ''
        
        if channels is None or channels == 0:
            channels = 4
        channels = int(channels)
        
        # Get plate type
        plate_type = (vehicle.get('pt') or vehicle.get('plateType') or 
                     vehicle.get('plate_type') or vehicle.get('plateColor'))
        if device_info:
            plate_type = plate_type or device_info.get('pt') or device_info.get('plateType')
        
        return {
            'deviceId': device_id,
            'plateNumber': plate_number,
            'online': False,
            'group': group_name,
            'channels': channels,
            'plateType': plate_type,
            'sim': sim,
            'vehicleColor': vehicle.get('vehiColor') or '',
            'vehicleBrand': vehicle.get('vehiBand') or '',
            'vehicleType': vehicle.get('vehiType') or '',
            'vehicleUse': vehicle.get('vehiUse') or '',
            'vehicleModel': vehicle.get('vehicleModel') or '',
            'engineModel': vehicle.get('engineModel') or '',
            'engineNum': vehicle.get('engineNum') or '',
            'frameNum': vehicle.get('frameNum') or '',
            'productDate': vehicle.get('dateProduct') or '',
            'purchaseDate': vehicle.get('datePurchase') or '',
            'annualSurveyDate': vehicle.get('dateAnnualSurvey') or '',
            'safeDate': vehicle.get('safeDate') or '',
            'repairDate': vehicle.get('repairDate') or '',
            'ownerName': vehicle.get('ownerName') or '',
            'linkPeople': vehicle.get('linkPeople') or '',
            'linkPhone': vehicle.get('linkPhone') or '',
            'speedLimit': vehicle.get('speedLimit') or 0,
            'approvedNumber': vehicle.get('approvedNumber') or 0,
            'approvedLoad': vehicle.get('approvedLoad') or '',
            'totalWeight': vehicle.get('totalWeight') or '',
            'axesNumber': vehicle.get('axesNumber') or '',
            'lengthDimension': vehicle.get('longOutlineDimensions') or '',
            'widthDimension': vehicle.get('wideOutlineDimensions') or '',
            'heightDimension': vehicle.get('highOutlineDimensions') or '',
            'drivingNum': vehicle.get('drivingNum') or '',
            'drivingDate': vehicle.get('drivingDate') or '',
            'operatingNum': vehicle.get('operatingNum') or '',
            'operatingDate': vehicle.get('operatingDate') or '',
            'installAdas': vehicle.get('installAdas') or 0,
            'adasBrand': vehicle.get('adasBrand') or '',
            'adasModel': vehicle.get('adasModel') or '',
            'installDsm': vehicle.get('installDsm') or 0,
            'dsmBrand': vehicle.get('dsmBrand') or '',
            'dsmModel': vehicle.get('dsmModel') or '',
            'installBlind': vehicle.get('installBlind') or 0,
            'blindBrand': vehicle.get('blindBrand') or '',
            'blindModel': vehicle.get('blindModel') or '',
            'remark': vehicle.get('remark') or '',
            'industry': vehicle.get('industry') or '',
            'carType': vehicle.get('carType') or '',
            'carPlace': vehicle.get('carPlace') or '',
            'icon': vehicle.get('icon') or ''
        }
    
    # =========================================================================
    # Device List
    # =========================================================================
    
    def get_all_devices(self) -> Dict[str, Any]:
        """Get all devices with their current status."""
        data = self._make_request('StandardApiAction_queryUserVehicle.action', {})
        
        if data.get('result') != 0:
            return {'success': False, 'error': 'Failed to fetch devices', 'devices': []}
        
        devices = []
        device_ids = []
        
        for v in data.get('vehicles', []):
            device_list = v.get('dl', [])
            
            if device_list and len(device_list) > 0:
                for device_info in device_list:
                    device = self._parse_device_from_vehicle(v, device_info)
                    devices.append(device)
                    device_ids.append(device['deviceId'])
            else:
                device = self._parse_device_from_vehicle(v)
                devices.append(device)
                device_ids.append(device['deviceId'])
        
        # Fetch and apply online status
        if device_ids:
            online_status = self._get_devices_online_status(device_ids)
            for device in devices:
                device_id = device['deviceId']
                if device_id in online_status:
                    device['online'] = online_status[device_id]
            
            online_count = sum(1 for d in devices if d['online'])
            print(f"[Devices] Online status: {online_count}/{len(devices)} devices online")
        
        return {'success': True, 'devices': devices, 'total': len(devices)}
    
    # =========================================================================
    # Device Status
    # =========================================================================
    
    def _parse_device_status(self, status: Dict[str, Any], device_id: str, 
                              plate_number: str = None) -> Dict[str, Any]:
        """Parse device status from API response."""
        lat, lng = parse_coordinates(status)
        speed = convert_speed(status.get('sp', 0))
        gps_time = parse_timestamp(status.get('gt'))
        
        ls_value = int(status.get('ls', 0) or 0)
        capabilities = parse_adas_dsm_capability(ls_value)
        
        return {
            'deviceId': device_id,
            'plateNumber': status.get('vid') or plate_number or device_id,
            'online': status.get('ol') == 1,
            'speed': speed,
            'mileage': int(status.get('mlg', 0) or 0),
            'lat': lat,
            'lng': lng,
            'gpsTime': gps_time,
            'heading': int(status.get('hd', 0) or 0),
            'altitude': int(status.get('alt', 0) or 0),
            'satellites': int(status.get('gtsc', 0) or 0),
            'network': get_network_type(int(status.get('nw', 0) or 0)),
            **capabilities,
            'adas1': int(status.get('adas1', 0) or 0),
            'adas2': int(status.get('adas2', 0) or 0),
            'dsm1': int(status.get('dsm1', 0) or 0),
            'dsm2': int(status.get('dsm2', 0) or 0),
            'bsd1': int(status.get('bsd1', 0) or 0),
            'bsd2': int(status.get('bsd2', 0) or 0),
            'channels': int(status.get('chs', 4) or 4)
        }
    
    def _get_empty_device_status(self, device_id: str, plate_number: str = None) -> Dict[str, Any]:
        """Get empty device status for offline devices."""
        return {
            'deviceId': device_id,
            'plateNumber': plate_number or device_id,
            'online': False,
            'speed': 0,
            'mileage': 0,
            'lat': 0,
            'lng': 0,
            'gpsTime': None,
            'heading': 0,
            'altitude': 0,
            'satellites': 0,
            'network': 'Unknown',
            'hasAdas': False,
            'hasDsm': False,
            'hasBsd': False,
            'adas1': 0, 'adas2': 0,
            'dsm1': 0, 'dsm2': 0,
            'bsd1': 0, 'bsd2': 0,
            'channels': 4
        }
    
    def get_device_status(self, device_id: str, plate_number: str = None, 
                          plate_type=None) -> Dict[str, Any]:
        """Get detailed status for a specific device."""
        endpoint = 'StandardApiAction_getDeviceStatus.action'
        
        params = {'devIdno': device_id, 'toMap': 1}
        data = self._make_request(endpoint, params, retry_on_fail=False)
        result_code = data.get('result', -1)
        
        if result_code != 0 and plate_number and plate_number != device_id and plate_type is not None:
            plate_type_num = convert_plate_type_to_number(plate_type)
            params = {'vehiIdno': plate_number, 'toMap': 1}
            if plate_type_num is not None:
                params['plateType'] = plate_type_num
            data = self._make_request(endpoint, params, retry_on_fail=True)
            result_code = data.get('result', -1)
        elif result_code != 0:
            data = self._make_request(endpoint, {'devIdno': device_id, 'toMap': 1}, retry_on_fail=True)
            result_code = data.get('result', -1)
        
        if result_code != 0:
            error_msg = get_api_error_message(result_code)
            return {'success': False, 'error': f"{error_msg} for device {device_id}"}
        
        status_list = data.get('status', [])
        if not status_list:
            return {'success': True, 'device': self._get_empty_device_status(device_id, plate_number)}
        
        device = self._parse_device_status(status_list[0], device_id, plate_number)
        return {'success': True, 'device': device}

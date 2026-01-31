"""
API endpoints for Grafana integration
"""
import frappe
from frappe import _
import requests
import re


def _clean_dashboard_uid(uid):
	"""
	Clean dashboard UID - remove any path segments.
	
	Handles cases where UID might contain "/d/", "/dashboard/", or duplicate segments.
	
	Examples:
		- "/d/report-analytics" -> "report-analytics"
		- "/d/report-analytics/report-analytics" -> "report-analytics"
		- "report-analytics/report-analytics" -> "report-analytics"
		- "d/report-analytics" -> "report-analytics"
	
	Args:
		uid (str): Dashboard UID (may contain path segments)
	
	Returns:
		str: Cleaned UID (just the identifier)
	"""
	if not uid:
		return uid
	
	# Remove leading/trailing slashes and whitespace
	cleaned = uid.strip().strip('/')
	
	# Remove common path prefixes (case-insensitive)
	cleaned = re.sub(r'^(d|dashboard)/', '', cleaned, flags=re.IGNORECASE)
	
	# Split by slashes and filter out empty segments
	segments = [s for s in cleaned.split('/') if s]
	
	if not segments:
		# If we have nothing left, return original (shouldn't happen, but safety check)
		return uid
	
	# If we have multiple segments, check for duplicates
	if len(segments) > 1:
		# Check if all segments are the same (duplicate path)
		first_segment = segments[0]
		if all(s == first_segment for s in segments):
			# All segments are duplicates - take just one
			cleaned = first_segment
		else:
			# Different segments - take the last one (usually the actual UID)
			cleaned = segments[-1]
	else:
		# Single segment - this is what we want
		cleaned = segments[0]
	
	return cleaned


@frappe.whitelist(allow_guest=False)
def get_available_reports():
	"""
	Get all available Grafana reports via the Access Gateway.
	
	This endpoint fetches all dashboards from Grafana through the Access Gateway
	and automatically syncs them to the AC Grafana Report master DocType. This ensures
	the master list is always synchronized with Grafana's dashboard list.
	
	Returns:
		list: List of Grafana report dictionaries with the following structure:
			[
				{
					"id": int,              # Grafana dashboard ID
					"uid": str,             # Grafana dashboard UID
					"title": str,           # Dashboard title
					"name": str,            # Dashboard name (fallback to title)
					...
				},
				...
			]
	
	Raises:
		frappe.ValidationError: If Access Gateway is unavailable or returns an error
	
	Note:
		This function automatically creates/updates AC Grafana Report master records
		for all discovered reports. The sync ensures that report assignments always
		reference valid reports that exist in Grafana.
	"""
	# Try to get Access Gateway URL from site config, then from environment
	# Primary (Docker): set by init script to http://access-gateway:3001
	# Local dev: set ACCESS_GATEWAY_URL=http://localhost:3001
	import os
	access_gateway_url = (
		frappe.conf.get('access_gateway_url') or
		os.getenv('ACCESS_GATEWAY_URL') or
		'http://access-gateway:3001'  # Default for Docker network
	)
	
	try:
		response = requests.get(
			f'{access_gateway_url}/api/reports',
			headers={
				'X-Frappe-User': frappe.session.user,
				'Content-Type': 'application/json'
			},
			timeout=10
		)
		
		if response.status_code == 200:
			data = response.json()
			reports = data.get('reports', [])
			
			# Sync reports to Report master DocType
			for report in reports:
				report_id = report.get('id')
				report_uid = report.get('uid', '')
				report_name = report.get('title') or report.get('name') or f"Report {report_id}"
				
				# Clean the UID - remove any path segments (e.g., "/d/", "/dashboard/", or duplicates)
				# Grafana UIDs should be just the identifier, not a full path
				report_uid = _clean_dashboard_uid(report_uid)
				
				# Check if report exists by ID
				existing_report = frappe.db.get_value("AC Grafana Report", {"ac_report_id": report_id}, "name")
				if not existing_report:
					# Create new Grafana Report master record
					report_doc = frappe.get_doc({
						"doctype": "AC Grafana Report",
						"ac_grafana_report_name": report_name,
						"ac_report_id": report_id,
						"ac_report_uid": report_uid
					})
					report_doc.insert(ignore_permissions=True)
				else:
					# Update existing report
					report_doc = frappe.get_doc("AC Grafana Report", existing_report)
				if report_doc.ac_grafana_report_name != report_name or report_doc.ac_report_uid != report_uid:
					report_doc.ac_grafana_report_name = report_name
					report_doc.ac_report_uid = report_uid
					report_doc.save(ignore_permissions=True)
			
			frappe.db.commit()
			return reports
		else:
			error_msg = f'Failed to fetch reports from Access Gateway (Status: {response.status_code})'
			try:
				error_data = response.json()
				error_msg += f": {error_data.get('error', error_data.get('message', ''))}"
			except:
				error_msg += f": {response.text[:200]}"
			frappe.log_error(
				title='Access Gateway Error',
				message=f'{error_msg}. URL: {access_gateway_url}'
			)
			frappe.throw(_(error_msg))
	except requests.exceptions.ConnectionError as e:
		# Log full error details for debugging (not in title to avoid truncation)
		error_msg = f'Access Gateway connection failed at {access_gateway_url}. Error: {str(e)}'
		frappe.log_error(
			title='Access Gateway Connection Error',
			message=f'{error_msg}. User: {frappe.session.user}.'
		)
		frappe.throw(_('Access Gateway is unavailable. Please ensure it is running at {0}').format(access_gateway_url))
	except requests.exceptions.Timeout as e:
		frappe.log_error(
			title='Access Gateway Timeout',
			message=f'Request to Access Gateway timed out after 10 seconds. URL: {access_gateway_url}'
		)
		frappe.throw(_('Access Gateway request timed out. Please try again later.'))
	except Exception as e:
		# Catch all other exceptions including JSON decode errors
		error_msg = f'Unexpected error fetching Grafana reports: {str(e)}'
		frappe.log_error(
			title='Access Gateway Error',
			message=f'{error_msg}. URL: {access_gateway_url}. User: {frappe.session.user}'
		)
		frappe.throw(_('Unable to connect to Access Gateway. Please check service configuration.'))


@frappe.whitelist(allow_guest=False)
def generate_embed_url(report_id, report_uid=None, filters=None):
	"""
	Generate Grafana embed URL via the Access Gateway.
	
	This endpoint creates an authenticated embed URL for a Grafana dashboard with
	locked filters based on the user's context scope. The URL includes:
	- Authentication token (generated by microservice)
	- Locked filter parameters (vehicle, company, department)
	- Kiosk mode for embedding
	- Organization ID
	
	Args:
		report_id (int): Grafana dashboard ID
		report_uid (str, optional): Grafana dashboard UID. If not provided, will be
			fetched from Grafana API using the report_id.
		filters (dict, optional): Additional filter dictionary. These filters will
			be merged with the user's context scope and validated server-side.
	
	Returns:
		str: Authenticated embed URL with locked filters
	
	Raises:
		frappe.ValidationError: If Access Gateway is unavailable, user doesn't have
			access to the report, or filter validation fails
	
	Example:
		>>> url = generate_embed_url(1, filters={"vehicle": "VH-001"})
		>>> print(url)
		"http://grafana.example.com/d/abc123?var-vehicle=VH-001&var-vehicle-locked=true&auth=..."
	"""
	# Try to get Access Gateway URL from site config, then from environment
	# Primary (Docker): set by init script to http://access-gateway:3001
	# Local dev: set ACCESS_GATEWAY_URL=http://localhost:3001
	import os
	access_gateway_url = (
		frappe.conf.get('access_gateway_url') or
		os.getenv('ACCESS_GATEWAY_URL') or
		'http://access-gateway:3001'  # Default for Docker network
	)
	
	try:
		response = requests.post(
			f'{access_gateway_url}/api/grafana/generate-embed-url',
			json={
				'reportId': int(report_id),
				'reportUid': report_uid,
				'filters': filters or {},
				'frappeUser': frappe.session.user
			},
			headers={
				'X-Frappe-User': frappe.session.user,
				'Content-Type': 'application/json'
			},
			timeout=10
		)
		
		if response.status_code == 200:
			data = response.json()
			return data.get('embedUrl')
		else:
			error_data = response.json() if response.content else {}
			frappe.throw(_(error_data.get('error', 'Failed to generate embed URL')))
	except requests.exceptions.ConnectionError as e:
		frappe.log_error(
			title='Access Gateway Connection Error',
			message=f'Failed to connect to Access Gateway at {access_gateway_url} while generating embed URL. Full error: {str(e)}'
		)
		frappe.throw(_('Access Gateway is unavailable. Please ensure it is running and configured correctly.'))
	except requests.exceptions.Timeout as e:
		frappe.log_error(
			title='Access Gateway Timeout',
			message=f'Request to Access Gateway timed out after 10 seconds while generating embed URL. URL: {access_gateway_url}'
		)
		frappe.throw(_('Access Gateway request timed out. Please try again later.'))
	except requests.exceptions.RequestException as e:
		frappe.log_error(
			title='Access Gateway Error',
			message=f'Error generating Grafana embed URL from {access_gateway_url}: {str(e)}'
		)
		frappe.throw(_('Unable to connect to Access Gateway. Please check service configuration.'))

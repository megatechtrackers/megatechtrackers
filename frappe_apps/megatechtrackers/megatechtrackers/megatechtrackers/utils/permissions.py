"""
Permission utilities for access control system
Handles inheritance logic and permission resolution
"""
import frappe
from frappe import _
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


def get_inherited_permissions(user, permission_type="forms"):
	"""
	Get all permissions for a user including inherited ones from parent company/department.
	
	Inheritance follows this hierarchy:
	1. Direct assignments to the user
	2. Department-level assignments (if user belongs to a department)
	3. Company-level assignments (if user belongs to a company)
	
	For sub-companies: The user's parent_company is checked, and if that company
	has a parent company, those assignments are also inherited.
	
	Args:
		user (str): User name (e.g., "user@example.com")
		permission_type (str): "forms" or "reports"
	
	Returns:
		list: List of permission dictionaries with the following structure:
			- For forms: {"name": str, "label": str, "url": str, "inherited": bool, "source": str}
			- For reports: {"id": int, "uid": str, "name": str, "context": dict, "inherited": bool, "source": str}
	
	Example:
		>>> permissions = get_inherited_permissions("user@example.com", "forms")
		>>> print(permissions)
		[{"name": "Customer", "label": "Customer", "url": "/app/customer", "inherited": False, "source": "direct"},
		 {"name": "Item", "label": "Item", "url": "/app/item", "inherited": True, "source": "company:ACME Corp"}]
	"""
	cache_key = f"user_{permission_type}_{user}"
	cached = frappe.cache().get_value(cache_key)
	if cached:
		return cached
	
	# Get user access control
	access_control = frappe.get_doc("Megatechtrackers Access Control", {"ac_user": user})
	if not access_control:
		return []
	
	permissions = []
	
	# Get direct assignments
	if permission_type == "forms" and access_control.ac_assigned_forms:
		for form_assignment in access_control.ac_assigned_forms:
			if form_assignment.ac_form:
				form_doc = frappe.get_doc("AC Frappe Form", form_assignment.ac_form)
				permissions.append({
					"name": form_doc.ac_frappe_form_name,
					"label": form_doc.ac_form_label or form_doc.ac_frappe_form_name,
					"url": form_doc.ac_form_url,
					"inherited": form_assignment.ac_inherited or False,
					"source": "direct"
				})
	elif permission_type == "reports" and access_control.ac_assigned_reports:
		for report_assignment in access_control.ac_assigned_reports:
			if report_assignment.ac_report:
				report_doc = frappe.get_doc("AC Grafana Report", report_assignment.ac_report)
				# Clean the UID to ensure no path segments or duplicates
				report_uid = _clean_dashboard_uid(report_doc.ac_report_uid)
				permissions.append({
					"id": report_doc.ac_report_id,
					"uid": report_uid,
					"name": report_doc.ac_grafana_report_name,
					"context": {
						"vehicles": _parse_context_list(report_assignment.ac_context_vehicles),
						"companies": _parse_context_list(report_assignment.ac_context_companies),
						"departments": _parse_context_list(report_assignment.ac_context_departments)
					},
					"inherited": report_assignment.ac_inherited or False,
					"source": "direct"
				})
	
	# Get inherited permissions from parent company/department
	if access_control.ac_parent_company or access_control.ac_parent_department:
		inherited = _get_inherited_permissions(
			access_control.ac_parent_company,
			access_control.ac_parent_department,
			permission_type
		)
		permissions.extend(inherited)
	
	# Cache the result
	frappe.cache().set_value(cache_key, permissions, expires_in_sec=3600)
	
	return permissions


def _get_inherited_permissions(company=None, department=None, permission_type="forms"):
	"""
	Get permissions inherited from parent company/department.
	
	This function retrieves permissions assigned at the company or department level
	that should be inherited by users belonging to those organizational units.
	
	Inheritance priority:
	1. Department-level assignments (more specific, takes precedence)
	2. Company-level assignments (broader scope)
	
	If a permission exists at both levels, the department-level assignment is used.
	
	Args:
		company (str, optional): Company name (e.g., "ACME Corp")
		department (str, optional): Department name (e.g., "Sales")
		permission_type (str): "forms" or "reports"
	
	Returns:
		list: List of inherited permission dictionaries with "inherited": True flag
	"""
	inherited = []
	
	# Get permissions from department level
	if department:
		department_users = frappe.get_all(
			"Megatechtrackers Access Control",
			filters={"ac_parent_department": department},
			fields=["name"]
		)
		for dept_user in department_users:
			dept_access = frappe.get_doc("Megatechtrackers Access Control", dept_user.name)
			if permission_type == "forms" and dept_access.ac_assigned_forms:
				for form_assignment in dept_access.ac_assigned_forms:
					if form_assignment.ac_form:
						form_doc = frappe.get_doc("AC Frappe Form", form_assignment.ac_form)
						inherited.append({
							"name": form_doc.ac_frappe_form_name,
							"label": form_doc.ac_form_label or form_doc.ac_frappe_form_name,
							"url": form_doc.ac_form_url,
							"inherited": True,
							"source": f"department:{department}"
						})
			elif permission_type == "reports" and dept_access.ac_assigned_reports:
				for report_assignment in dept_access.ac_assigned_reports:
					if report_assignment.ac_report:
						report_doc = frappe.get_doc("AC Grafana Report", report_assignment.ac_report)
						# Clean the UID to ensure no path segments or duplicates
						report_uid = _clean_dashboard_uid(report_doc.ac_report_uid)
						inherited.append({
							"id": report_doc.ac_report_id,
							"uid": report_uid,
							"name": report_doc.ac_grafana_report_name,
							"context": {
								"vehicles": _parse_context_list(report_assignment.ac_context_vehicles),
								"companies": _parse_context_list(report_assignment.ac_context_companies),
								"departments": _parse_context_list(report_assignment.ac_context_departments)
							},
							"inherited": True,
							"source": f"department:{department}"
						})
	
	# Get permissions from company level
	if company:
		company_users = frappe.get_all(
			"Megatechtrackers Access Control",
			filters={"ac_parent_company": company},
			fields=["name"]
		)
		for comp_user in company_users:
			comp_access = frappe.get_doc("Megatechtrackers Access Control", comp_user.name)
			if permission_type == "forms" and comp_access.ac_assigned_forms:
				for form_assignment in comp_access.ac_assigned_forms:
					if form_assignment.ac_form:
						form_doc = frappe.get_doc("AC Frappe Form", form_assignment.ac_form)
						# Skip if already added from department
						if not any(p.get("name") == form_doc.ac_frappe_form_name and p.get("inherited") for p in inherited):
							inherited.append({
								"name": form_doc.ac_frappe_form_name,
								"label": form_doc.ac_form_label or form_doc.ac_frappe_form_name,
								"url": form_doc.ac_form_url,
								"inherited": True,
								"source": f"company:{company}"
							})
			elif permission_type == "reports" and comp_access.ac_assigned_reports:
				for report_assignment in comp_access.ac_assigned_reports:
					if report_assignment.ac_report:
						report_doc = frappe.get_doc("AC Grafana Report", report_assignment.ac_report)
						# Skip if already added from department
						if not any(p.get("id") == report_doc.ac_report_id and p.get("inherited") for p in inherited):
							# Clean the UID to ensure no path segments or duplicates
							report_uid = _clean_dashboard_uid(report_doc.ac_report_uid)
							inherited.append({
								"id": report_doc.ac_report_id,
								"uid": report_uid,
								"name": report_doc.ac_grafana_report_name,
								"context": {
									"vehicles": _parse_context_list(report_assignment.ac_context_vehicles),
									"companies": _parse_context_list(report_assignment.ac_context_companies),
									"departments": _parse_context_list(report_assignment.ac_context_departments)
								},
								"inherited": True,
								"source": f"company:{company}"
							})
	
	return inherited


def _parse_context_list(context_string):
	"""
	Parse comma-separated context string into list.
	
	Args:
		context_string (str): Comma-separated string (e.g., "VH-001, VH-002, VH-003")
	
	Returns:
		list: List of trimmed, non-empty strings
	"""
	if not context_string:
		return []
	return [item.strip() for item in context_string.split(",") if item.strip()]


def get_user_context_scope(user):
	"""
	Get complete context scope for a user (vehicles, companies, departments)
	including inherited context from parent company/department.
	
	Context scope defines which vehicles, companies, and departments a user can access
	when viewing reports or forms. This includes:
	- Direct assignments to the user
	- All vehicles/departments under the user's parent company
	- All vehicles under the user's parent department
	
	Args:
		user (str): User name (e.g., "user@example.com")
	
	Returns:
		dict: Context scope dictionary with the following structure:
			{
				"vehicles": [str, ...],      # List of vehicle names
				"companies": [str, ...],     # List of company names
				"departments": [str, ...]     # List of department names
			}
	
	Example:
		>>> context = get_user_context_scope("user@example.com")
		>>> print(context)
		{
			"vehicles": ["VH-001", "VH-002"],
			"companies": ["ACME Corp"],
			"departments": ["Sales", "Marketing"]
		}
	"""
	cache_key = f"user_context_{user}"
	cached = frappe.cache().get_value(cache_key)
	if cached:
		return cached
	
	access_control = frappe.get_doc("Megatechtrackers Access Control", {"ac_user": user})
	if not access_control:
		return {"vehicles": [], "companies": [], "departments": []}
	
	context = access_control.get_context_scope()
	
	# Cache the result
	frappe.cache().set_value(cache_key, context, expires_in_sec=3600)
	
	return context

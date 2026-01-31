"""
API endpoints for access control permissions
"""
import frappe
from frappe import _
from frappe.utils import now
from megatechtrackers.utils.permissions import get_inherited_permissions, get_user_context_scope


@frappe.whitelist()
def get_user_permissions(user=None):
	"""
	Get all permissions for the current user or specified user.
	
	This endpoint returns a comprehensive view of all permissions including:
	- Forms assigned directly or inherited
	- Reports assigned directly or inherited (with context filters)
	- Context scope (vehicles, companies, departments)
	
	Args:
		user (str, optional): User name. If not provided, uses current session user.
			Only System Managers can query other users' permissions.
	
	Returns:
		dict: Permission dictionary with the following structure:
			{
				"forms": [
					{
						"name": str,
						"label": str,
						"url": str,
						"inherited": bool,
						"source": str
					},
					...
				],
				"reports": [
					{
						"id": int,
						"uid": str,
						"name": str,
						"context": {
							"vehicles": [str, ...],
							"companies": [str, ...],
							"departments": [str, ...]
						},
						"inherited": bool,
						"source": str
					},
					...
				],
				"context": {
					"vehicles": [str, ...],
					"companies": [str, ...],
					"departments": [str, ...]
				}
			}
	
	Raises:
		frappe.PermissionError: If user tries to access another user's permissions
			without System Manager role.
	
	Example:
		>>> permissions = get_user_permissions("user@example.com")
		>>> print(permissions["forms"])
		[{"name": "Customer", "label": "Customer", "url": "/app/customer", "inherited": False, "source": "direct"}]
	"""
	if not user:
		user = frappe.session.user
	
	if user != frappe.session.user and "System Manager" not in frappe.get_roles():
		frappe.throw(_("Not permitted to view other user's permissions"))
	
	forms = get_inherited_permissions(user, "forms")
	reports = get_inherited_permissions(user, "reports")
	context = get_user_context_scope(user)
	
	return {
		"forms": forms,
		"reports": reports,
		"context": context
	}


@frappe.whitelist()
def get_available_forms(page=1, limit=50):
	"""
	Get all available forms from Frappe with pagination.
	
	This endpoint fetches all DocTypes and Web Forms from Frappe and automatically
	syncs them to the AC Frappe Form master DocType. This ensures the master list
	is always up-to-date with available forms in the system.
	
	Args:
		page (int, optional): Page number (default: 1)
		limit (int, optional): Items per page (default: 50, max: 100)
	
	Returns:
		dict: Paginated forms response with the following structure:
			{
				"forms": [
					{
						"name": str,        # DocType or Web Form name
						"label": str,       # Display label
						"url": str,         # Form URL path
						"type": str         # "doctype" or "web_form"
					},
					...
				],
				"total": int,              # Total number of forms
				"page": int,               # Current page number
				"limit": int,              # Items per page
				"has_more": bool           # Whether more pages exist
			}
	
	Note:
		This function automatically creates/updates AC Frappe Form master records
		for all discovered forms. This ensures consistency between Frappe's form
		list and the access control system's master data.
	"""
	page = int(page)
	limit = min(int(limit), 100)  # Max 100 per page
	
	# Get all custom forms and standard forms
	# DocType doesn't have a 'label' field, so we use 'name' and format it
	all_forms = frappe.get_all("DocType", filters={"is_submittable": 0}, fields=["name"])
	
	# Also get web forms
	all_web_forms = frappe.get_all("Web Form", fields=["name", "title", "route"])
	
	all_results = []
	
	# Sync DocTypes to Form master records
	for form in all_forms:
		form_name = form.name
		
		# Skip system doctypes and our own doctypes
		if form_name in ["AC Frappe Form", "AC Grafana Report", "AC Company", "AC Department", 
		                  "AC Vehicle", "Megatechtrackers Access Control", "AC Frappe Form Assignment",
		                  "AC Grafana Report Assignment", "AC Company Assignment", 
		                  "AC Department Assignment", "AC Vehicle Assignment"]:
			continue
		
		# Use name as label (can be improved later with proper label extraction)
		form_label = form_name.replace("_", " ").replace("-", " ").title()
		form_url = f"/app/{form_name.replace(' ', '-').lower()}"
		
		# Check if form exists by ac_frappe_form_name field
		existing = frappe.db.get_value("AC Frappe Form", {"ac_frappe_form_name": form_name}, "name")
		
		if not existing:
			form_doc = frappe.get_doc({
				"doctype": "AC Frappe Form",
				"ac_frappe_form_name": form_name,
				"ac_form_label": form_label,
				"ac_form_url": form_url
			})
			form_doc.insert(ignore_permissions=True)
		else:
			form_doc = frappe.get_doc("AC Frappe Form", existing)
			if form_doc.ac_form_label != form_label or form_doc.ac_form_url != form_url:
				form_doc.ac_form_label = form_label
				form_doc.ac_form_url = form_url
				form_doc.save(ignore_permissions=True)
		
		all_results.append({
			"name": form_name,
			"label": form_label,
			"url": form_url,
			"type": "doctype"
		})
	
	# Sync Web Forms to Form master records
	for web_form in all_web_forms:
		form_name = web_form.name
		form_label = web_form.get("title") or form_name
		form_url = web_form.get("route") or f"/app/{form_name.replace(' ', '-').lower()}"
		
		# Check if form exists by ac_frappe_form_name field
		existing = frappe.db.get_value("AC Frappe Form", {"ac_frappe_form_name": form_name}, "name")
		
		if not existing:
			form_doc = frappe.get_doc({
				"doctype": "AC Frappe Form",
				"ac_frappe_form_name": form_name,
				"ac_form_label": form_label,
				"ac_form_url": form_url
			})
			form_doc.insert(ignore_permissions=True)
		else:
			form_doc = frappe.get_doc("AC Frappe Form", existing)
			if form_doc.ac_form_url != form_url or form_doc.ac_form_label != form_label:
				form_doc.ac_form_url = form_url
				form_doc.ac_form_label = form_label
				form_doc.save(ignore_permissions=True)
		
		all_results.append({
			"name": form_name,
			"label": form_label,
			"url": form_url,
			"type": "web_form"
		})
	
	frappe.db.commit()
	
	# Apply pagination
	start_index = (page - 1) * limit
	end_index = start_index + limit
	paginated_forms = all_results[start_index:end_index]
	
	return {
		"forms": paginated_forms,
		"total": len(all_results),
		"page": page,
		"limit": limit,
		"has_more": end_index < len(all_results)
	}


@frappe.whitelist()
def get_frappe_forms(doctype, txt, searchfield, start, page_len, filters):
	"""
	Query method for AC Frappe Form doctype.
	
	This is a Frappe query method used in set_query for form assignment dropdowns.
	It provides searchable, paginated form list for selection.
	
	Args:
		doctype (str): DocType name (always "AC Frappe Form")
		txt (str): Search text entered by user
		searchfield (str): Field name to search in
		start (int): Starting index for pagination
		page_len (int): Number of results per page
		filters (dict): Additional filters
	
	Returns:
		list: List of tuples (name, label) matching the search criteria
	"""
	return frappe.db.sql("""
		SELECT name, ac_form_label
		FROM `tabAC Frappe Form`
		WHERE ac_is_active = 1
		AND (name LIKE %(txt)s OR ac_form_label LIKE %(txt)s)
		ORDER BY ac_form_label
		LIMIT %(start)s, %(page_len)s
	""", {
		'txt': f'%{txt}%',
		'start': start,
		'page_len': page_len
	})


@frappe.whitelist()
def get_user_forms(user=None):
	"""
	Get forms assigned to user (including inherited forms).
	
	Args:
		user (str, optional): User name. If not provided, uses current session user.
	
	Returns:
		list: List of form dictionaries with name, label, url, inherited flag, and source
	"""
	if not user:
		user = frappe.session.user
	
	permissions = get_user_permissions(user)
	return permissions.get("forms", [])


@frappe.whitelist()
def get_user_reports(user=None):
	"""
	Get reports assigned to user (including inherited reports).
	
	Args:
		user (str, optional): User name. If not provided, uses current session user.
	
	Returns:
		list: List of report dictionaries with id, uid, name, context, inherited flag, and source
	"""
	if not user:
		user = frappe.session.user
	
	permissions = get_user_permissions(user)
	return permissions.get("reports", [])


@frappe.whitelist()
def get_user_context(user=None):
	"""
	Get context scope for user (vehicles, companies, departments).
	
	Args:
		user (str, optional): User name. If not provided, uses current session user.
	
	Returns:
		dict: Context dictionary with vehicles, companies, and departments lists
	"""
	if not user:
		user = frappe.session.user
	
	return get_user_context_scope(user)


@frappe.whitelist()
def validate_report_access(user, report_id):
	"""
	Validate if user has access to a specific report.
	
	This endpoint checks whether a user has been assigned (directly or through
	inheritance) access to a specific Grafana report.
	
	Args:
		user (str): User name (e.g., "user@example.com")
		report_id (int): Grafana dashboard ID
	
	Returns:
		dict: Validation result with the following structure:
			{
				"has_access": bool,        # Whether user has access
				"report": dict or None,    # Report details if access granted
				"context": dict or None    # User context scope if access granted
			}
	
	Raises:
		frappe.PermissionError: If user tries to validate another user's access
			without System Manager role.
	"""
	if user != frappe.session.user and "System Manager" not in frappe.get_roles():
		frappe.throw(_("Not permitted to validate other user's access"))
	
	reports = get_inherited_permissions(user, "reports")
	report = next((r for r in reports if r.get("id") == int(report_id)), None)
	
	if not report:
		return {
			"has_access": False,
			"report": None,
			"context": None
		}
	
	context = get_user_context_scope(user)
	
	return {
		"has_access": True,
		"report": report,
		"context": context
	}


@frappe.whitelist()
def create_megatechtrackers_access_control(user, user_type, parent_company=None, parent_department=None):
	"""
	Create a new Megatechtrackers Access Control record.
	
	This endpoint creates an access control record for a user. Only one access control
	record can exist per user (enforced by unique constraint on ac_user field).
	
	Args:
		user (str): User name (e.g., "user@example.com")
		user_type (str): User type - one of:
			- "Internal" - Internal company user
			- "Client - Single User" - External single user
			- "Client - Company" - External company user
			- "Client - Sub-Company" - External sub-company user
		parent_company (str, optional): Parent company name (required for Company/Sub-Company types)
		parent_department (str, optional): Parent department name (required for Sub-Company type)
	
	Returns:
		dict: Success response with created record name:
			{"success": True, "name": str}
	
	Raises:
		frappe.PermissionError: If user is not System Manager
		frappe.DuplicateEntryError: If access control already exists for the user
		frappe.ValidationError: If validation fails (e.g., missing required fields)
	"""
	if "System Manager" not in frappe.get_roles():
		frappe.throw(_("Only System Manager can create access control records"))
	
	if frappe.db.exists("Megatechtrackers Access Control", {"ac_user": user}):
		frappe.throw(_("Access control already exists for user {0}").format(user))
	
	doc = frappe.get_doc({
		"doctype": "Megatechtrackers Access Control",
		"ac_user": user,
		"ac_user_type": user_type,
		"ac_parent_company": parent_company,
		"ac_parent_department": parent_department
	})
	doc.insert()
	frappe.db.commit()
	
	return {"success": True, "name": doc.name}


@frappe.whitelist()
def update_megatechtrackers_access_control(name, **kwargs):
	"""
	Update Megatechtrackers Access Control record.
	
	Args:
		name (str): Document name of the Access Control record
		**kwargs: Allowed fields to update:
			- ac_user_type (str): User type
			- ac_parent_company (str): Parent company name
			- ac_parent_department (str): Parent department name
	
	Returns:
		dict: Success response: {"success": True}
	
	Raises:
		frappe.PermissionError: If user is not System Manager
		frappe.DoesNotExistError: If Access Control record not found
	"""
	if "System Manager" not in frappe.get_roles():
		frappe.throw(_("Only System Manager can update access control records"))
	
	doc = frappe.get_doc("Megatechtrackers Access Control", name)
	
	# Update allowed fields
	allowed_fields = ["ac_user_type", "ac_parent_company", "ac_parent_department"]
	for field, value in kwargs.items():
		if field in allowed_fields:
			doc.set(field, value)
	
	doc.save()
	frappe.db.commit()
	
	return {"success": True}


@frappe.whitelist()
def delete_megatechtrackers_access_control(name):
	"""
	Delete Megatechtrackers Access Control record.
	
	Args:
		name (str): Document name of the Access Control record to delete
	
	Returns:
		dict: Success response: {"success": True}
	
	Raises:
		frappe.PermissionError: If user is not System Manager
		frappe.DoesNotExistError: If Access Control record not found
	"""
	if "System Manager" not in frappe.get_roles():
		frappe.throw(_("Only System Manager can delete access control records"))
	
	frappe.delete_doc("Megatechtrackers Access Control", name)
	frappe.db.commit()
	
	return {"success": True}


@frappe.whitelist()
def add_form_assignment(user, form_name, form_label=None, form_url=None):
	"""
	Add form assignment to user.
	
	This endpoint adds a Frappe form to a user's assigned forms list. If the form
	doesn't exist in the AC Frappe Form master, it will be created automatically.
	
	Args:
		user (str): User name (e.g., "user@example.com")
		form_name (str): Form name (DocType name or Web Form name)
		form_label (str, optional): Display label for the form
		form_url (str, optional): Form URL path
	
	Returns:
		dict: Success response: {"success": True} or {"success": True, "message": "Form already assigned"}
	
	Raises:
		frappe.PermissionError: If user tries to modify another user's assignments
			without System Manager role
		frappe.DoesNotExistError: If Access Control record not found for user
	"""
	if user != frappe.session.user and "System Manager" not in frappe.get_roles():
		frappe.throw(_("Not permitted to modify other user's assignments"))
	
	access_control = frappe.get_doc("Megatechtrackers Access Control", {"ac_user": user})
	if not access_control:
		frappe.throw(_("Megatechtrackers Access Control not found for user {0}").format(user))
	
	# Ensure Form master record exists
	if not frappe.db.exists("AC Frappe Form", form_name):
		form_doc = frappe.get_doc({
			"doctype": "AC Frappe Form",
			"ac_frappe_form_name": form_name,
			"ac_form_label": form_label or form_name,
			"ac_form_url": form_url or f"/app/{form_name.replace(' ', '-').lower()}"
		})
		form_doc.insert(ignore_permissions=True)
		frappe.db.commit()
	
	# Check if already assigned
	existing = [f for f in access_control.ac_assigned_forms if f.ac_form == form_name]
	if existing:
		return {"success": True, "message": "Form already assigned"}
	
	access_control.append("ac_assigned_forms", {
		"ac_form": form_name,
		"ac_inherited": False
	})
	access_control.save()
	frappe.db.commit()
	
	# Audit log permission change
	frappe.logger().info("Permission change: Form assigned", {
		"action": "add_form_assignment",
		"ac_user": user,
		"form_name": form_name,
		"modified_by": frappe.session.user,
		"timestamp": now()
	})
	
	return {"success": True}


@frappe.whitelist()
def remove_form_assignment(user, form_name):
	"""
	Remove form assignment from user.
	
	Args:
		user (str): User name (e.g., "user@example.com")
		form_name (str): Form name to remove
	
	Returns:
		dict: Success response: {"success": True}
	
	Raises:
		frappe.PermissionError: If user tries to modify another user's assignments
			without System Manager role
		frappe.DoesNotExistError: If Access Control record not found for user
	"""
	if user != frappe.session.user and "System Manager" not in frappe.get_roles():
		frappe.throw(_("Not permitted to modify other user's assignments"))
	
	access_control = frappe.get_doc("Megatechtrackers Access Control", {"ac_user": user})
	if not access_control:
		frappe.throw(_("Megatechtrackers Access Control not found for user {0}").format(user))
	
	# Remove form assignment
	access_control.ac_assigned_forms = [f for f in access_control.ac_assigned_forms if f.ac_form != form_name]
	access_control.save()
	frappe.db.commit()
	
	# Audit log permission change
	frappe.logger().info("Permission change: Form removed", {
		"action": "remove_form_assignment",
		"ac_user": user,
		"form_name": form_name,
		"modified_by": frappe.session.user,
		"timestamp": now()
	})
	
	return {"success": True}


@frappe.whitelist()
def add_report_assignment(user, report_id, report_uid=None, report_name=None, context_vehicles=None, context_companies=None, context_departments=None):
	"""
	Add report assignment to user with optional context filters.
	
	This endpoint adds a Grafana report to a user's assigned reports list with
	optional context filters (vehicles, companies, departments). If the report
	doesn't exist in the AC Grafana Report master, it will be created automatically.
	
	Args:
		user (str): User name (e.g., "user@example.com")
		report_id (int): Grafana dashboard ID
		report_uid (str, optional): Grafana dashboard UID
		report_name (str, optional): Report display name
		context_vehicles (str, optional): Comma-separated list of vehicle names
		context_companies (str, optional): Comma-separated list of company names
		context_departments (str, optional): Comma-separated list of department names
	
	Returns:
		dict: Success response: {"success": True} or {"success": True, "message": "Report already assigned"}
	
	Raises:
		frappe.PermissionError: If user tries to modify another user's assignments
			without System Manager role
		frappe.DoesNotExistError: If Access Control record not found for user
	"""
	if user != frappe.session.user and "System Manager" not in frappe.get_roles():
		frappe.throw(_("Not permitted to modify other user's assignments"))
	
	access_control = frappe.get_doc("Megatechtrackers Access Control", {"ac_user": user})
	if not access_control:
		frappe.throw(_("Megatechtrackers Access Control not found for user {0}").format(user))
	
	# Ensure Report master record exists
	report_name_key = report_name or f"Report {report_id}"
	if not frappe.db.exists("AC Grafana Report", {"ac_report_id": int(report_id)}):
		# Find by report_id if exists
		existing_report = frappe.db.get_value("AC Grafana Report", {"ac_report_id": int(report_id)}, "name")
		if not existing_report:
			report_doc = frappe.get_doc({
				"doctype": "AC Grafana Report",
				"ac_grafana_report_name": report_name_key,
				"ac_report_id": int(report_id),
				"ac_report_uid": report_uid or ""
			})
			report_doc.insert(ignore_permissions=True)
			frappe.db.commit()
			report_name_key = report_doc.name
		else:
			report_name_key = existing_report
	else:
		# Get the report name
		report_name_key = frappe.db.get_value("AC Grafana Report", {"ac_report_id": int(report_id)}, "name")
	
	# Check if already assigned
	existing = [r for r in access_control.ac_assigned_reports if r.ac_report == report_name_key]
	if existing:
		return {"success": True, "message": "Report already assigned"}
	
	access_control.append("ac_assigned_reports", {
		"ac_report": report_name_key,
		"ac_context_vehicles": context_vehicles or "",
		"ac_context_companies": context_companies or "",
		"ac_context_departments": context_departments or "",
		"ac_inherited": False
	})
	access_control.save()
	frappe.db.commit()
	
	# Audit log permission change
	frappe.logger().info("Permission change: Report assigned", {
		"action": "add_report_assignment",
		"ac_user": user,
		"report_id": report_id,
		"modified_by": frappe.session.user,
		"timestamp": now()
	})
	
	return {"success": True}


@frappe.whitelist()
def remove_report_assignment(user, report_id):
	"""
	Remove report assignment from user.
	
	Args:
		user (str): User name (e.g., "user@example.com")
		report_id (int): Grafana dashboard ID
	
	Returns:
		dict: Success response: {"success": True}
	
	Raises:
		frappe.PermissionError: If user tries to modify another user's assignments
			without System Manager role
		frappe.DoesNotExistError: If Access Control record not found for user
		frappe.DoesNotExistError: If report with given ID not found
	"""
	if user != frappe.session.user and "System Manager" not in frappe.get_roles():
		frappe.throw(_("Not permitted to modify other user's assignments"))
	
	access_control = frappe.get_doc("Megatechtrackers Access Control", {"ac_user": user})
	if not access_control:
		frappe.throw(_("Megatechtrackers Access Control not found for user {0}").format(user))
	
	# Find report by ID
	report_name = frappe.db.get_value("AC Grafana Report", {"ac_report_id": int(report_id)}, "name")
	if not report_name:
		frappe.throw(_("Report with ID {0} not found").format(report_id))
	
	# Remove report assignment
	access_control.ac_assigned_reports = [r for r in access_control.ac_assigned_reports if r.ac_report != report_name]
	access_control.save()
	frappe.db.commit()
	
	# Audit log permission change
	frappe.logger().info("Permission change: Report removed", {
		"action": "remove_report_assignment",
		"ac_user": user,
		"report_id": report_id,
		"modified_by": frappe.session.user,
		"timestamp": now()
	})
	
	return {"success": True}


@frappe.whitelist()
def bulk_assign_forms(form_names, user_filters=None, company=None, department=None):
	"""
	Bulk assign forms to all users based on filters.
	
	This endpoint assigns multiple forms to all users matching the specified filters.
	Useful for assigning forms at the company or department level.
	
	Args:
		form_names (list): List of form names to assign (required)
		user_filters (dict, optional): Dictionary with filter criteria:
			- ac_user_type (str): Filter by user type
			- ac_parent_company (str): Filter by parent company
			- ac_parent_department (str): Filter by parent department
		company (str, optional): Company name (for backward compatibility)
		department (str, optional): Department name (for backward compatibility)
	
	Returns:
		dict: Success response with assignment statistics:
			{
				"success": True,
				"assigned_count": int,      # Number of assignments made
				"users_affected": int        # Number of users affected
			}
	
	Raises:
		frappe.PermissionError: If user is not System Manager
		frappe.ValidationError: If form_names is not a list or filters are invalid
	"""
	if "System Manager" not in frappe.get_roles():
		frappe.throw(_("Only System Manager can perform bulk assignments"))
	
	if not form_names or not isinstance(form_names, list):
		frappe.throw(_("form_names must be a list"))
	
	# Get all users based on filters
	filters = {}
	if user_filters:
		if isinstance(user_filters, str):
			import json
			user_filters = json.loads(user_filters)
		if user_filters.get("ac_user_type"):
			filters["ac_user_type"] = user_filters["ac_user_type"]
		if user_filters.get("ac_parent_company"):
			filters["ac_parent_company"] = user_filters["ac_parent_company"]
		if user_filters.get("ac_parent_department"):
			filters["ac_parent_department"] = user_filters["ac_parent_department"]
	else:
		# Backward compatibility
		if company:
			filters["ac_parent_company"] = company
		if department:
			filters["ac_parent_department"] = department
	
	if not filters:
		frappe.throw(_("Either user_filters or company/department must be specified"))
	
	megatechtrackers_access_controls = frappe.get_all("Megatechtrackers Access Control", filters=filters, fields=["name", "ac_user"])
	
	assigned_count = 0
	for mac in megatechtrackers_access_controls:
		doc = frappe.get_doc("Megatechtrackers Access Control", mac.name)
		for form_name in form_names:
			# Ensure Form master record exists
			if not frappe.db.exists("AC Frappe Form", form_name):
				form_doc = frappe.get_doc({
					"doctype": "AC Frappe Form",
					"ac_frappe_form_name": form_name,
					"ac_form_label": form_name
				})
				form_doc.insert(ignore_permissions=True)
			
			# Check if already assigned
			existing = [f for f in doc.ac_assigned_forms if f.ac_form == form_name]
			if not existing:
				doc.append("ac_assigned_forms", {
					"ac_form": form_name,
					"ac_inherited": False
				})
				assigned_count += 1
		doc.save()
	
	frappe.db.commit()
	
	return {"success": True, "assigned_count": assigned_count, "users_affected": len(megatechtrackers_access_controls)}


@frappe.whitelist()
def bulk_assign_reports(report_ids, user_filters=None, company=None, department=None, context_vehicles=None, context_companies=None, context_departments=None):
	"""
	Bulk assign reports to all users based on filters with optional context.
	
	This endpoint assigns multiple reports to all users matching the specified filters,
	with optional context filters applied to all assignments.
	
	Args:
		report_ids (list): List of Grafana dashboard IDs to assign (required)
		user_filters (dict, optional): Dictionary with filter criteria:
			- ac_user_type (str): Filter by user type
			- ac_parent_company (str): Filter by parent company
			- ac_parent_department (str): Filter by parent department
		company (str, optional): Company name (for backward compatibility)
		department (str, optional): Department name (for backward compatibility)
		context_vehicles (str, optional): Comma-separated list of vehicle names
		context_companies (str, optional): Comma-separated list of company names
		context_departments (str, optional): Comma-separated list of department names
	
	Returns:
		dict: Success response with assignment statistics:
			{
				"success": True,
				"assigned_count": int,      # Number of assignments made
				"users_affected": int        # Number of users affected
			}
	
	Raises:
		frappe.PermissionError: If user is not System Manager
		frappe.ValidationError: If report_ids is not a list, filters are invalid,
			or reports don't exist in master
	"""
	if "System Manager" not in frappe.get_roles():
		frappe.throw(_("Only System Manager can perform bulk assignments"))
	
	if not report_ids or not isinstance(report_ids, list):
		frappe.throw(_("report_ids must be a list"))
	
	# Get all users based on filters
	filters = {}
	if user_filters:
		if isinstance(user_filters, str):
			import json
			user_filters = json.loads(user_filters)
		if user_filters.get("ac_user_type"):
			filters["ac_user_type"] = user_filters["ac_user_type"]
		if user_filters.get("ac_parent_company"):
			filters["ac_parent_company"] = user_filters["ac_parent_company"]
		if user_filters.get("ac_parent_department"):
			filters["ac_parent_department"] = user_filters["ac_parent_department"]
	else:
		# Backward compatibility
		if company:
			filters["ac_parent_company"] = company
		if department:
			filters["ac_parent_department"] = department
	
	if not filters:
		frappe.throw(_("Either user_filters or company/department must be specified"))
	
	megatechtrackers_access_controls = frappe.get_all("Megatechtrackers Access Control", filters=filters, fields=["name", "ac_user"])
	
	assigned_count = 0
	for mac in megatechtrackers_access_controls:
		doc = frappe.get_doc("Megatechtrackers Access Control", mac.name)
		for report_id in report_ids:
			# Find or create Report master record
			report_name = frappe.db.get_value("AC Grafana Report", {"ac_report_id": int(report_id)}, "name")
			if not report_name:
				# Report doesn't exist, need to fetch from Grafana first
				frappe.throw(_("Report with ID {0} not found. Please fetch available reports first.").format(report_id))
			
			# Check if already assigned
			existing = [r for r in doc.ac_assigned_reports if r.ac_report == report_name]
			if not existing:
				doc.append("ac_assigned_reports", {
					"ac_report": report_name,
					"ac_context_vehicles": context_vehicles or "",
					"ac_context_companies": context_companies or "",
					"ac_context_departments": context_departments or "",
					"ac_inherited": False
				})
				assigned_count += 1
		doc.save()
	
	frappe.db.commit()
	
	return {"success": True, "assigned_count": assigned_count, "users_affected": len(megatechtrackers_access_controls)}

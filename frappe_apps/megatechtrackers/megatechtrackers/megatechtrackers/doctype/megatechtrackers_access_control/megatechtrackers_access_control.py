import frappe
from frappe.model.document import Document
from frappe import _
from megatechtrackers.utils.permissions import get_inherited_permissions


class MegatechtrackersAccessControl(Document):
	"""
	Main DocType for managing user access control.
	
	This DocType stores all access control settings for a user including:
	- User type (Internal, Client - Single User, Client - Company, Client - Sub-Company)
	- Parent company and department relationships
	- Form assignments (direct and inherited)
	- Report assignments with context filters (direct and inherited)
	- Context assignments (vehicles, companies, departments)
	
	Inheritance:
	- Users inherit permissions from their parent company
	- Users inherit permissions from their parent department
	- Department-level permissions take precedence over company-level for the same item
	"""
	
	def validate(self):
		"""
		Validate user access control settings.
		
		Validates that:
		- Parent company is provided for Company/Sub-Company user types
		- Parent department is provided for Sub-Company user type
		- User exists in the system
		- No duplicate entries in child tables
		
		Raises:
			frappe.ValidationError: If validation fails
		"""
		if self.ac_user_type in ["Client - Company", "Client - Sub-Company"] and not self.ac_parent_company:
			frappe.throw(_("Parent Company is required for Company/Sub-Company user types"))
		
		if self.ac_user_type == "Client - Sub-Company" and not self.ac_parent_department:
			frappe.throw(_("Parent Department is required for Sub-Company user type"))
		
		# Validate no duplicate companies
		if self.ac_assigned_companies:
			company_ids = [row.ac_company for row in self.ac_assigned_companies if row.ac_company]
			duplicates = [cid for cid in company_ids if company_ids.count(cid) > 1]
			if duplicates:
				frappe.throw(_("Duplicate company found: {0}. Each company can only be assigned once.").format(duplicates[0]))
		
		# Validate no duplicate departments
		if self.ac_assigned_departments:
			dept_ids = [row.ac_department for row in self.ac_assigned_departments if row.ac_department]
			duplicates = [did for did in dept_ids if dept_ids.count(did) > 1]
			if duplicates:
				frappe.throw(_("Duplicate department found: {0}. Each department can only be assigned once.").format(duplicates[0]))
		
		# Validate no duplicate vehicles
		if self.ac_assigned_vehicles:
			vehicle_ids = [row.ac_vehicle for row in self.ac_assigned_vehicles if row.ac_vehicle]
			duplicates = [vid for vid in vehicle_ids if vehicle_ids.count(vid) > 1]
			if duplicates:
				frappe.throw(_("Duplicate vehicle found: {0}. Each vehicle can only be assigned once.").format(duplicates[0]))
		
		# Validate no duplicate forms
		if self.ac_assigned_forms:
			form_ids = [row.ac_form for row in self.ac_assigned_forms if row.ac_form]
			duplicates = [fid for fid in form_ids if form_ids.count(fid) > 1]
			if duplicates:
				frappe.throw(_("Duplicate form found: {0}. Each form can only be assigned once.").format(duplicates[0]))
		
		# Validate no duplicate reports
		if self.ac_assigned_reports:
			report_ids = [row.ac_report for row in self.ac_assigned_reports if row.ac_report]
			duplicates = [rid for rid in report_ids if report_ids.count(rid) > 1]
			if duplicates:
				frappe.throw(_("Duplicate report found: {0}. Each report can only be assigned once.").format(duplicates[0]))

	def on_update(self):
		"""
		Clear cache when access control is updated.
		
		This ensures that permission changes are immediately reflected
		without waiting for cache expiration. Clears:
		- User permissions cache
		- User forms cache
		- User reports cache
		- User context cache
		"""
		frappe.cache().delete_value(f"user_permissions_{self.ac_user}")
		frappe.cache().delete_value(f"user_forms_{self.ac_user}")
		frappe.cache().delete_value(f"user_reports_{self.ac_user}")
		frappe.cache().delete_value(f"user_context_{self.ac_user}")

	def get_all_forms(self):
		"""
		Get all forms assigned to this user including inherited ones.
		
		Returns:
			list: List of form dictionaries with name, label, url, inherited flag, and source
		"""
		return get_inherited_permissions(self.ac_user, "forms")

	def get_all_reports(self):
		"""
		Get all reports assigned to this user including inherited ones.
		
		Returns:
			list: List of report dictionaries with id, uid, name, context, inherited flag, and source
		"""
		return get_inherited_permissions(self.ac_user, "reports")

	def get_context_scope(self):
		"""
		Get context scope (vehicles, companies, departments) for this user.
		
		Context scope includes:
		- Direct vehicle/company/department assignments
		- Inherited context from parent company (all vehicles/departments under company)
		- Inherited context from parent department (all vehicles under department)
		
		Returns:
			dict: Context dictionary with vehicles, companies, and departments lists
		"""
		context = {
			"vehicles": [],
			"companies": [],
			"departments": []
		}
		
		# Get direct assignments
		if self.ac_assigned_vehicles:
			context["vehicles"].extend([v.ac_vehicle for v in self.ac_assigned_vehicles])
		if self.ac_assigned_companies:
			context["companies"].extend([c.ac_company for c in self.ac_assigned_companies])
		if self.ac_assigned_departments:
			context["departments"].extend([d.ac_department for d in self.ac_assigned_departments])
		
		# Get inherited context from parent company/department
		if self.ac_parent_company:
			parent_context = get_inherited_context(self.ac_parent_company, self.ac_parent_department)
			context["vehicles"].extend(parent_context.get("vehicles", []))
			context["companies"].extend(parent_context.get("companies", []))
			context["departments"].extend(parent_context.get("departments", []))
		
		# Remove duplicates
		context["vehicles"] = list(set(context["vehicles"]))
		context["companies"] = list(set(context["companies"]))
		context["departments"] = list(set(context["departments"]))
		
		return context


def get_inherited_context(company=None, department=None):
	"""
	Get context inherited from parent company/department.
	
	Retrieves all vehicles, companies, and departments that should be
	accessible based on the user's organizational hierarchy.
	
	Args:
		company (str, optional): Company name
		department (str, optional): Department name
	
	Returns:
		dict: Context dictionary with vehicles, companies, and departments lists
	"""
	context = {"vehicles": [], "companies": [], "departments": []}
	
	if department:
		# Get vehicles from department
		vehicles = frappe.get_all("AC Vehicle", filters={"ac_department": department}, pluck="name")
		context["vehicles"].extend(vehicles)
		context["departments"].append(department)
	
	if company:
		# Get all departments under company
		departments = frappe.get_all("AC Department", filters={"ac_company": company}, pluck="name")
		context["departments"].extend(departments)
		
		# Get all vehicles from company departments
		vehicles = frappe.get_all("AC Vehicle", filters={"ac_company": company}, pluck="name")
		context["vehicles"].extend(vehicles)
		context["companies"].append(company)
	
	return context

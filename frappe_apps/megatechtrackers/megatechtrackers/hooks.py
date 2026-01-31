from frappe import _

app_name = "megatechtrackers"
app_title = "Megatechtrackers"
app_publisher = "Megatechtrackers"
app_description = "Megatechtrackers access control system for Frappe forms and Grafana reports"
app_email = "support@megatechtrackers.com"
app_license = "MIT"

# Add app to apps screen
add_to_apps_screen = [{
    "name": "megatechtrackers",
    "title": "Megatechtrackers",
    "route": "/app/megatechtrackers",
    "has_permission": None  # Visible to all users
}]

# Fixtures - ensure doctypes, workspace shortcuts, and workspace are imported during app installation
fixtures = [
    # DocTypes
    {"doctype": "DocType", "filters": [["name", "in", [
        "Megatechtrackers Access Control",
        "AC Frappe Form",
        "AC Grafana Report",
        "AC Company",
        "AC Department",
        "AC Vehicle",
        "AC Frappe Form Assignment",
        "AC Grafana Report Assignment",
        "AC Company Assignment",
        "AC Department Assignment",
        "AC Vehicle Assignment"
    ]]]},
    
    # Workspace - exports from workspace page files
    {"dt": "Workspace", "filters": [["name", "in", ["Megatechtrackers"]]]}
]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# Performance optimization: Disable animations for faster loading
app_include_css = "/assets/megatechtrackers/css/disable-animations.css"
app_include_js = [
    "/assets/megatechtrackers/js/link_formatters.js",
    "/assets/megatechtrackers/js/disable-animations.js"
]

# include js, css files in header of web template
# web_include_css = "/assets/megatechtrackers/css/megatechtrackers.css"
# web_include_js = "/assets/megatechtrackers/js/megatechtrackers.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "megatechtrackers/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "xxx"}
# webform_include_css = {"doctype": "xxx"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
doctype_js = {
	"Megatechtrackers Access Control" : "megatechtrackers/public/js/megatechtrackers_access_control.js",
	"User" : "megatechtrackers/public/js/user.js"
}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
#	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
#	"methods": "megatechtrackers.utils.jinja_methods",
#	"filters": "megatechtrackers.utils.jinja_filters"
# }

# Installation
# ------------
# No custom installation hooks needed - fixtures handle everything

# before_install = "megatechtrackers.install.before_install"
# after_install = "megatechtrackers.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "megatechtrackers.uninstall.before_uninstall"
# after_uninstall = "megatechtrackers.uninstall.after_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "megatechtrackers.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
#	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
#	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes (override as required)
# override_doctype_class = {
#	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
#	"*": {
#		"on_update": "method",
#		"on_cancel": "method",
#		"on_trash": "method"
#	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
#	"all": [
#		"megatechtrackers.tasks.all"
#	],
#	"daily": [
#		"megatechtrackers.tasks.daily"
#	],
#	"hourly": [
#		"megatechtrackers.tasks.hourly"
#	],
#	"weekly": [
#		"megatechtrackers.tasks.weekly"
#	],
#	"monthly": [
#		"megatechtrackers.tasks.monthly"
#	],
# }

# Testing
# -------

# before_tests = "megatechtrackers.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
#	"frappe.desk.doctype.event.event.get_events": "megatechtrackers.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
#	"Task": "megatechtrackers.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# --------------
# before_request = ["megatechtrackers.utils.before_request"]
after_request = ["megatechtrackers.utils.http.after_request"]

# Job Events
# ----------
# before_job = ["megatechtrackers.utils.before_job"]
# after_job = ["megatechtrackers.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
#	{
#		"doctype": "{doctype_1}",
#		"filter_by": "{filter_by}",
#		"redact_fields": ["{field_1}", "{field_2}"],
#		"partial": 1,
#	},
#	{
#		"doctype": "{doctype_2}",
#		"filter_by": "{filter_by}",
#		"partial": 1,
#	},
#	{
#		"doctype": "{doctype_3}",
#		"strict": False,
#	},
#	{"doctype": "{doctype_4}"}
# ]

# Authentication and authorization
# ---------------------------------

# auth_hooks = [
#	"megatechtrackers.auth.validate"
# ]

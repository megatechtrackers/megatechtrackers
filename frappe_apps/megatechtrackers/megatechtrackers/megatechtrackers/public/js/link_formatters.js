// Link formatters for Megatechtrackers app
// This file is included in hooks.py to ensure proper Link field display
// Frappe automatically handles show_title_field_in_link, but this file ensures
// the namespace exists and can be extended for custom formatting if needed

frappe.provide('megatechtrackers.formatters');

// Initialize formatters namespace
// Custom formatters can be added here if needed for specific Link field formatting
megatechtrackers.formatters = {};

// Note: Frappe automatically handles show_title_field_in_link property
// This file exists to prevent 404 errors when the app loads

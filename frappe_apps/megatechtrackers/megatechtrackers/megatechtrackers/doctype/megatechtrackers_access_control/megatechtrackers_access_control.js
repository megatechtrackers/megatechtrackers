// Client-side script for Megatechtrackers Access Control form
frappe.ui.form.on('Megatechtrackers Access Control', {
	refresh: function(frm) {
		// Add button to fetch available forms
		if (!frm.is_new()) {
			frm.add_custom_button(__('Fetch Available Forms'), function() {
				fetch_available_forms(frm);
			}, __('Actions'));
			
			// Add button to fetch available reports
			frm.add_custom_button(__('Fetch Available Reports'), function() {
				fetch_available_reports(frm);
			}, __('Actions'));
		}
		
		// Setup form assignment child table
		setup_form_assignment_table(frm);
		
		// Setup report assignment child table
		setup_report_assignment_table(frm);
	},
	
	user_type: function(frm) {
		// Show/hide parent company and department fields based on user type
		if (frm.doc.ac_user_type === 'Internal') {
			frm.set_value('ac_parent_company', '');
			frm.set_value('ac_parent_department', '');
		}
	}
});

function setup_form_assignment_table(frm) {
	frm.set_query('ac_form', 'ac_assigned_forms', function() {
		return {
			filters: {
				'is_active': 1
			},
			query: 'megatechtrackers.api.permissions.get_frappe_forms'
		};
	});
	
	// Add custom button to fetch forms from Frappe
	if (frm.fields_dict['ac_assigned_forms'] && frm.fields_dict['ac_assigned_forms'].grid) {
		frm.fields_dict['ac_assigned_forms'].grid.add_custom_button(__('Add from Frappe'), function() {
			show_form_selector(frm);
		});
	}
	
	// Handle Link field display refresh when form is selected
	frappe.ui.form.on('AC Frappe Form Assignment', {
		ac_form: function(frm, cdt, cdn) {
			const row = locals[cdt][cdn];
			if (row.ac_form) {
				// Force refresh the Link field to show title
				frappe.model.set_value(cdt, cdn, 'ac_form', row.ac_form);
				frm.refresh_field('ac_assigned_forms');
			}
		}
	});
}

function setup_report_assignment_table(frm) {
	// Add custom button to fetch reports from Grafana
	if (frm.fields_dict['ac_assigned_reports'] && frm.fields_dict['ac_assigned_reports'].grid) {
		frm.fields_dict['ac_assigned_reports'].grid.add_custom_button(__('Add from Grafana'), function() {
			show_report_selector(frm);
		});
	}
}

function fetch_available_forms(frm) {
	frappe.call({
		method: 'megatechtrackers.api.permissions.get_available_forms',
		callback: function(r) {
			if (r.message) {
				show_form_selector(frm, r.message);
			}
		}
	});
}

function fetch_available_reports(frm) {
	// Call Access Gateway to get available reports
	frappe.call({
		method: 'megatechtrackers.api.grafana.get_available_reports',
		callback: function(r) {
			if (r.message) {
				show_report_selector(frm, r.message);
			} else {
				frappe.msgprint(__('Failed to fetch reports from Grafana. Please check Access Gateway configuration.'));
			}
		}
	});
}

function show_form_selector(frm, forms) {
	if (!forms) {
		frappe.call({
			method: 'megatechtrackers.api.permissions.get_available_forms',
			callback: function(r) {
				if (r.message) {
					show_form_selector(frm, r.message);
				}
			}
		});
		return;
	}
	
	const dialog = new frappe.ui.Dialog({
		title: __('Select Forms'),
		fields: [
			{
				fieldtype: 'MultiSelectPills',
				fieldname: 'forms',
				label: __('Forms'),
				options: forms.map(f => ({ label: f.label || f.name, value: f.name }))
			}
		],
		primary_action_label: __('Add'),
		primary_action: function(values) {
			if (values.forms && values.forms.length > 0) {
				values.forms.forEach(form_name => {
					const form = forms.find(f => f.name === form_name);
					if (form) {
						// Check if already assigned
						const existing = frm.doc.ac_assigned_forms.find(f => f.ac_form === form_name);
						if (!existing) {
							const row = frm.add_child('ac_assigned_forms');
							frappe.model.set_value(row.doctype, row.name, 'ac_form', form.name);
							frappe.model.set_value(row.doctype, row.name, 'ac_inherited', 0);
						}
					}
				});
				frm.refresh_field('ac_assigned_forms');
				dialog.hide();
			}
		}
	});
	
	dialog.show();
}

function show_report_selector(frm, reports) {
	if (!reports) {
		// Fetch from Access Gateway
		frappe.call({
			method: 'megatechtrackers.api.grafana.get_available_reports',
			callback: function(r) {
				if (r.message) {
					show_report_selector(frm, r.message);
				} else {
					frappe.msgprint(__('Failed to fetch reports from Grafana. Please check Access Gateway configuration.'));
				}
			}
		});
		return;
	}
	
	const dialog = new frappe.ui.Dialog({
		title: __('Select Reports'),
		fields: [
			{
				fieldtype: 'MultiSelectPills',
				fieldname: 'reports',
				label: __('Reports'),
				options: reports.map(r => ({ 
					label: r.title || r.name || `Report ${r.id}`, 
					value: r.id,
					description: r.uid || ''
				}))
			},
			{
				fieldtype: 'Section Break',
				fieldname: 'context_section',
				label: __('Context Filters (Optional)')
			},
			{
				fieldtype: 'Small Text',
				fieldname: 'context_vehicles',
				label: __('Vehicles (comma-separated)')
			},
			{
				fieldtype: 'Small Text',
				fieldname: 'context_companies',
				label: __('Companies (comma-separated)')
			},
			{
				fieldtype: 'Small Text',
				fieldname: 'context_departments',
				label: __('Departments (comma-separated)')
			}
		],
		primary_action_label: __('Add'),
		primary_action: function(values) {
			if (values.reports && values.reports.length > 0) {
				// First sync reports to ensure they exist in Report master
				frappe.call({
					method: 'megatechtrackers.api.grafana.get_available_reports',
					callback: function(sync_r) {
						// Now add assignments
						values.reports.forEach(report_id => {
							const report = reports.find(r => r.id === parseInt(report_id));
							if (report) {
								// Find the report by ID in Report master
								frappe.db.get_value('AC Grafana Report', {'ac_report_id': report.id}, 'name', function(report_record) {
									if (report_record && report_record.name) {
										// Check if already assigned
										const existing = frm.doc.ac_assigned_reports.find(r => r.ac_report === report_record.name);
										if (!existing) {
											const row = frm.add_child('ac_assigned_reports');
											frappe.model.set_value(row.doctype, row.name, 'ac_report', report_record.name);
											frappe.model.set_value(row.doctype, row.name, 'ac_inherited', 0);
											if (values.context_vehicles) {
												frappe.model.set_value(row.doctype, row.name, 'ac_context_vehicles', values.context_vehicles);
											}
											if (values.context_companies) {
												frappe.model.set_value(row.doctype, row.name, 'ac_context_companies', values.context_companies);
											}
											if (values.context_departments) {
												frappe.model.set_value(row.doctype, row.name, 'ac_context_departments', values.context_departments);
											}
										}
									}
								});
							}
						});
						frm.refresh_field('ac_assigned_reports');
						dialog.hide();
					}
				});
			}
		}
	});
	
	dialog.show();
}

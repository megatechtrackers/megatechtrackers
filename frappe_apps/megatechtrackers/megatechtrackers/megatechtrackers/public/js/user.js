// Client-side script to extend User form with Megatechtrackers Access Control integration
frappe.ui.form.on('User', {
	refresh: function(frm) {
		// Only show extension if user is not Guest and not a new record
		if (frm.doc.name && frm.doc.name !== 'Guest' && !frm.is_new()) {
			// Load and display Megatechtrackers Access Control dashboard
			load_megatechtrackers_access_control_dashboard(frm);
		}
	}
});

function load_megatechtrackers_access_control_dashboard(frm) {
	// Check if Megatechtrackers Access Control record exists
	frappe.db.get_value('Megatechtrackers Access Control', {'ac_user': frm.doc.name}, ['name', 'ac_user_type', 'ac_parent_company', 'ac_parent_department'], function(r) {
		if (r && r.name) {
			// Megatechtrackers Access Control exists - show dashboard and button
			display_access_control_dashboard(frm, r);
			add_access_control_button(frm, r.name, true);
		} else {
			// Megatechtrackers Access Control doesn't exist - show create option
			display_no_access_control_message(frm);
			add_access_control_button(frm, null, false);
		}
	});
}

function display_access_control_dashboard(frm, access_control_data) {
	// Get user permissions summary
	frappe.call({
		method: 'megatechtrackers.api.permissions.get_user_permissions',
		args: {
			user: frm.doc.name
		},
		callback: function(r) {
			if (r.message) {
				const permissions = r.message;
				const forms_count = permissions.forms ? permissions.forms.length : 0;
				const reports_count = permissions.reports ? permissions.reports.length : 0;
				const context = permissions.context || {};
				
				// Create dashboard HTML with link to full form
				let dashboard_html = `
					<div class="access-control-dashboard" style="margin: 15px 0; padding: 15px; background: #f8f9fa; border-radius: 4px; border: 1px solid #dee2e6;">
						<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
							<h5 style="margin: 0; color: #495057;">
								<i class="fa fa-shield" style="margin-right: 5px;"></i>
								${__('Megatechtrackers Access Control')}
								<a href="#" onclick="frappe.set_route('Form', 'Megatechtrackers Access Control', '${access_control_data.name}'); return false;" 
								   style="margin-left: 10px; font-size: 12px; color: #007bff; text-decoration: none;">
									<i class="fa fa-external-link"></i> ${__('Open Full Form')}
								</a>
							</h5>
							<span class="badge badge-primary" style="font-size: 12px;">
								${access_control_data.ac_user_type || __('Not Set')}
							</span>
						</div>
						
						<div class="row" style="margin: 0;">
							<div class="col-md-4" style="padding: 10px;">
								<div style="text-align: center; padding: 10px; background: white; border-radius: 4px;">
									<div style="font-size: 24px; font-weight: bold; color: #007bff;">${forms_count}</div>
									<div style="font-size: 12px; color: #6c757d; margin-top: 5px;">${__('Forms Assigned')}</div>
								</div>
							</div>
							<div class="col-md-4" style="padding: 10px;">
								<div style="text-align: center; padding: 10px; background: white; border-radius: 4px;">
									<div style="font-size: 24px; font-weight: bold; color: #28a745;">${reports_count}</div>
									<div style="font-size: 12px; color: #6c757d; margin-top: 5px;">${__('Reports Assigned')}</div>
								</div>
							</div>
							<div class="col-md-4" style="padding: 10px;">
								<div style="text-align: center; padding: 10px; background: white; border-radius: 4px;">
									<div style="font-size: 24px; font-weight: bold; color: #ffc107;">
										${(context.vehicles ? context.vehicles.length : 0) + (context.companies ? context.companies.length : 0) + (context.departments ? context.departments.length : 0)}
									</div>
									<div style="font-size: 12px; color: #6c757d; margin-top: 5px;">${__('Context Items')}</div>
								</div>
							</div>
						</div>
						
						${access_control_data.ac_parent_company ? `
							<div style="margin-top: 10px; padding: 8px; background: white; border-radius: 4px; font-size: 12px;">
								<strong>${__('Parent Company')}:</strong> ${access_control_data.ac_parent_company}
							</div>
						` : ''}
						${access_control_data.ac_parent_department ? `
							<div style="margin-top: 5px; padding: 8px; background: white; border-radius: 4px; font-size: 12px;">
								<strong>${__('Parent Department')}:</strong> ${access_control_data.ac_parent_department}
							</div>
						` : ''}
					</div>
				`;
				
				// Add dashboard to form using Frappe's dashboard API
				if (frm.dashboard) {
					// Remove existing dashboard if present
					frm.dashboard.find('.access-control-dashboard').remove();
					// Add new dashboard at the top
					frm.dashboard.prepend(dashboard_html);
				} else {
					// Create dashboard container if it doesn't exist
					frm.dashboard = $('<div class="form-dashboard-section" style="margin-top: 20px;"></div>');
					frm.dashboard.append(dashboard_html);
					// Insert after form fields, before custom fields if any
					if (frm.fields_dict && Object.keys(frm.fields_dict).length > 0) {
						// Find the last field wrapper and insert after it
						const last_field = $(frm.wrapper).find('.form-section:last');
						if (last_field.length) {
							last_field.after(frm.dashboard);
						} else {
							$(frm.wrapper).find('.form-layout').append(frm.dashboard);
						}
					} else {
						$(frm.wrapper).find('.form-layout').append(frm.dashboard);
					}
				}
			}
		}
	});
}

function display_no_access_control_message(frm) {
	// Create message HTML
	let message_html = `
		<div class="access-control-dashboard" style="margin: 15px 0; padding: 15px; background: #fff3cd; border-radius: 4px; border: 1px solid #ffc107;">
			<div style="display: flex; align-items: center;">
				<i class="fa fa-info-circle" style="margin-right: 10px; color: #856404; font-size: 18px;"></i>
				<div>
					<strong style="color: #856404;">${__('No Megatechtrackers Access Control configured')}</strong>
					<div style="font-size: 12px; color: #856404; margin-top: 5px;">
						${__('Click "Create Megatechtrackers Access Control" button to set up access permissions for this user.')}
					</div>
				</div>
			</div>
		</div>
	`;
	
	// Add message to form using Frappe's dashboard API
	if (frm.dashboard) {
		// Remove existing dashboard if present
		frm.dashboard.find('.access-control-dashboard').remove();
		// Add new message
		frm.dashboard.prepend(message_html);
	} else {
		// Create dashboard container if it doesn't exist
		frm.dashboard = $('<div class="form-dashboard-section" style="margin-top: 20px;"></div>');
		frm.dashboard.append(message_html);
		// Insert after form fields, before custom fields if any
		if (frm.fields_dict && Object.keys(frm.fields_dict).length > 0) {
			// Find the last field wrapper and insert after it
			const last_field = $(frm.wrapper).find('.form-section:last');
			if (last_field.length) {
				last_field.after(frm.dashboard);
			} else {
				$(frm.wrapper).find('.form-layout').append(frm.dashboard);
			}
		} else {
			$(frm.wrapper).find('.form-layout').append(frm.dashboard);
		}
	}
}

function add_access_control_button(frm, access_control_name, exists) {
	// Always add button - both dashboard and button are available
	// This gives users two ways to access: quick view (dashboard) or full form (button)
	if (exists && access_control_name) {
		// Megatechtrackers Access Control exists - add button to open full form
		frm.add_custom_button(__('Open Megatechtrackers Access Control'), function() {
			frappe.set_route('Form', 'Megatechtrackers Access Control', access_control_name);
		}, __('Megatechtrackers'));
	} else {
		// Megatechtrackers Access Control doesn't exist - add button to create it
		frm.add_custom_button(__('Create Megatechtrackers Access Control'), function() {
			frappe.prompt([
				{
					fieldname: 'user_type',
					fieldtype: 'Select',
					label: __('User Type'),
					options: 'Internal\nClient - Single User\nClient - Company\nClient - Sub-Company',
					reqd: 1,
					default: 'Internal'
				},
				{
					fieldname: 'parent_company',
					fieldtype: 'Link',
					label: __('Parent Company'),
					options: 'AC Company',
					depends_on: 'eval:in_list(["Client - Company", "Client - Sub-Company"], user_type)'
				},
				{
					fieldname: 'parent_department',
					fieldtype: 'Link',
					label: __('Parent Department'),
					options: 'AC Department',
					depends_on: 'eval:user_type === "Client - Sub-Company"'
				}
			], function(values) {
				// Create Megatechtrackers Access Control record
				frappe.call({
					method: 'megatechtrackers.api.permissions.create_megatechtrackers_access_control',
					args: {
						user: frm.doc.name,
						user_type: values.user_type,
						parent_company: values.parent_company || null,
						parent_department: values.parent_department || null
					},
					callback: function(r) {
						if (r.message && r.message.success) {
							frappe.show_alert({
								message: __('Megatechtrackers Access Control created successfully'),
								indicator: 'green'
							}, 3);
							// Refresh form to show dashboard
							frm.reload_doc();
							// Open the newly created record
							setTimeout(function() {
								frappe.set_route('Form', 'Megatechtrackers Access Control', r.message.name);
							}, 500);
						}
					}
				});
			}, __('Create Megatechtrackers Access Control'), __('Create'));
		}, __('Megatechtrackers'));
	}
}

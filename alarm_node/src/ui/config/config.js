// Config UI JavaScript
// Time-of-day: local (browser or working TZ) <-> UTC. Optional working TZ for managing devices in another region.

const WORKING_TZ_KEY = 'alarm_working_timezone';

function getWorkingTimezone() {
    try { return localStorage.getItem(WORKING_TZ_KEY) || ''; } catch { return ''; }
}

function getOffsetMinutes(timeZone) {
    try {
        const formatter = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' });
        const tz = formatter.formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value || '';
        const m = tz.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
        if (!m) return 0;
        const sign = m[1] === '-' ? 1 : -1;
        return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3] || '0', 10));
    } catch { return 0; }
}

function timeLocalToUTC(localTime, timezone) {
    const [h, m, s = 0] = localTime.split(':').map(Number);
    if (!timezone) {
        const d = new Date();
        d.setHours(h, m, s, 0);
        const uh = d.getUTCHours(), um = d.getUTCMinutes(), us = d.getUTCSeconds();
        return `${String(uh).padStart(2, '0')}:${String(um).padStart(2, '0')}:${String(us).padStart(2, '0')}`;
    }
    const off = getOffsetMinutes(timezone) * 60;
    const localSec = h * 3600 + m * 60 + s;
    const utcSec = ((localSec - off) % 86400 + 86400) % 86400;
    const uh = Math.floor(utcSec / 3600) % 24, um = Math.floor((utcSec % 3600) / 60), us = Math.floor(utcSec % 60);
    return `${String(uh).padStart(2, '0')}:${String(um).padStart(2, '0')}:${String(us).padStart(2, '0')}`;
}

function timeUTCToLocal(utcTime, timezone) {
    const [h, m, s = 0] = utcTime.split(':').map(Number);
    if (!timezone) {
        const d = new Date();
        d.setUTCHours(h, m, s, 0);
        const lh = d.getHours(), lm = d.getMinutes();
        return `${String(lh).padStart(2, '0')}:${String(lm).padStart(2, '0')}`;
    }
    const off = getOffsetMinutes(timezone);
    const utcMins = h * 60 + m + s / 60;
    const localMins = ((utcMins + off) % 1440 + 1440) % 1440;
    const lh = Math.floor(localMins / 60) % 24, lm = Math.floor(localMins % 60);
    return `${String(lh).padStart(2, '0')}:${String(lm).padStart(2, '0')}`;
}

// Init working timezone from localStorage
document.addEventListener('DOMContentLoaded', function() {
    const sel = document.getElementById('working-timezone');
    if (sel) {
        sel.value = getWorkingTimezone();
        sel.addEventListener('change', function() {
            try { localStorage.setItem(WORKING_TZ_KEY, sel.value || ''); } catch (_) {}
            if (typeof filterContacts === 'function') filterContacts();
            if (typeof loadTemplates === 'function') loadTemplates();
        });
    }
});

// Tab switching
initTabs();

// Initial load
loadSystemState();
loadSMSModems();

// Load data when tabs are clicked (so user doesn't wait for interval)
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        if (tabName === 'templates') loadTemplates();
        if (tabName === 'contacts') loadContacts();
        if (tabName === 'alert-recipients') loadAlertRecipients();
        if (tabName === 'email') loadEmailSettings();
        if (tabName === 'push') loadPushSettings();
    });
});

// Auto-refresh every 10 seconds
setInterval(() => {
    const activeTab = document.querySelector('.tab.active')?.dataset.tab;
    if (activeTab === 'system') loadSystemState();
    if (activeTab === 'sms-modems') loadSMSModems();
    if (activeTab === 'templates') loadTemplates();
}, 10000);

async function loadSystemState() {
    try {
        const res = await fetch('/api/config/system/state');
        const data = await res.json();
        
        if (data.success) {
            const state = data.state;
            document.getElementById('system-state-value').textContent = 
                state.state === 'running' ? 'Running' : 'Paused';
            document.getElementById('sms-mode-value').textContent = 
                state.use_mock_sms ? 'Mock' : 'Real';
            document.getElementById('email-mode-value').textContent = 
                state.use_mock_email ? 'Mock' : 'Real';
            
            const indicator = document.getElementById('system-status-indicator');
            if (indicator) {
                indicator.innerHTML = state.state === 'running' 
                    ? '<span class="badge badge-success">System Running</span>'
                    : '<span class="badge badge-warning">System Paused</span>';
            }
            
            updateSystemToggleButton(state);
        }
    } catch (error) {
        console.error('Failed to load system state:', error);
    }
}

function updateSystemToggleButton(state) {
    const toggleBtn = document.getElementById('system-toggle-btn');
    const toggleIcon = document.getElementById('system-toggle-icon');
    const toggleText = document.getElementById('system-toggle-text');
    const toggleStatus = document.getElementById('system-toggle-status');
    
    if (!toggleBtn) return;
    
    if (state.state === 'running') {
        toggleBtn.className = 'btn btn-warning';
        if (toggleIcon) toggleIcon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
        if (toggleText) toggleText.textContent = 'Pause System';
        if (toggleStatus) {
            toggleStatus.className = 'badge badge-success';
            toggleStatus.textContent = 'Running';
        }
    } else {
        toggleBtn.className = 'btn btn-success';
        if (toggleIcon) toggleIcon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21"/></svg>';
        if (toggleText) toggleText.textContent = 'Resume System';
        if (toggleStatus) {
            toggleStatus.className = 'badge badge-warning';
            toggleStatus.textContent = 'Paused';
        }
    }
}

async function loadSMSModems() {
    try {
        const [modemsRes, statusRes] = await Promise.all([
            fetch('/api/config/sms/modems'),
            fetch('/api/config/sms/status')
        ]);
        
        const modemsData = await modemsRes.json();
        const statusData = await statusRes.json();
        
        if (modemsData.success) {
            const tbody = document.getElementById('sms-modems-table');
            if (!tbody) return;
            
            if (modemsData.modems.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" class="text-center">No SMS modems configured. Click "Add Modem" to get started.</td></tr>';
            } else {
                tbody.innerHTML = modemsData.modems.map(modem => {
                    const sentCount = parseInt(modem.sms_sent_count) || 0;
                    const limit = parseInt(modem.sms_limit) || 0;
                    const usagePct = limit > 0 ? ((sentCount / limit) * 100).toFixed(2) : '0';
                    const remaining = limit - sentCount;
                    const endDate = modem.package_end_date ? formatDateOnly(modem.package_end_date) : 'Not set';
                    const daysLeft = calculateDaysLeft(modem.package_end_date);
                    const isEnabled = modem.enabled;
                    // Format allowed services as badges
                    const services = modem.allowed_services || ['alarms', 'commands'];
                    const serviceLabels = {
                        'alarms': { label: 'A', title: 'Alarms', color: '#ef4444' },
                        'commands': { label: 'C', title: 'Commands', color: '#3b82f6' },
                        'otp': { label: 'O', title: 'OTP', color: '#10b981' },
                        'marketing': { label: 'M', title: 'Marketing', color: '#8b5cf6' }
                    };
                    const serviceBadges = services.map(s => {
                        const info = serviceLabels[s] || { label: s[0].toUpperCase(), title: s, color: '#6b7280' };
                        return `<span title="${info.title}" style="display: inline-block; width: 20px; height: 20px; line-height: 20px; text-align: center; border-radius: 4px; background: ${info.color}; color: white; font-size: 10px; font-weight: bold; margin-right: 2px;">${info.label}</span>`;
                    }).join('');
                    
                    return `
                        <tr style="${!isEnabled ? 'opacity: 0.6;' : ''}">
                            <td><strong>${modem.name}</strong></td>
                            <td><small>${modem.host}</small></td>
                            <td>${serviceBadges || '<span class="text-muted">None</span>'}</td>
                            <td>
                                <label class="toggle-switch" title="Click to ${isEnabled ? 'disable' : 'enable'}">
                                    <input type="checkbox" ${isEnabled ? 'checked' : ''} onchange="toggleModem(${modem.id}, this.checked)">
                                    <span class="toggle-slider"></span>
                                </label>
                            </td>
                            <td><span class="badge badge-${getHealthBadgeClass(modem.health_status)}">${modem.health_status || 'unknown'}</span></td>
                            <td>
                                <div class="usage-info">${formatNumber(sentCount)} / ${formatNumber(limit)}</div>
                                <div class="usage-percentage" style="color: ${getUsageColor(usagePct)};">${usagePct}% used</div>
                                <div class="usage-remaining">${formatNumber(remaining)} remaining</div>
                            </td>
                            <td>
                                <div class="package-cost">${formatCurrency(modem.package_cost || 0, modem.package_currency || 'PKR')}</div>
                                <div class="package-label">Per package</div>
                            </td>
                            <td>
                                <div class="expiry-info">${endDate}</div>
                                ${daysLeft !== null ? `<div class="expiry-days" style="color: ${getDaysLeftColor(daysLeft)};">${daysLeft} days left</div>` : ''}
                            </td>
                            <td class="action-buttons">
                                <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.75rem;" onclick="editModem(${modem.id})">Edit</button>
                                <button class="btn btn-warning" style="padding: 6px 12px; font-size: 0.75rem;" onclick="showPackageModal(${modem.id})">Package</button>
                                <button class="btn btn-success" style="padding: 6px 12px; font-size: 0.75rem;" onclick="resetPackage(${modem.id}, '${modem.name.replace(/'/g, "\\'")}')">Reset</button>
                                <button class="btn btn-danger" style="padding: 6px 12px; font-size: 0.75rem;" onclick="deleteModem(${modem.id}, '${modem.name.replace(/'/g, "\\'")}')">Delete</button>
                            </td>
                        </tr>
                    `;
                }).join('');
            }
        }
        
        if (statusData.success) {
            const status = statusData.status;
            const totalUsed = status.totalSmsUsed || 0;
            const totalLimit = status.totalSmsLimit || 0;
            const poolUsage = totalLimit > 0 ? ((totalUsed / totalLimit) * 100).toFixed(2) : '0';
            const summary = document.getElementById('sms-status-summary');
            if (summary) {
                summary.innerHTML = `
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px;">
                        <div class="status-card" style="padding: 12px;">
                            <div class="status-card-label">Total Modems</div>
                            <div class="status-card-value">${status.totalModems}</div>
                        </div>
                        <div class="status-card" style="padding: 12px;">
                            <div class="status-card-label">Healthy</div>
                            <div class="status-card-value" style="color: var(--accent-success);">${status.healthyModems}</div>
                        </div>
                        <div class="status-card" style="padding: 12px;">
                            <div class="status-card-label">Quota Exhausted</div>
                            <div class="status-card-value" style="color: var(--accent-danger);">${status.quotaExhaustedModems || 0}</div>
                        </div>
                        <div class="status-card" style="padding: 12px;">
                            <div class="status-card-label">Pool Usage</div>
                            <div class="status-card-value" style="color: ${getUsageColor(poolUsage)};">${poolUsage}%</div>
                        </div>
                        <div class="status-card" style="padding: 12px;">
                            <div class="status-card-label">Total SMS Used</div>
                            <div class="status-card-value">${formatNumber(totalUsed)} / ${formatNumber(totalLimit)}</div>
                        </div>
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('Failed to load SMS modems:', error);
    }
}

async function loadTemplates() {
    try {
        const channel = document.getElementById('template-filter-channel')?.value || '';
        const type = document.getElementById('template-filter-type')?.value || '';
        
        let url = '/api/config/templates';
        const params = [];
        if (channel) params.push(`channel=${channel}`);
        if (type) params.push(`template_type=${type}`);
        if (params.length > 0) url += '?' + params.join('&');
        
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.success) {
            const tbody = document.getElementById('templates-table');
            if (!tbody) return;
            
            if (data.templates.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center">No templates found. Click "Add Template" to create one.</td></tr>';
            } else {
                tbody.innerHTML = data.templates.map(template => `
                    <tr>
                        <td><strong>${template.name}</strong></td>
                        <td><span class="badge badge-secondary">${template.channel}</span></td>
                        <td>${template.template_type}</td>
                        <td>v${template.version}</td>
                        <td><span class="badge badge-${template.is_active ? 'success' : 'secondary'}">${template.is_active ? 'Active' : 'Inactive'}</span></td>
                        <td>${formatDate(template.updated_at)}</td>
                        <td class="action-buttons">
                            <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.75rem;" onclick="editTemplate(${template.id})">Edit</button>
                            <button class="btn btn-danger" style="padding: 6px 12px; font-size: 0.75rem;" onclick="deleteTemplate(${template.id}, '${template.name.replace(/'/g, "\\'")}')">Delete</button>
                        </td>
                    </tr>
                `).join('');
            }
        }
    } catch (error) {
        console.error('Failed to load templates:', error);
    }
}

// System Control Functions
async function toggleSystemState() {
    try {
        const stateRes = await fetch('/api/config/system/state');
        const stateData = await stateRes.json();
        
        if (!stateData.success) {
            showAlert('alert-container', 'Failed to get current state', 'danger');
            return;
        }
        
        const isRunning = stateData.state.state === 'running';
        
        if (isRunning) {
            const reason = prompt('Reason for pausing (optional):');
            if (reason === null) return;
            
            const res = await fetch('/api/config/system/pause', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: reason || 'Manual pause', paused_by: 'admin' })
            });
            const data = await res.json();
            showAlert('alert-container', data.message, data.success ? 'success' : 'danger');
        } else {
            const res = await fetch('/api/config/system/resume', { method: 'POST' });
            const data = await res.json();
            showAlert('alert-container', data.message, data.success ? 'success' : 'danger');
        }
        
        loadSystemState();
    } catch (error) {
        showAlert('alert-container', 'Failed to toggle system state: ' + error.message, 'danger');
    }
}

async function toggleMockMode(channel) {
    try {
        const currentState = await fetch('/api/config/system/state').then(r => r.json());
        const isMock = channel === 'sms' ? currentState.state.use_mock_sms : currentState.state.use_mock_email;
        
        const res = await fetch('/api/config/system/mock-mode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel, enabled: !isMock })
        });
        const data = await res.json();
        showAlert('alert-container', data.message, data.success ? 'success' : 'danger');
        if (data.success) loadSystemState();
    } catch (error) {
        showAlert('alert-container', 'Failed to toggle mock mode: ' + error.message, 'danger');
    }
}

// SMS Modem Functions
function showAddModemModal() {
    document.getElementById('modem-modal-title').textContent = 'Add SMS Modem';
    document.getElementById('modem-form').reset();
    document.getElementById('modem-id').value = '';
    document.getElementById('modem-priority').value = '5';
    document.getElementById('modem-max-concurrent').value = '5';
    document.getElementById('modem-enabled').value = 'true';
    document.getElementById('modem-package-currency').value = 'PKR';
    document.getElementById('modem-sms-limit').value = '';
    document.getElementById('modem-package-cost').value = '';
    document.getElementById('modem-package-end-date').value = '';
    // Default services: alarms and commands
    document.getElementById('modem-service-alarms').checked = true;
    document.getElementById('modem-service-commands').checked = true;
    document.getElementById('modem-service-otp').checked = false;
    document.getElementById('modem-service-marketing').checked = false;
    document.getElementById('modem-modal').classList.add('active');
}

async function editModem(id) {
    try {
        const res = await fetch(`/api/config/sms/modems/${id}`);
        const data = await res.json();
        
        if (data.success) {
            const modem = data.modem;
            document.getElementById('modem-modal-title').textContent = 'Edit SMS Modem';
            document.getElementById('modem-id').value = modem.id;
            document.getElementById('modem-name').value = modem.name;
            document.getElementById('modem-host').value = modem.host;
            document.getElementById('modem-username').value = modem.username;
            document.getElementById('modem-password').value = '';
            document.getElementById('modem-cert').value = modem.cert_fingerprint || '';
            document.getElementById('modem-modem-id').value = modem.modem_id;
            document.getElementById('modem-priority').value = modem.priority;
            document.getElementById('modem-max-concurrent').value = modem.max_concurrent_sms;
            document.getElementById('modem-enabled').value = modem.enabled;
            document.getElementById('modem-sms-limit').value = modem.sms_limit || '';
            document.getElementById('modem-package-cost').value = modem.package_cost || '';
            document.getElementById('modem-package-currency').value = modem.package_currency || 'PKR';
            document.getElementById('modem-package-end-date').value = modem.package_end_date ? utcDateToLocalYYYYMMDD(modem.package_end_date, getWorkingTimezone()) : '';
            // Set service checkboxes
            const services = modem.allowed_services || ['alarms', 'commands'];
            document.getElementById('modem-service-alarms').checked = services.includes('alarms');
            document.getElementById('modem-service-commands').checked = services.includes('commands');
            document.getElementById('modem-service-otp').checked = services.includes('otp');
            document.getElementById('modem-service-marketing').checked = services.includes('marketing');
            document.getElementById('modem-modal').classList.add('active');
        }
    } catch (error) {
        showAlert('sms-alert-container', 'Failed to load modem: ' + error.message, 'danger');
    }
}

async function deleteModem(id, name) {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;
    
    try {
        const res = await fetch(`/api/config/sms/modems/${id}`, { method: 'DELETE' });
        const data = await res.json();
        showAlert('sms-alert-container', data.message || 'Modem deleted', data.success ? 'success' : 'danger');
        if (data.success) loadSMSModems();
    } catch (error) {
        showAlert('sms-alert-container', 'Failed to delete modem: ' + error.message, 'danger');
    }
}

async function toggleModem(id, enabled) {
    try {
        const res = await fetch(`/api/config/sms/modems/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        });
        const data = await res.json();
        if (data.success) {
            showAlert('sms-alert-container', `Modem ${enabled ? 'enabled' : 'disabled'}`, 'success');
            loadSMSModems();
        } else {
            showAlert('sms-alert-container', data.error || 'Failed to toggle modem', 'danger');
            loadSMSModems(); // Reload to reset checkbox state
        }
    } catch (error) {
        showAlert('sms-alert-container', 'Failed to toggle modem: ' + error.message, 'danger');
        loadSMSModems(); // Reload to reset checkbox state
    }
}

function closeModemModal() {
    document.getElementById('modem-modal').classList.remove('active');
}

document.getElementById('modem-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('modem-id').value;
    const isEdit = !!id;
    
    // Collect allowed services from checkboxes
    const allowedServices = [];
    if (document.getElementById('modem-service-alarms').checked) allowedServices.push('alarms');
    if (document.getElementById('modem-service-commands').checked) allowedServices.push('commands');
    if (document.getElementById('modem-service-otp').checked) allowedServices.push('otp');
    if (document.getElementById('modem-service-marketing').checked) allowedServices.push('marketing');
    
    const data = {
        name: document.getElementById('modem-name').value,
        host: document.getElementById('modem-host').value,
        username: document.getElementById('modem-username').value,
        password: document.getElementById('modem-password').value,
        cert_fingerprint: document.getElementById('modem-cert').value,
        modem_id: document.getElementById('modem-modem-id').value,
        priority: parseInt(document.getElementById('modem-priority').value),
        max_concurrent_sms: parseInt(document.getElementById('modem-max-concurrent').value),
        enabled: document.getElementById('modem-enabled').value === 'true',
        allowed_services: allowedServices,
        sms_limit: document.getElementById('modem-sms-limit').value ? parseInt(document.getElementById('modem-sms-limit').value) : undefined,
        package_cost: document.getElementById('modem-package-cost').value ? parseFloat(document.getElementById('modem-package-cost').value) : undefined,
        package_currency: document.getElementById('modem-package-currency').value,
        package_end_date: document.getElementById('modem-package-end-date').value || undefined
    };
    
    try {
        const res = await fetch(
            isEdit ? `/api/config/sms/modems/${id}` : '/api/config/sms/modems',
            {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            }
        );
        const result = await res.json();
        showAlert('sms-alert-container', 
            result.success ? (isEdit ? 'Modem updated' : 'Modem added') : result.error, 
            result.success ? 'success' : 'danger'
        );
        if (result.success) {
            closeModemModal();
            loadSMSModems();
        }
    } catch (error) {
        showAlert('sms-alert-container', 'Failed to save modem: ' + error.message, 'danger');
    }
});

// Package Management
async function showPackageModal(modemId) {
    try {
        const res = await fetch(`/api/config/sms/modems/${modemId}`);
        const data = await res.json();
        
        if (data.success) {
            const modem = data.modem;
            document.getElementById('package-modem-id').value = modemId;
            document.getElementById('package-sms-limit').value = modem.sms_limit || '';
            document.getElementById('package-cost').value = modem.package_cost || '';
            document.getElementById('package-currency').value = modem.package_currency || 'PKR';
            document.getElementById('package-end-date').value = modem.package_end_date ? utcDateToLocalYYYYMMDD(modem.package_end_date, getWorkingTimezone()) : '';
            document.getElementById('package-modal').classList.add('active');
        }
    } catch (error) {
        showAlert('sms-alert-container', 'Failed to load package info: ' + error.message, 'danger');
    }
}

function closePackageModal() {
    document.getElementById('package-modal').classList.remove('active');
}

async function resetPackage(modemId, name) {
    if (!confirm(`Reset SMS count for "${name}"? This will set sent count to 0.`)) return;
    
    try {
        const res = await fetch(`/api/config/sms/modems/${modemId}/reset-package`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const data = await res.json();
        showAlert('sms-alert-container', data.message || 'Package reset', data.success ? 'success' : 'danger');
        if (data.success) loadSMSModems();
    } catch (error) {
        showAlert('sms-alert-container', 'Failed to reset package: ' + error.message, 'danger');
    }
}

document.getElementById('package-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const modemId = document.getElementById('package-modem-id').value;
    
    const data = {
        sms_limit: parseInt(document.getElementById('package-sms-limit').value),
        package_cost: parseFloat(document.getElementById('package-cost').value),
        package_currency: document.getElementById('package-currency').value,
        package_end_date: document.getElementById('package-end-date').value
    };
    
    try {
        const res = await fetch(`/api/config/sms/modems/${modemId}/package`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        showAlert('sms-alert-container', result.message || 'Package updated', result.success ? 'success' : 'danger');
        if (result.success) {
            closePackageModal();
            loadSMSModems();
        }
    } catch (error) {
        showAlert('sms-alert-container', 'Failed to update package: ' + error.message, 'danger');
    }
});

// Template Management
function showAddTemplateModal() {
    document.getElementById('template-modal-title').textContent = 'Add Template';
    document.getElementById('template-form').reset();
    document.getElementById('template-id').value = '';
    document.getElementById('template-version').value = '1';
    document.getElementById('template-modal').classList.add('active');
}

async function editTemplate(id) {
    try {
        const res = await fetch(`/api/config/templates/${id}`);
        const data = await res.json();
        
        if (data.success) {
            const template = data.template;
            document.getElementById('template-modal-title').textContent = 'Edit Template';
            document.getElementById('template-id').value = template.id;
            document.getElementById('template-name').value = template.name;
            document.getElementById('template-channel').value = template.channel;
            document.getElementById('template-type').value = template.template_type;
            document.getElementById('template-version').value = template.version;
            document.getElementById('template-subject').value = template.subject || '';
            document.getElementById('template-body').value = template.body || '';
            document.getElementById('template-variables').value = template.variables ? JSON.stringify(template.variables, null, 2) : '';
            document.getElementById('template-modal').classList.add('active');
        }
    } catch (error) {
        showAlert('templates-alert-container', 'Failed to load template: ' + error.message, 'danger');
    }
}

async function deleteTemplate(id, name) {
    if (!confirm(`Deactivate template "${name}"?`)) return;
    
    try {
        const res = await fetch(`/api/config/templates/${id}`, { method: 'DELETE' });
        const data = await res.json();
        showAlert('templates-alert-container', data.message || 'Template deactivated', data.success ? 'success' : 'danger');
        if (data.success) loadTemplates();
    } catch (error) {
        showAlert('templates-alert-container', 'Failed to delete template: ' + error.message, 'danger');
    }
}

function closeTemplateModal() {
    document.getElementById('template-modal').classList.remove('active');
}

document.getElementById('template-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('template-id').value;
    const isEdit = !!id;
    
    let variables = null;
    try {
        const varsText = document.getElementById('template-variables').value.trim();
        if (varsText) {
            variables = JSON.parse(varsText);
        }
    } catch (error) {
        showAlert('templates-alert-container', 'Invalid JSON in variables field', 'danger');
        return;
    }
    
    const data = {
        name: document.getElementById('template-name').value,
        channel: document.getElementById('template-channel').value,
        template_type: document.getElementById('template-type').value,
        version: parseInt(document.getElementById('template-version').value),
        subject: document.getElementById('template-subject').value || null,
        body: document.getElementById('template-body').value,
        variables: variables
    };
    
    try {
        const res = await fetch(
            isEdit ? `/api/config/templates/${id}` : '/api/config/templates',
            {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            }
        );
        const result = await res.json();
        showAlert('templates-alert-container', 
            result.success ? (isEdit ? 'Template updated' : 'Template created') : result.error, 
            result.success ? 'success' : 'danger'
        );
        if (result.success) {
            closeTemplateModal();
            loadTemplates();
        }
    } catch (error) {
        showAlert('templates-alert-container', 'Failed to save template: ' + error.message, 'danger');
    }
});

// Email Settings
async function loadEmailSettings() {
    try {
        const res = await fetch('/api/config/channels');
        const data = await res.json();
        if (!data.success || !data.configurations) return;
        const configs = data.configurations;
        const getVal = (key, mock) => {
            const r = configs.find(c => c.channel_type === 'email' && c.config_key === key && c.is_mock === mock);
            return r && r.config_value !== '***ENCRYPTED***' ? r.config_value : '';
        };
        document.getElementById('smtp-host').value = getVal('smtp_host', false);
        document.getElementById('smtp-port').value = getVal('smtp_port', false);
        document.getElementById('smtp-user').value = getVal('smtp_user', false);
        document.getElementById('smtp-password').value = getVal('smtp_password', false) ? '********' : '';
        document.getElementById('smtp-secure').value = getVal('smtp_secure', false) || 'false';
        const tz = getVal('display_timezone', false);
        const tzSel = document.getElementById('email-display-timezone');
        if (tzSel) tzSel.value = tz || '';
        document.getElementById('mock-smtp-host').value = getVal('smtp_host', true);
        document.getElementById('mock-smtp-port').value = getVal('smtp_port', true);
    } catch (error) {
        console.error('Failed to load email settings:', error);
    }
}

async function loadPushSettings() {
    try {
        const res = await fetch('/api/config/channels');
        const data = await res.json();
        if (!data.success || !data.configurations) return;
        const configs = data.configurations;
        const getVal = (key) => {
            const r = configs.find(c => c.channel_type === 'push' && c.config_key === key && !c.is_mock);
            return r && r.config_value !== '***ENCRYPTED***' ? r.config_value : '';
        };
        document.getElementById('firebase-project-id').value = getVal('firebase_project_id');
        document.getElementById('firebase-client-email').value = getVal('firebase_client_email');
        document.getElementById('firebase-private-key').value = getVal('firebase_private_key') ? '********' : '';
    } catch (error) {
        console.error('Failed to load push settings:', error);
    }
}

document.getElementById('email-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = document.getElementById('smtp-password').value;
    const configs = [
        { channel_type: 'email', config_key: 'smtp_host', config_value: document.getElementById('smtp-host').value, is_mock: false },
        { channel_type: 'email', config_key: 'smtp_port', config_value: document.getElementById('smtp-port').value, is_mock: false },
        { channel_type: 'email', config_key: 'smtp_user', config_value: document.getElementById('smtp-user').value, is_mock: false },
        { channel_type: 'email', config_key: 'smtp_secure', config_value: document.getElementById('smtp-secure').value, is_mock: false },
        { channel_type: 'email', config_key: 'display_timezone', config_value: (document.getElementById('email-display-timezone')?.value || ''), is_mock: false }
    ];
    if (pw && pw !== '********') configs.push({ channel_type: 'email', config_key: 'smtp_password', config_value: pw, is_mock: false });
    
    try {
        for (const config of configs) {
            await fetch('/api/config/channels', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
        }
        showAlert('email-alert-container', 'Email settings saved successfully', 'success');
    } catch (error) {
        showAlert('email-alert-container', 'Failed to save email settings: ' + error.message, 'danger');
    }
});

document.getElementById('mock-email-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const configs = [
        { channel_type: 'email', config_key: 'smtp_host', config_value: document.getElementById('mock-smtp-host').value, is_mock: true },
        { channel_type: 'email', config_key: 'smtp_port', config_value: document.getElementById('mock-smtp-port').value, is_mock: true }
    ];
    
    try {
        for (const config of configs) {
            await fetch('/api/config/channels', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
        }
        showAlert('email-alert-container', 'Mock email settings saved successfully', 'success');
    } catch (error) {
        showAlert('email-alert-container', 'Failed to save mock email settings: ' + error.message, 'danger');
    }
});

// Push Notification Settings
document.getElementById('push-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const configs = [
        { channel_type: 'push', config_key: 'firebase_project_id', config_value: document.getElementById('firebase-project-id').value, is_mock: false },
        { channel_type: 'push', config_key: 'firebase_client_email', config_value: document.getElementById('firebase-client-email').value, is_mock: false },
        { channel_type: 'push', config_key: 'firebase_private_key', config_value: document.getElementById('firebase-private-key').value, is_mock: false }
    ];
    
    try {
        for (const config of configs) {
            await fetch('/api/config/channels', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
        }
        showAlert('push-alert-container', 'Push notification settings saved successfully', 'success');
    } catch (error) {
        showAlert('push-alert-container', 'Failed to save push settings: ' + error.message, 'danger');
    }
});

// =============================================================================
// Alarm Contacts Management
// =============================================================================

let contactsPage = 0;
const contactsPerPage = 20;
let allContacts = [];

async function loadContacts() {
    try {
        const res = await fetch('/api/config/contacts');
        const data = await res.json();
        
        if (data.success) {
            allContacts = data.contacts || [];
            filterContacts();
        }
    } catch (error) {
        console.error('Failed to load contacts:', error);
        showAlert('contacts-alert-container', 'Failed to load contacts: ' + error.message, 'danger');
    }
}

function filterContacts() {
    const imeiFilter = document.getElementById('contact-search-imei')?.value?.toLowerCase() || '';
    const typeFilter = document.getElementById('contact-filter-type')?.value || '';
    const activeFilter = document.getElementById('contact-filter-active')?.value || '';
    
    let filtered = allContacts.filter(contact => {
        const matchesImei = !imeiFilter || String(contact.imei).toLowerCase().includes(imeiFilter);
        const matchesType = !typeFilter || contact.contact_type === typeFilter;
        const matchesActive = !activeFilter || String(contact.active) === activeFilter;
        return matchesImei && matchesType && matchesActive;
    });
    
    renderContacts(filtered);
}

function renderContacts(contacts) {
    const tbody = document.getElementById('contacts-table');
    if (!tbody) return;
    
    const start = contactsPage * contactsPerPage;
    const end = start + contactsPerPage;
    const pageContacts = contacts.slice(start, end);
    
    if (pageContacts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center">No contacts found. Click "Add Contact" to get started.</td></tr>';
    } else {
        tbody.innerHTML = pageContacts.map(contact => {
            const tz = getWorkingTimezone();
            const quietHours = contact.quiet_hours_start && contact.quiet_hours_end 
                ? `${timeUTCToLocal(contact.quiet_hours_start, tz)} - ${timeUTCToLocal(contact.quiet_hours_end, tz)}`
                : '-';
            
            return `
                <tr style="${!contact.active ? 'opacity: 0.6;' : ''}">
                    <td><strong class="font-mono">${contact.imei}</strong></td>
                    <td>${contact.contact_name}</td>
                    <td>${contact.email || '-'}</td>
                    <td>${contact.phone || '-'}</td>
                    <td><span class="badge badge-${contact.contact_type === 'emergency' ? 'danger' : contact.contact_type === 'primary' ? 'success' : 'secondary'}">${contact.contact_type}</span></td>
                    <td>${contact.priority}</td>
                    <td><span class="badge badge-${contact.active ? 'success' : 'warning'}">${contact.active ? 'Active' : 'Inactive'}</span></td>
                    <td>${quietHours}</td>
                    <td>
                        <div style="display: flex; gap: 4px;">
                            <button class="btn btn-sm btn-secondary" onclick="editContact(${contact.id})" title="Edit">✎</button>
                            <button class="btn btn-sm btn-danger" onclick="deleteContact(${contact.id})" title="Delete">×</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }
    
    // Pagination
    const totalPages = Math.ceil(contacts.length / contactsPerPage);
    const pagination = document.getElementById('contacts-pagination');
    if (pagination) {
        if (totalPages > 1) {
            pagination.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px;">
                    <span class="text-muted">Page ${contactsPage + 1} of ${totalPages} (${contacts.length} total)</span>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-sm btn-secondary" onclick="contactsPage = Math.max(0, contactsPage - 1); filterContacts();" ${contactsPage === 0 ? 'disabled' : ''}>Previous</button>
                        <button class="btn btn-sm btn-secondary" onclick="contactsPage = Math.min(${totalPages - 1}, contactsPage + 1); filterContacts();" ${contactsPage >= totalPages - 1 ? 'disabled' : ''}>Next</button>
                    </div>
                </div>
            `;
        } else {
            pagination.innerHTML = contacts.length > 0 ? `<div class="text-muted" style="margin-top: 8px;">${contacts.length} contact(s)</div>` : '';
        }
    }
}

function showAddContactModal() {
    document.getElementById('contact-modal-title').textContent = 'Add Contact';
    document.getElementById('contact-id').value = '';
    document.getElementById('contact-imei').value = '';
    document.getElementById('contact-name').value = '';
    document.getElementById('contact-email').value = '';
    document.getElementById('contact-phone').value = '';
    document.getElementById('contact-type').value = 'primary';
    document.getElementById('contact-priority').value = '1';
    document.getElementById('contact-quiet-start').value = '';
    document.getElementById('contact-quiet-end').value = '';
    document.getElementById('contact-notes').value = '';
    document.getElementById('contact-active').value = 'true';
    document.getElementById('contact-modal').classList.add('active');
}

function editContact(id) {
    const contact = allContacts.find(c => c.id === id);
    if (!contact) return;
    
    document.getElementById('contact-modal-title').textContent = 'Edit Contact';
    document.getElementById('contact-id').value = contact.id;
    document.getElementById('contact-imei').value = contact.imei;
    document.getElementById('contact-name').value = contact.contact_name;
    document.getElementById('contact-email').value = contact.email || '';
    document.getElementById('contact-phone').value = contact.phone || '';
    document.getElementById('contact-type').value = contact.contact_type;
    document.getElementById('contact-priority').value = contact.priority;
    const tz = getWorkingTimezone();
    document.getElementById('contact-quiet-start').value = contact.quiet_hours_start ? timeUTCToLocal(contact.quiet_hours_start, tz) : '';
    document.getElementById('contact-quiet-end').value = contact.quiet_hours_end ? timeUTCToLocal(contact.quiet_hours_end, tz) : '';
    document.getElementById('contact-notes').value = contact.notes || '';
    document.getElementById('contact-active').value = String(contact.active);
    document.getElementById('contact-modal').classList.add('active');
}

async function deleteContact(id) {
    if (!confirm('Delete this contact?')) return;
    
    try {
        const res = await fetch(`/api/config/contacts/${id}`, { method: 'DELETE' });
        const data = await res.json();
        showAlert('contacts-alert-container', data.message || 'Contact deleted', data.success ? 'success' : 'danger');
        if (data.success) loadContacts();
    } catch (error) {
        showAlert('contacts-alert-container', 'Failed to delete contact: ' + error.message, 'danger');
    }
}

function closeContactModal() {
    document.getElementById('contact-modal').classList.remove('active');
}

document.getElementById('contact-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('contact-id').value;
    const isEdit = !!id;
    
    const email = document.getElementById('contact-email').value.trim();
    const phone = document.getElementById('contact-phone').value.trim();
    
    if (!email && !phone) {
        showAlert('contacts-alert-container', 'At least email or phone is required', 'danger');
        return;
    }
    
    const data = {
        imei: parseInt(document.getElementById('contact-imei').value),
        contact_name: document.getElementById('contact-name').value,
        email: email || null,
        phone: phone || null,
        contact_type: document.getElementById('contact-type').value,
        priority: parseInt(document.getElementById('contact-priority').value),
        timezone: 'UTC',
        quiet_hours_start: document.getElementById('contact-quiet-start').value ? timeLocalToUTC(document.getElementById('contact-quiet-start').value + ':00', getWorkingTimezone()) : null,
        quiet_hours_end: document.getElementById('contact-quiet-end').value ? timeLocalToUTC(document.getElementById('contact-quiet-end').value + ':00', getWorkingTimezone()) : null,
        notes: document.getElementById('contact-notes').value || null,
        active: document.getElementById('contact-active').value === 'true'
    };
    
    try {
        const res = await fetch(
            isEdit ? `/api/config/contacts/${id}` : '/api/config/contacts',
            {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            }
        );
        const result = await res.json();
        showAlert('contacts-alert-container', 
            result.success ? (isEdit ? 'Contact updated' : 'Contact created') : result.error, 
            result.success ? 'success' : 'danger'
        );
        if (result.success) {
            closeContactModal();
            loadContacts();
        }
    } catch (error) {
        showAlert('contacts-alert-container', 'Failed to save contact: ' + error.message, 'danger');
    }
});

// Load contacts when contacts tab is clicked
document.querySelectorAll('.tab[data-tab="contacts"]').forEach(tab => {
    tab.addEventListener('click', () => {
        loadContacts();
    });
});

// ============================================================================
// Alert Recipients Management
// ============================================================================

async function loadAlertRecipients() {
    try {
        const res = await fetch('/api/config/alertmanager/recipients');
        const data = await res.json();
        
        const tbody = document.getElementById('recipients-table');
        if (!data.success || !data.recipients || data.recipients.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No recipients configured</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.recipients.map(r => `
            <tr>
                <td>${escapeHtml(r.email)}</td>
                <td>${escapeHtml(r.name || '-')}</td>
                <td><span class="badge ${r.severity_filter === 'critical' ? 'badge-danger' : r.severity_filter === 'warning' ? 'badge-warning' : 'badge-secondary'}">${r.severity_filter || 'all'}</span></td>
                <td>${r.enabled ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-secondary">Inactive</span>'}</td>
                <td>${formatDateOnly(r.created_at)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-secondary" onclick="editRecipient(${r.id})">Edit</button>
                        <button class="btn btn-danger" onclick="deleteRecipient(${r.id}, '${escapeHtml(r.email)}')">Delete</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        showAlert('recipients-alert-container', 'Failed to load recipients: ' + error.message, 'danger');
    }
}

function showAddRecipientModal() {
    document.getElementById('recipient-modal-title').textContent = 'Add Alert Recipient';
    document.getElementById('recipient-form').reset();
    document.getElementById('recipient-id').value = '';
    document.getElementById('recipient-modal').classList.add('active');
}

async function editRecipient(id) {
    try {
        const res = await fetch('/api/config/alertmanager/recipients');
        const data = await res.json();
        
        const recipient = data.recipients?.find(r => r.id === id);
        if (!recipient) {
            showAlert('recipients-alert-container', 'Recipient not found', 'danger');
            return;
        }
        
        document.getElementById('recipient-modal-title').textContent = 'Edit Alert Recipient';
        document.getElementById('recipient-id').value = recipient.id;
        document.getElementById('recipient-email').value = recipient.email || '';
        document.getElementById('recipient-name').value = recipient.name || '';
        document.getElementById('recipient-severity').value = recipient.severity_filter || 'all';
        document.getElementById('recipient-enabled').value = recipient.enabled ? 'true' : 'false';
        
        document.getElementById('recipient-modal').classList.add('active');
    } catch (error) {
        showAlert('recipients-alert-container', 'Failed to load recipient: ' + error.message, 'danger');
    }
}

function closeRecipientModal() {
    document.getElementById('recipient-modal').classList.remove('active');
}

async function deleteRecipient(id, email) {
    if (!confirm(`Are you sure you want to delete recipient "${email}"?`)) return;
    
    try {
        const res = await fetch(`/api/config/alertmanager/recipients/${id}`, { method: 'DELETE' });
        const data = await res.json();
        
        showAlert('recipients-alert-container', 
            data.success ? 'Recipient deleted successfully' : data.error, 
            data.success ? 'success' : 'danger'
        );
        
        if (data.success) {
            loadAlertRecipients();
        }
    } catch (error) {
        showAlert('recipients-alert-container', 'Failed to delete recipient: ' + error.message, 'danger');
    }
}

// Handle recipient form submission
document.getElementById('recipient-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const id = document.getElementById('recipient-id').value;
    const isEdit = !!id;
    
    const data = {
        email: document.getElementById('recipient-email').value,
        name: document.getElementById('recipient-name').value || null,
        severity_filter: document.getElementById('recipient-severity').value,
        enabled: document.getElementById('recipient-enabled').value === 'true'
    };
    
    try {
        const res = await fetch(
            isEdit ? `/api/config/alertmanager/recipients/${id}` : '/api/config/alertmanager/recipients',
            {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            }
        );
        const result = await res.json();
        showAlert('recipients-alert-container', 
            result.success ? (isEdit ? 'Recipient updated' : 'Recipient created') : result.error, 
            result.success ? 'success' : 'danger'
        );
        if (result.success) {
            closeRecipientModal();
            loadAlertRecipients();
        }
    } catch (error) {
        showAlert('recipients-alert-container', 'Failed to save recipient: ' + error.message, 'danger');
    }
});

// Load alert recipients when tab is clicked
document.querySelectorAll('.tab[data-tab="alert-recipients"]').forEach(tab => {
    tab.addEventListener('click', () => {
        loadAlertRecipients();
    });
});
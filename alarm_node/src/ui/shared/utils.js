// Shared JavaScript utilities

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showAlert(containerId, message, type = 'success') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
    setTimeout(() => {
        if (container) container.innerHTML = '';
    }, 5000);
}

function formatDate(dateString) {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
}

function formatNumber(num) {
    return num ? num.toLocaleString() : '0';
}

function formatCurrency(amount, currency = 'PKR') {
    return `${formatNumber(amount)} ${currency}`;
}

function getHealthBadgeClass(status) {
    switch (status) {
        case 'healthy': return 'success';
        case 'degraded': return 'warning';
        case 'unhealthy': return 'danger';
        default: return 'secondary';
    }
}

function calculateDaysLeft(endDate) {
    if (!endDate) return null;
    const end = new Date(endDate);
    const now = new Date();
    return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
}

function getDaysLeftColor(daysLeft) {
    if (daysLeft === null) return 'var(--text-muted)';
    if (daysLeft < 30) return 'var(--accent-danger)';
    if (daysLeft < 60) return 'var(--accent-warning)';
    return 'var(--text-muted)';
}

function getUsageColor(percentage) {
    if (percentage > 90) return 'var(--accent-danger)';
    if (percentage > 75) return 'var(--accent-warning)';
    return 'var(--accent-success)';
}

async function apiCall(url, options = {}) {
    try {
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        const data = await response.json();
        return { success: response.ok, data, error: response.ok ? null : data.error || 'Request failed' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Tab switching utility
function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const content = document.getElementById(tabName + '-tab');
            if (content) content.classList.add('active');
        });
    });
}

// Dashboard JavaScript
// UPDATE_INTERVAL will be replaced by the generator
const UPDATE_INTERVAL = __UPDATE_INTERVAL__;
let processingChart, successChart;
let autoRefreshInterval;

// Chart data storage
let chartData = {
    processing: { labels: [], data: [] },
    success: { labels: [], data: [], errorData: [] }
};
let previousProcessedTotal = 0; // Track total processed count from previous refresh

// Initialize charts
function initCharts() {
    const processingCtx = document.getElementById('processing-chart').getContext('2d');
    processingChart = new Chart(processingCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Alarms/min',
                data: [],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            resizeDelay: 100,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
    
    const successCtx = document.getElementById('success-chart').getContext('2d');
    successChart = new Chart(successCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Success',
                    data: [],
                    borderColor: '#22c55e',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    tension: 0.4
                },
                {
                    label: 'Error',
                    data: [],
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            resizeDelay: 100,
            scales: {
                y: { beginAtZero: true, max: 100 }
            }
        }
    });
}

async function fetchHealth() {
    try {
        const res = await fetch('/health');
        const data = await res.json();
        const statusDot = document.getElementById('status-dot');
        const statusText = document.getElementById('status-text');
        
        if (data.status === 'ok') {
            statusDot.className = 'status-dot healthy';
            statusText.textContent = 'Healthy';
        } else {
            statusDot.className = 'status-dot danger';
            statusText.textContent = 'Unhealthy';
        }
    } catch (error) {
        document.getElementById('status-dot').className = 'status-dot danger';
        document.getElementById('status-text').textContent = 'Offline';
    }
}

async function fetchMetrics() {
    try {
        const res = await fetch('/metrics');
        if (!res.ok) {
            return;
        }
        const text = await res.text();
        const lines = text.split('\n');
        
        // Parse Prometheus metrics
        let processed = 0;
        let emailSent = 0, smsSent = 0, voiceSent = 0;
        let emailError = 0, smsError = 0, voiceError = 0;
        
        lines.forEach(line => {
            // Skip comments and empty lines
            if (!line || line.startsWith('#')) return;
            
            // Check for alarms_processed_total (actual metric name)
            if (line.startsWith('alarms_processed_total ')) {
                const match = line.match(/alarms_processed_total\s+(\d+(?:\.\d+)?)/);
                if (match) {
                    processed = parseInt(match[1]) || 0;
                }
            }
            // Check for success metrics (email_sent_total + sms_sent_total + voice_sent_total)
            if (line.startsWith('email_sent_total ')) {
                const match = line.match(/email_sent_total\s+(\d+(?:\.\d+)?)/);
                if (match) {
                    emailSent = parseInt(match[1]) || 0;
                }
            }
            if (line.startsWith('sms_sent_total ')) {
                const match = line.match(/sms_sent_total\s+(\d+(?:\.\d+)?)/);
                if (match) {
                    smsSent = parseInt(match[1]) || 0;
                }
            }
            if (line.startsWith('voice_sent_total ')) {
                const match = line.match(/voice_sent_total\s+(\d+(?:\.\d+)?)/);
                if (match) {
                    voiceSent = parseInt(match[1]) || 0;
                }
            }
            // Check for error metrics (permanent failures only for accuracy)
            if (line.startsWith('email_send_failed_permanent ')) {
                const match = line.match(/email_send_failed_permanent\s+(\d+(?:\.\d+)?)/);
                if (match) emailError = parseInt(match[1]) || 0;
            }
            if (line.startsWith('sms_send_failed_permanent ')) {
                const match = line.match(/sms_send_failed_permanent\s+(\d+(?:\.\d+)?)/);
                if (match) smsError = parseInt(match[1]) || 0;
            }
            if (line.startsWith('voice_send_failed_permanent ')) {
                const match = line.match(/voice_send_failed_permanent\s+(\d+(?:\.\d+)?)/);
                if (match) voiceError = parseInt(match[1]) || 0;
            }
        });
        
        const success = emailSent + smsSent + voiceSent;
        const failed = emailError + smsError + voiceError;
        
        // Use processed count if available, otherwise calculate from success + failed
        if (processed === 0 && (success > 0 || failed > 0)) {
            processed = success + failed;
        }
        
        // Calculate success rate based on notifications (not alarms)
        // One alarm can have multiple notifications (email + SMS), so we calculate:
        // Success rate = successful notifications / (successful + failed notifications)
        const totalNotifications = success + failed;
        // If we have notifications, calculate rate. Otherwise, if we processed alarms but no notifications yet, show 0%
        // If no alarms processed at all, show 100% (nothing to report)
        let successRate = 0;
        if (totalNotifications > 0) {
            successRate = Math.round((success / totalNotifications) * 100);
        } else if (processed > 0) {
            // We processed alarms but have no notification attempts yet (shouldn't happen, but handle it)
            successRate = 0;
        } else {
            // No alarms processed, show 100% (nothing to report)
            successRate = 100;
        }
        const errorRate = totalNotifications > 0 ? Math.round((failed / totalNotifications) * 100) : 0;
        
        // Update chart data (keep last 20 data points)
        const now = new Date();
        const timeLabel = String(now.getHours()).padStart(2, '0') + ':' + 
                         String(now.getMinutes()).padStart(2, '0') + ':' + 
                         String(now.getSeconds()).padStart(2, '0');
        
        // Processing rate chart (difference from previous total)
        const processingRate = Math.max(0, processed - previousProcessedTotal);
        chartData.processing.labels.push(timeLabel);
        chartData.processing.data.push(processingRate);
        if (chartData.processing.labels.length > 20) {
            chartData.processing.labels.shift();
            chartData.processing.data.shift();
        }
        previousProcessedTotal = processed; // Update for next refresh
        
        // Success/Error rate chart
        chartData.success.labels.push(timeLabel);
        chartData.success.data.push(successRate);
        chartData.success.errorData.push(errorRate);
        if (chartData.success.labels.length > 20) {
            chartData.success.labels.shift();
            chartData.success.data.shift();
            chartData.success.errorData.shift();
        }
        
        // Update charts - use 'active' mode to show animation
        if (processingChart && chartData.processing.data.length > 0) {
            processingChart.data.labels = [...chartData.processing.labels];
            processingChart.data.datasets[0].data = [...chartData.processing.data];
            processingChart.update('active');
        }
        
        if (successChart && chartData.success.data.length > 0) {
            successChart.data.labels = [...chartData.success.labels];
            successChart.data.datasets[0].data = [...chartData.success.data];
            successChart.data.datasets[1].data = [...chartData.success.errorData];
            successChart.update('active');
        }
        
        const processedEl = document.getElementById('stat-processed');
        const rateEl = document.getElementById('stat-success-rate');
        const sidebarProcessedEl = document.getElementById('sidebar-processed');
        const sidebarSuccessEl = document.getElementById('sidebar-success');
        
        if (processedEl) processedEl.textContent = processed;
        if (rateEl) rateEl.textContent = successRate + '%';
        if (sidebarProcessedEl) sidebarProcessedEl.textContent = processed;
        if (sidebarSuccessEl) sidebarSuccessEl.textContent = successRate + '%';
    } catch (error) {
        console.error('Error fetching metrics:', error);
    }
}

// Store metrics for circuit breaker display
let channelMetrics = {
    email: { sent: 0, error: 0 },
    sms: { sent: 0, error: 0 },
    voice: { sent: 0, error: 0 }
};

async function fetchCircuitBreakers() {
    try {
        // Fetch both circuit breaker status and metrics
        const [cbRes, metricsRes] = await Promise.all([
            fetch('/circuit-breakers/status'),
            fetch('/metrics')
        ]);
        
        if (!cbRes.ok) {
            return;
        }
        
        const cbData = await cbRes.json();
        const container = document.getElementById('circuit-breakers');
        if (!container) {
            return;
        }
        
        // Parse metrics to get actual sent/error counts
        if (metricsRes.ok) {
            const metricsText = await metricsRes.text();
            const metricsLines = metricsText.split('\n');
            
            metricsLines.forEach(line => {
                if (!line || line.startsWith('#')) return;
                
                if (line.startsWith('email_sent_total ')) {
                    const match = line.match(/email_sent_total\s+(\d+(?:\.\d+)?)/);
                    if (match) channelMetrics.email.sent = parseInt(match[1]) || 0;
                }
                if (line.startsWith('sms_sent_total ')) {
                    const match = line.match(/sms_sent_total\s+(\d+(?:\.\d+)?)/);
                    if (match) channelMetrics.sms.sent = parseInt(match[1]) || 0;
                }
                if (line.startsWith('voice_sent_total ')) {
                    const match = line.match(/voice_sent_total\s+(\d+(?:\.\d+)?)/);
                    if (match) channelMetrics.voice.sent = parseInt(match[1]) || 0;
                }
                if (line.startsWith('email_send_failed_permanent ')) {
                    const match = line.match(/email_send_failed_permanent\s+(\d+(?:\.\d+)?)/);
                    if (match) channelMetrics.email.error = parseInt(match[1]) || 0;
                }
                if (line.startsWith('sms_send_failed_permanent ')) {
                    const match = line.match(/sms_send_failed_permanent\s+(\d+(?:\.\d+)?)/);
                    if (match) channelMetrics.sms.error = parseInt(match[1]) || 0;
                }
                if (line.startsWith('voice_send_failed_permanent ')) {
                    const match = line.match(/voice_send_failed_permanent\s+(\d+(?:\.\d+)?)/);
                    if (match) channelMetrics.voice.error = parseInt(match[1]) || 0;
                }
            });
        }
        
        // Convert object to array
        const circuitBreakers = Object.entries(cbData).map(([key, cb]) => ({
            ...cb,
            name: cb.name || key
        }));
        
        container.innerHTML = circuitBreakers.map((cb) => {
            const statusClass = cb.state.toLowerCase().replace('_', '-');
            const metrics = channelMetrics[cb.name] || { sent: 0, error: 0 };
            return `
                <div class="cb-card ${statusClass}">
                    <div class="cb-header">
                        <div class="cb-name">${cb.name}</div>
                        <div class="cb-status ${statusClass}">${cb.state}</div>
                    </div>
                    <div class="cb-details">
                        <div>Failures: ${metrics.error}</div>
                        <div>Successes: ${metrics.sent}</div>
                        ${cb.lastFailureTime ? `<div>Last Failure: ${new Date(cb.lastFailureTime).toLocaleString()}</div>` : ''}
                    </div>
                    <button class="primary" onclick="resetCircuitBreaker('${cb.name}')">Reset</button>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error fetching circuit breakers:', error);
        const container = document.getElementById('circuit-breakers');
        if (container) {
            container.innerHTML = '<div class="error">Error loading circuit breakers</div>';
        }
    }
}

async function fetchDLQStats() {
    try {
        const res = await fetch('/dlq/stats');
        if (!res.ok) {
            return;
        }
        const data = await res.json();
        
        const totalEl = document.getElementById('dlq-total');
        const emailEl = document.getElementById('dlq-email');
        const smsEl = document.getElementById('dlq-sms');
        const voiceEl = document.getElementById('dlq-voice');
        
        if (totalEl) totalEl.textContent = data.total || 0;
        if (emailEl) emailEl.textContent = data.byChannel?.email || 0;
        if (smsEl) smsEl.textContent = data.byChannel?.sms || 0;
        if (voiceEl) voiceEl.textContent = data.byChannel?.voice || 0;
    } catch (error) {
        console.error('Error fetching DLQ stats:', error);
    }
}

async function fetchFeatureFlags() {
    try {
        const res = await fetch('/flags');
        const data = await res.json();
        const container = document.getElementById('flags-list');
        
        container.innerHTML = Object.entries(data).map(([name, enabled]) => `
            <div class="flag-item">
                <div class="flag-info">
                    <div class="flag-name">${name}</div>
                    <div class="flag-desc">Feature flag</div>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" ${enabled ? 'checked' : ''} onchange="toggleFlag('${name}', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error fetching feature flags:', error);
    }
}

async function resetCircuitBreaker(channel) {
    try {
        const res = await fetch(`/circuit-breakers/${channel}/reset`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            alert(`Circuit breaker for ${channel} reset successfully`);
            fetchCircuitBreakers();
        }
    } catch (error) {
        alert('Failed to reset circuit breaker');
    }
}

async function reprocessDLQ() {
    if (confirm('Reprocess DLQ items? This will retry failed alarms.')) {
        try {
            const res = await fetch('/dlq/reprocess-batch', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ limit: 50 })
            });
            const data = await res.json();
            alert(`Reprocessed ${data.processed || 0} items`);
            fetchDLQStats();
        } catch (error) {
            alert('Failed to reprocess DLQ');
        }
    }
}

async function toggleFlag(name, enabled) {
    try {
        const endpoint = enabled ? `/flags/${name}/enable` : `/flags/${name}/disable`;
        const res = await fetch(endpoint, { method: 'POST' });
        if (res.ok) {
            fetchFeatureFlags();
        }
    } catch (error) {
        alert('Failed to toggle feature flag');
    }
}

async function fetchQueueAndWorkers() {
    try {
        // Fetch queue depth from metrics
        const res = await fetch('/metrics');
        const text = await res.text();
        const lines = text.split('\n');
        
        let queueDepth = 0;
        let workers = 0;
        let pausedQueue = 0;
        
        lines.forEach(line => {
            // Skip comments and empty lines
            if (!line || line.startsWith('#')) return;
            
            // Check for RabbitMQ queue depth (primary source)
            if (line.startsWith('rabbitmq_queue_depth')) {
                const match = line.match(/rabbitmq_queue_depth\s+(\d+(?:\.\d+)?)/);
                if (match) queueDepth = parseInt(match[1]) || 0;
            }
            // Fallback to alarm_queue_size
            else if (line.startsWith('alarm_queue_size') && queueDepth === 0) {
                const match = line.match(/alarm_queue_size\s+(\d+(?:\.\d+)?)/);
                if (match) queueDepth = parseInt(match[1]) || 0;
            }
            // Check for pending alarms metrics (sum of pending SMS and email) - only if queueDepth still 0
            else if (queueDepth === 0 && line.startsWith('pending_sms_count')) {
                const match = line.match(/pending_sms_count\s+(\d+(?:\.\d+)?)/);
                if (match) {
                    queueDepth += parseInt(match[1]) || 0;
                }
            }
            else if (queueDepth === 0 && line.startsWith('pending_email_count')) {
                const match = line.match(/pending_email_count\s+(\d+(?:\.\d+)?)/);
                if (match) {
                    queueDepth += parseInt(match[1]) || 0;
                }
            }
            else if (queueDepth > 0 && (line.startsWith('pending_sms_count') || line.startsWith('pending_email_count'))) {
                // If we already have queueDepth, add pending counts to it
                if (line.startsWith('pending_sms_count')) {
                    const match = line.match(/pending_sms_count\s+(\d+(?:\.\d+)?)/);
                    if (match) {
                        queueDepth += parseInt(match[1]) || 0;
                    }
                } else if (line.startsWith('pending_email_count')) {
                    const match = line.match(/pending_email_count\s+(\d+(?:\.\d+)?)/);
                    if (match) {
                        queueDepth += parseInt(match[1]) || 0;
                    }
                }
            }
            // Check for active workers
            else if (line.startsWith('active_workers_count')) {
                const match = line.match(/active_workers_count\s+(\d+(?:\.\d+)?)/);
                if (match) workers = parseInt(match[1]) || 0;
            }
            // Check for paused requeue count
            else if (line.startsWith('rabbitmq_paused_requeue_count')) {
                const match = line.match(/rabbitmq_paused_requeue_count\s+(\d+(?:\.\d+)?)/);
                if (match) pausedQueue = parseInt(match[1]) || 0;
            }
        });
        
        // Try to get worker stats from API if not found in metrics
        if (workers === 0) {
            try {
                const workerRes = await fetch('/workers/stats');
                if (workerRes.ok) {
                    const workerData = await workerRes.json();
                    // Use active workers, fallback to healthy, then total, then 0 (not 1)
                    workers = workerData.active || workerData.healthy || workerData.total || 0;
                } else {
                    workers = 0; // Show 0 if endpoint fails, not 1
                }
            } catch (e) {
                workers = 0; // Show 0 if we can't fetch, not 1
            }
        }
        
        const queueEl = document.getElementById('stat-queue');
        const workersEl = document.getElementById('stat-workers');
        const pausedQueueEl = document.getElementById('stat-paused-queue');
        const pausedQueueCard = document.getElementById('paused-queue-card');
        const pausedQueueHint = document.getElementById('paused-queue-hint');
        const pausedQueueLabel = document.getElementById('paused-queue-label');
        const queueDepthCard = document.getElementById('queue-depth-card');
        const queueDepthHint = document.getElementById('queue-depth-hint');
        const queueDepthBadge = document.getElementById('queue-depth-badge');
        
        if (queueEl) queueEl.textContent = queueDepth;
        if (workersEl) workersEl.textContent = workers;
        if (pausedQueueEl) pausedQueueEl.textContent = pausedQueue;
        
        // Update queue depth card appearance when there are items
        if (queueDepthCard && queueDepthHint && queueDepthBadge) {
            if (queueDepth > 0) {
                queueDepthCard.style.border = '2px solid #3b82f6';
                queueDepthCard.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(37, 99, 235, 0.05) 100%)';
                queueDepthHint.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' + queueDepth + ' waiting in queue';
                queueDepthHint.style.color = '#60a5fa';
                queueDepthBadge.style.display = 'block';
            } else {
                queueDepthCard.style.border = '';
                queueDepthCard.style.background = '';
                queueDepthHint.innerHTML = 'No pending alarms';
                queueDepthHint.style.color = '#94a3b8';
                queueDepthBadge.style.display = 'none';
            }
        }
        
        // Show/hide the paused queue card based on whether there are paused messages
        if (pausedQueueCard) {
            pausedQueueCard.style.display = pausedQueue > 0 ? 'block' : 'none';
            // Update hint based on system state
            const statusBadge = document.getElementById('system-status-badge');
            const isPaused = statusBadge && statusBadge.textContent.includes('PAUSED');
            if (pausedQueueHint) {
                pausedQueueHint.innerHTML = isPaused 
                    ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>Click to view ' + pausedQueue + ' waiting items'
                    : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px;"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Processing ' + pausedQueue + ' items...';
                pausedQueueHint.style.color = '#fbbf24';
                pausedQueueHint.style.fontWeight = '500';
            }
            if (pausedQueueLabel) {
                pausedQueueLabel.innerHTML = isPaused 
                    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>Paused Queue' 
                    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px;"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>Processing Queue';
            }
            if (pausedQueueEl) {
                pausedQueueEl.style.color = isPaused ? '#f59e0b' : '#22c55e';
            }
        }
    } catch (error) {
        console.error('Error fetching queue and worker stats:', error);
    }
}

async function fetchSystemState() {
    try {
        const res = await fetch('/api/config/system/state');
        const data = await res.json();
        
        const badge = document.getElementById('system-status-badge');
        const btn = document.getElementById('pause-resume-btn');
        
        if (data.success && data.state) {
            const isPaused = data.state.state !== 'running';
            
            if (badge) {
                badge.innerHTML = isPaused 
                    ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>PAUSED' 
                    : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align: middle; margin-right: 4px;"><polyline points="20 6 9 17 4 12"/></svg>RUNNING';
                badge.style.background = isPaused ? '#f59e0b' : '#22c55e';
                badge.style.color = isPaused ? '#000' : '#fff';
            }
            
            if (btn) {
                btn.innerHTML = isPaused 
                    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>Resume System' 
                    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>Pause System';
                btn.style.background = isPaused ? '#22c55e' : '#f59e0b';
                btn.style.color = isPaused ? '#fff' : '#000';
            }
        }
    } catch (error) {
        console.error('Error fetching system state:', error);
    }
}

async function togglePauseResume() {
    try {
        // First get current state
        const stateRes = await fetch('/api/config/system/state');
        const stateData = await stateRes.json();
        
        if (!stateData.success) {
            alert('Failed to get system state');
            return;
        }
        
        const isPaused = stateData.state.state !== 'running';
        
        if (isPaused) {
            // Resume
            const res = await fetch('/api/config/system/resume', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                await fetchSystemState();
            } else {
                alert('Failed to resume: ' + data.message);
            }
        } else {
            // Pause
            const reason = prompt('Reason for pausing (optional):');
            if (reason === null) return; // Cancelled
            
            const res = await fetch('/api/config/system/pause', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: reason || 'Manual pause from dashboard', paused_by: 'admin' })
            });
            const data = await res.json();
            if (data.success) {
                await fetchSystemState();
            } else {
                alert('Failed to pause: ' + data.message);
            }
        }
    } catch (error) {
        console.error('Error toggling pause/resume:', error);
        alert('Error: ' + error.message);
    }
}

async function refresh() {
    await Promise.all([
        fetchHealth(),
        fetchMetrics(),
        fetchCircuitBreakers(),
        fetchDLQStats(),
        fetchFeatureFlags(),
        fetchQueueAndWorkers(),
        fetchSystemState()
    ]);
}

function setupAutoRefresh() {
    const checkbox = document.getElementById('autoRefresh');
    if (!checkbox) {
        return;
    }
    
    // Clear any existing interval first
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
    
    // Function to start refresh interval
    const startRefresh = () => {
        // Clear any existing interval
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
        }
        // Start new interval
        autoRefreshInterval = setInterval(() => {
            refresh().catch(err => {
                console.error('Auto-refresh failed:', err);
            });
        }, UPDATE_INTERVAL);
    };
    
    // Start refresh if checkbox is checked
    if (checkbox.checked) {
        startRefresh();
    }
    
    checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
            startRefresh();
        } else {
            if (autoRefreshInterval) {
                clearInterval(autoRefreshInterval);
                autoRefreshInterval = null;
            }
        }
    });
}

// Debounced resize handler for charts
let resizeTimeout;
function handleResize() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (processingChart) processingChart.resize();
        if (successChart) successChart.resize();
    }, 150);
}

// Handle window resize and orientation change
window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', function() {
    setTimeout(handleResize, 200);
});

// Initial load - wrap in DOMContentLoaded to ensure DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        initCharts();
        refresh().catch(err => {
            console.error('Initial refresh failed:', err);
        });
        setupAutoRefresh();
    });
} else {
    // DOM is already loaded
    initCharts();
    refresh().catch(err => {
        console.error('Initial refresh failed:', err);
    });
    setupAutoRefresh();
}

// Mobile sidebar toggle functions
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar && overlay) {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('open');
    }
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar && overlay) {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
    }
}

// =============================================================================
// Alarm History Functions
// =============================================================================

let historyPage = 0;
const historyPageSize = 20;

async function loadAlarmHistory() {
    const imeiFilter = document.getElementById('history-imei-filter')?.value || '';
    const statusFilter = document.getElementById('history-status-filter')?.value || '';
    const channelFilter = document.getElementById('history-channel-filter')?.value || '';
    
    const params = new URLSearchParams();
    if (imeiFilter) params.set('imei', imeiFilter);
    if (statusFilter) params.set('status', statusFilter);
    if (channelFilter) params.set('channel', channelFilter);
    params.set('limit', historyPageSize);
    params.set('offset', historyPage * historyPageSize);
    
    try {
        const res = await fetch(`/api/alarms/history?${params}`);
        const data = await res.json();
        
        if (data.success) {
            renderAlarmHistory(data.history, data.total);
        }
    } catch (error) {
        console.error('Failed to load alarm history:', error);
        document.getElementById('history-table-body').innerHTML = 
            '<tr><td colspan="8" style="padding: 24px; text-align: center; color: #ef4444;">Failed to load history</td></tr>';
    }
}

function renderAlarmHistory(history, total) {
    const tbody = document.getElementById('history-table-body');
    const info = document.getElementById('history-info');
    const prevBtn = document.getElementById('history-prev');
    const nextBtn = document.getElementById('history-next');
    
    if (!history || history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="padding: 24px; text-align: center; color: var(--text-muted);">No history records found</td></tr>';
        info.textContent = '0 records';
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        return;
    }
    
    tbody.innerHTML = history.map(h => {
        const time = new Date(h.created_at || h.processed_at).toLocaleString();
        const statusColor = {
            'sent': '#22c55e',
            'delivered': '#22c55e',
            'success': '#22c55e',
            'failed': '#ef4444',
            'error': '#ef4444',
            'pending': '#f59e0b',
            'retrying': '#f59e0b'
        }[h.status?.toLowerCase()] || '#64748b';
        
        const channelBadge = {
            'email': { bg: '#3b82f6', text: 'Email' },
            'sms': { bg: '#22c55e', text: 'SMS' },
            'voice': { bg: '#a855f7', text: 'Voice' },
            'push': { bg: '#f59e0b', text: 'Push' }
        }[h.channel?.toLowerCase()] || { bg: '#64748b', text: h.channel || '-' };
        
        return `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 10px 16px; color: var(--text-secondary); white-space: nowrap;">${time}</td>
                <td style="padding: 10px 16px; color: var(--text-primary); font-family: monospace; font-size: 0.8rem;">${h.imei || '-'}</td>
                <td style="padding: 10px 16px; color: var(--text-primary); max-width: 150px; overflow: hidden; text-overflow: ellipsis;">${h.alarm_type || h.event_type || '-'}</td>
                <td style="padding: 10px 16px;"><span style="background: ${channelBadge.bg}; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; color: white;">${channelBadge.text}</span></td>
                <td style="padding: 10px 16px; color: var(--text-secondary); max-width: 150px; overflow: hidden; text-overflow: ellipsis;">${h.recipient || h.contact || '-'}</td>
                <td style="padding: 10px 16px;"><span style="color: ${statusColor}; font-weight: 500;">${h.status || '-'}</span></td>
                <td style="padding: 10px 16px; color: var(--text-muted);">${h.attempt_count || h.retry_count || '1'}</td>
                <td style="padding: 10px 16px; color: #ef4444; max-width: 200px; overflow: hidden; text-overflow: ellipsis;" title="${h.error_message || ''}">${h.error_message ? h.error_message.substring(0, 50) + (h.error_message.length > 50 ? '...' : '') : '-'}</td>
            </tr>
        `;
    }).join('');
    
    // Update pagination
    const startRecord = historyPage * historyPageSize + 1;
    const endRecord = Math.min((historyPage + 1) * historyPageSize, total);
    info.textContent = `${startRecord}-${endRecord} of ${total} records`;
    
    prevBtn.disabled = historyPage === 0;
    nextBtn.disabled = endRecord >= total;
}

// Load history on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAlarmHistory);
} else {
    setTimeout(loadAlarmHistory, 500); // Slight delay to let main dashboard load first
}

// ==========================================
// DLQ Items View Functions
// ==========================================
let dlqItemsVisible = false;

async function toggleDLQItems() {
    const container = document.getElementById('dlq-items-container');
    const btn = document.getElementById('dlq-toggle-btn');
    
    if (!container) return;
    
    dlqItemsVisible = !dlqItemsVisible;
    container.style.display = dlqItemsVisible ? 'block' : 'none';
    
    if (btn) {
        btn.innerHTML = dlqItemsVisible 
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px;"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>Hide Items'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>View Items';
    }
    
    if (dlqItemsVisible) {
        await loadDLQItems();
    }
}

async function loadDLQItems() {
    const tbody = document.getElementById('dlq-items-body');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="7" style="padding: 20px; text-align: center; color: var(--text-muted);">Loading DLQ items...</td></tr>';
    
    try {
        const res = await fetch('/dlq/items?limit=50');
        const data = await res.json();
        
        if (!data.success || !data.items || data.items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="padding: 20px; text-align: center; color: var(--text-muted);">No DLQ items found</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.items.map(item => {
            const timeStr = item.created_at ? new Date(item.created_at).toLocaleString() : '-';
            const channelColor = item.channel === 'email' ? '#3b82f6' : item.channel === 'sms' ? '#22c55e' : '#8b5cf6';
            const errorTypeColor = item.error_type === 'RATE_LIMIT' ? '#f59e0b' : item.error_type === 'PROVIDER' ? '#ef4444' : '#94a3b8';
            
            return `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 8px 12px; color: var(--text-muted); font-size: 0.8rem;">${timeStr}</td>
                    <td style="padding: 8px 12px; color: var(--text-primary); font-family: monospace; font-size: 0.8rem;">${item.imei || '-'}</td>
                    <td style="padding: 8px 12px; color: var(--text-primary);">${item.alarm_type || 'Unknown'}</td>
                    <td style="padding: 8px 12px;"><span style="background: ${channelColor}; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; color: white;">${item.channel}</span></td>
                    <td style="padding: 8px 12px;"><span style="color: ${errorTypeColor}; font-weight: 500;">${item.error_type || 'UNKNOWN'}</span></td>
                    <td style="padding: 8px 12px; color: var(--text-muted);">${item.attempts}</td>
                    <td style="padding: 8px 12px;">
                        <button onclick="reprocessDLQItem(${item.id})" style="padding: 4px 8px; font-size: 0.75rem; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">Retry</button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading DLQ items:', error);
        tbody.innerHTML = '<tr><td colspan="7" style="padding: 20px; text-align: center; color: #ef4444;">Failed to load DLQ items</td></tr>';
    }
}

async function reprocessDLQItem(id) {
    try {
        const res = await fetch(`/dlq/reprocess/${id}`, { method: 'POST' });
        const data = await res.json();
        
        if (data.success) {
            alert('DLQ item reprocessed successfully');
            await loadDLQItems();
            await fetchDLQStats();
        } else {
            alert('Failed to reprocess: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        alert('Error reprocessing DLQ item: ' + error.message);
    }
}

// ==========================================
// Paused Queue Modal Functions
// ==========================================
async function showPausedQueueModal() {
    const modal = document.getElementById('paused-queue-modal');
    if (!modal) return;
    
    modal.style.display = 'flex';
    await loadPausedQueueItems();
}

function closePausedQueueModal() {
    const modal = document.getElementById('paused-queue-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function loadPausedQueueItems() {
    const tbody = document.getElementById('paused-queue-items-body');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="6" style="padding: 20px; text-align: center; color: var(--text-muted);">Loading paused queue items...</td></tr>';
    
    try {
        const res = await fetch('/queue/paused');
        const data = await res.json();
        
        if (!data.success || !data.items || data.items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="padding: 20px; text-align: center; color: var(--text-muted);">No paused items (queue is empty or system is running)</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.items.map(item => {
            const pausedAt = item.pausedAt ? new Date(item.pausedAt).toLocaleString() : '-';
            const gpsTime = item.gpsTime ? new Date(item.gpsTime).toLocaleString() : '-';
            const lat = item.latitude ? parseFloat(item.latitude).toFixed(5) : '-';
            const lng = item.longitude ? parseFloat(item.longitude).toFixed(5) : '-';
            const mapLink = item.latitude && item.longitude 
                ? `<a href="https://maps.google.com/?q=${item.latitude},${item.longitude}" target="_blank" style="color: #3b82f6; text-decoration: none;">${lat}, ${lng}</a>`
                : '-';
            
            return `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 8px 12px; color: var(--text-muted); font-size: 0.8rem;">${pausedAt}</td>
                    <td style="padding: 8px 12px; color: var(--text-primary); font-family: monospace; font-size: 0.8rem;">${item.imei || '-'}</td>
                    <td style="padding: 8px 12px; color: var(--text-primary);">${item.alarmType || 'Unknown'}</td>
                    <td style="padding: 8px 12px; color: var(--text-muted); font-size: 0.8rem;">${gpsTime}</td>
                    <td style="padding: 8px 12px;">${mapLink}</td>
                    <td style="padding: 8px 12px; color: var(--text-primary);">${item.speed || 0} km/h</td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading paused queue items:', error);
        tbody.innerHTML = '<tr><td colspan="6" style="padding: 20px; text-align: center; color: #ef4444;">Failed to load paused queue items</td></tr>';
    }
}

// Close modal when clicking outside
document.addEventListener('click', function(e) {
    const modal = document.getElementById('paused-queue-modal');
    if (modal && e.target === modal) {
        closePausedQueueModal();
    }
});

// ==========================================
// Queue Depth Info Functions
// ==========================================
function showQueueDepthInfo() {
    const queueEl = document.getElementById('stat-queue');
    const queueDepth = parseInt(queueEl?.textContent || '0');
    
    if (queueDepth === 0) {
        // Show a brief tooltip/message that queue is empty
        const card = document.getElementById('queue-depth-card');
        if (card) {
            const originalBg = card.style.background;
            card.style.background = 'linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(22, 163, 74, 0.1) 100%)';
            card.style.border = '2px solid #22c55e';
            setTimeout(() => {
                card.style.background = originalBg || '';
                card.style.border = '';
            }, 1000);
        }
        return;
    }
    
    // For now, show an alert with queue info. In the future, could open a modal
    alert(`Queue Depth: ${queueDepth} alarms waiting to be processed.\n\nThese are alarms in the RabbitMQ queue waiting for workers to process them. If the system is running normally, these will be processed automatically.`);
}
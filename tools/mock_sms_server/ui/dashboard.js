
        const UPDATE_INTERVAL = __UPDATE_INTERVAL__;
        let messagesChart, statusChart;
        let allMessages = [];
        let autoRefreshInterval;
        
        // Initialize charts
        function initCharts() {
            const messagesCtx = document.getElementById('messages-chart').getContext('2d');
            messagesChart = new Chart(messagesCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Messages',
                        data: [],
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
            
            const statusCtx = document.getElementById('status-chart').getContext('2d');
            statusChart = new Chart(statusCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Success', 'Failed', 'Rate Limited'],
                    datasets: [{
                        data: [0, 0, 0],
                        backgroundColor: [
                            '#22c55e',
                            '#ef4444',
                            '#f59e0b'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom' }
                    }
                }
            });
        }
        
        async function fetchStats() {
            try {
                const res = await fetch('/api/stats');
                const stats = await res.json();
                
                document.getElementById('stat-total').textContent = stats.total_received || 0;
                document.getElementById('stat-success').textContent = stats.total_success || 0;
                document.getElementById('stat-failed').textContent = stats.total_failed || 0;
                document.getElementById('stat-rate-limited').textContent = stats.total_rate_limited || 0;
                
                document.getElementById('sidebar-total').textContent = stats.total_received || 0;
                document.getElementById('sidebar-success').textContent = stats.total_success || 0;
                
                // Update status chart
                if (statusChart) {
                    statusChart.data.datasets[0].data = [
                        stats.total_success || 0,
                        stats.total_failed || 0,
                        stats.total_rate_limited || 0
                    ];
                    statusChart.update();
                }
            } catch (error) {
                console.error('Error fetching stats:', error);
            }
        }
        
        async function fetchMessages() {
            try {
                const res = await fetch('/api/messages?limit=100');
                const data = await res.json();
                allMessages = data.messages || [];
                renderMessages(allMessages);
                updateMessagesChart();
            } catch (error) {
                console.error('Error fetching messages:', error);
            }
        }
        
        function renderMessages(messages) {
            const container = document.getElementById('messages-list');
            
            if (messages.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <h2>No messages yet</h2>
                        <p>SMS messages will appear here when received.</p>
                    </div>
                `;
                return;
            }
            
            container.innerHTML = messages.map(msg => `
                <div class="message-card ${msg.status}" data-phone="${msg.to}">
                    <div class="message-header">
                        <span class="message-to">${escapeHtml(msg.to)}</span>
                        <span class="status-badge ${msg.status}">${msg.status}</span>
                    </div>
                    <div class="message-body">${escapeHtml(msg.message)}</div>
                    <div class="message-meta">
                        <span>From: ${escapeHtml(msg.from_sender)}</span>
                        <span>ID: ${msg.id.slice(0, 8)}...</span>
                        <span>${new Date(msg.received_at).toLocaleString()}</span>
                    </div>
                </div>
            `).join('');
        }
        
        function filterMessages() {
            const searchTerm = document.getElementById('searchBox').value.toLowerCase();
            const filtered = allMessages.filter(msg => 
                msg.to.toLowerCase().includes(searchTerm) ||
                msg.message.toLowerCase().includes(searchTerm) ||
                msg.from_sender.toLowerCase().includes(searchTerm)
            );
            renderMessages(filtered);
        }
        
        function updateMessagesChart() {
            if (!messagesChart || allMessages.length === 0) return;
            
            // Group by time (last 20 data points)
            const now = Date.now();
            const timeSlots = Array(20).fill(0).map((_, i) => {
                const time = new Date(now - (19 - i) * 60000); // Last 20 minutes
                return time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            });
            
            const counts = Array(20).fill(0);
            allMessages.slice(0, 100).forEach(msg => {
                const msgTime = new Date(msg.received_at).getTime();
                const minutesAgo = Math.floor((now - msgTime) / 60000);
                if (minutesAgo >= 0 && minutesAgo < 20) {
                    counts[19 - minutesAgo]++;
                }
            });
            
            messagesChart.data.labels = timeSlots;
            messagesChart.data.datasets[0].data = counts;
            messagesChart.update();
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        async function refresh() {
            await Promise.all([fetchStats(), fetchMessages()]);
        }
        
        async function clearMessages() {
            if (confirm('Are you sure you want to clear all messages?')) {
                try {
                    await fetch('/api/messages', { method: 'DELETE' });
                    await refresh();
                } catch (error) {
                    console.error('Error clearing messages:', error);
                    alert('Failed to clear messages');
                }
            }
        }
        
        function setupAutoRefresh() {
            const checkbox = document.getElementById('autoRefresh');
            
            if (checkbox.checked) {
                autoRefreshInterval = setInterval(refresh, UPDATE_INTERVAL);
            }
            
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    autoRefreshInterval = setInterval(refresh, UPDATE_INTERVAL);
                } else {
                    clearInterval(autoRefreshInterval);
                }
            });
        }
        
        // Mobile sidebar functions
        function toggleSidebar() {
            document.getElementById('sidebar').classList.toggle('open');
            document.getElementById('sidebar-overlay').classList.toggle('open');
        }
        
        function closeSidebar() {
            document.getElementById('sidebar').classList.remove('open');
            document.getElementById('sidebar-overlay').classList.remove('open');
        }
        
        // Handle window resize - close sidebar if resizing to desktop
        window.addEventListener('resize', function() {
            if (window.innerWidth > 768) {
                closeSidebar();
            }
        });
        
        // Also handle orientation change on mobile
        window.addEventListener('orientationchange', function() {
            setTimeout(() => {
                if (window.innerWidth > 768) {
                    closeSidebar();
                }
            }, 200);
        });
        
        // Ensure sidebar is closed on mobile on initial load
        function initMobileSidebar() {
            if (window.innerWidth <= 768) {
                closeSidebar();
            }
        }
        
        // Initial load
        initCharts();
        initMobileSidebar();
        refresh();
        setupAutoRefresh();
    
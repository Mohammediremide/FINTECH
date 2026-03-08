let cashFlowChartInstance = null;
const USER_DATA_TIMEOUT_MS = 1000;

document.addEventListener('DOMContentLoaded', () => {
    // Load common user data if elements exist (e.g., sidebar)
    if (document.getElementById('user-name') || document.getElementById('settings-name')) {
        loadUserData();
    }

    // Dashboard specific elements
    if (document.getElementById('balance-amount')) {
        loadTransactions();
        loadChartData('This Year');
        loadNotifications();
    }

    setupEventListeners();
});

async function loadNotifications() {
    try {
        const response = await fetch('/api/notifications');
        const notifications = await response.json();

        const badge = document.getElementById('notification-badge');
        const list = document.getElementById('notifications-list');
        if (!list) return;

        const unreadCount = notifications.filter(n => !n.is_read).length;
        if (unreadCount > 0) {
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }

        if (notifications.length === 0) {
            list.innerHTML = '<p style="color: var(--text-secondary); text-align: center; font-size: 0.85rem; padding: 20px 0;">No notifications</p>';
            return;
        }

        list.innerHTML = notifications.map(n => `
            <div style="padding: 12px; border-bottom: 1px solid var(--glass-border); ${n.is_read ? 'opacity: 0.7;' : ''}">
                <p style="font-weight: 600; font-size: 0.9rem; margin-bottom: 3px;">${n.title} ${!n.is_read ? '<span style="color: var(--negative);">&bull;</span>' : ''}</p>
                <p style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4;">${n.message}</p>
                <small style="color: var(--accent-1); font-size: 0.7rem; display: block; margin-top: 5px;">${n.time}</small>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN'
    }).format(amount);
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.style.padding = '14px 28px';
    toast.style.borderRadius = '12px';
    toast.style.background = 'rgba(11, 17, 26, 0.98)';
    toast.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    toast.style.color = type === 'error' ? 'var(--negative)' : (type === 'success' ? 'var(--positive)' : 'white');
    toast.style.boxShadow = '0 10px 40px rgba(0,0,0,0.5)';
    toast.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
    toast.style.transform = 'translateY(30px)';
    toast.style.opacity = '0';
    toast.style.fontWeight = '500';
    toast.style.fontSize = '0.95rem';
    toast.style.zIndex = '9999';
    toast.innerText = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.transform = 'translateY(0)';
        toast.style.opacity = '1';
    }, 50);

    setTimeout(() => {
        toast.style.transform = 'translateY(-20px)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 400);
    }, 5000);
}

function fetchJsonWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    return fetch(url, { signal: controller.signal }).finally(() => {
        clearTimeout(timeoutId);
    });
}

function setDashboardPendingState() {
    const setIfPresent = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.innerText = value;
    };

    setIfPresent('user-name', 'Loading...');
    setIfPresent('user-membership', 'Loading account...');
    setIfPresent('balance-amount', 'Loading...');
    setIfPresent('income-amount', 'Loading...');
    setIfPresent('expenses-amount', 'Loading...');
    setIfPresent('savings-amount', 'Loading...');
    setIfPresent('savings-percent-trend', 'Loading...');
}

function setDashboardErrorState() {
    const setIfPresent = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.innerText = value;
    };

    setIfPresent('user-name', 'Account unavailable');
    setIfPresent('user-membership', 'Could not load account data');
    setIfPresent('balance-amount', 'Unavailable');
    setIfPresent('income-amount', 'Unavailable');
    setIfPresent('expenses-amount', 'Unavailable');
    setIfPresent('savings-amount', 'Unavailable');
    setIfPresent('savings-percent-trend', 'N/A');

    const progressEl = document.getElementById('savings-progress');
    if (progressEl) progressEl.style.width = '0%';
}

async function loadUserData() {
    const onDashboard = Boolean(document.getElementById('balance-amount'));
    if (onDashboard) {
        setDashboardPendingState();
    }

    try {
        const response = await fetchJsonWithTimeout('/api/user_data', USER_DATA_TIMEOUT_MS);
        if (response.status === 401) {
            window.location.href = '/login';
            return;
        }
        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
        }

        const data = await response.json();

        const safeSetText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.innerText = text;
        };

        safeSetText('user-name', data.name || 'Account');
        safeSetText('user-membership', data['2fa_enabled'] ? 'Verified Account' : 'Standard Account');
        safeSetText('card-user-name', data.name || 'Cardholder');

        const nameInput = document.getElementById('settings-name');
        if (nameInput) nameInput.value = data.name || '';

        const emailInput = document.getElementById('settings-email');
        if (emailInput) emailInput.value = data.email || '';

        if (data.balance !== undefined) {
            safeSetText('balance-amount', formatCurrency(data.balance));
            safeSetText('income-amount', formatCurrency(data.income));
            safeSetText('expenses-amount', formatCurrency(data.expenses));
            safeSetText('savings-amount', formatCurrency(data.savings_goal));
        }

        const trendEl = document.getElementById('savings-percent-trend');
        if (trendEl) trendEl.innerText = `${data.savings_percent}%`;

        const progressEl = document.getElementById('savings-progress');
        if (progressEl) progressEl.style.width = `${data.savings_percent}%`;

        const tfaBtn = document.getElementById('tfa-status-btn');
        if (tfaBtn) {
            tfaBtn.innerText = data['2fa_enabled'] ? 'Active' : 'Enable';
            tfaBtn.className = data['2fa_enabled'] ? 'status-badge status-completed' : 'btn-secondary';
        }
    } catch (error) {
        console.error('Error fetching user data:', error);
        if (onDashboard) {
            setDashboardErrorState();
            showToast('Could not load dashboard data. Check connection and refresh.', 'error');
        }
    }
}
async function loadTransactions() {
    try {
        const response = await fetch('/api/transactions');
        if (response.status === 401) return;
        const transactions = await response.json();

        const tbody = document.getElementById('transactionsBody');
        tbody.innerHTML = '';

        transactions.forEach(tx => {
            const tr = document.createElement('tr');

            const amountClass = tx.amount > 0 ? 'var(--positive)' : 'var(--text-primary)';
            const formattedAmount = tx.amount > 0 ? `+ ${formatCurrency(Math.abs(tx.amount))} ` : ` - ${formatCurrency(Math.abs(tx.amount))} `;
            const statusClass = tx.status === 'Completed' ? 'status-completed' : 'status-pending';

            tr.innerHTML = `
                <td>
                    <div class="tx-icon">${tx.icon}</div>
                    <div class="tx-info">
                        <span class="tx-title">${tx.title}</span>
                    </div>
                </td>
                <td class="tx-category">${tx.category}</td>
                <td class="tx-category">${tx.date}</td>
                <td><span class="status-badge ${statusClass}">${tx.status}</span></td>
                <td style="color: ${amountClass}; font-weight: 600;">${formattedAmount}</td>
        `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error fetching transactions:', error);
    }
}

async function loadChartData(period) {
    try {
        const response = await fetch(`/api/chart_data?period=${encodeURIComponent(period)}`);
        if (response.status === 401) return;
        const data = await response.json();

        renderChart(data.labels, data.income, data.expenses);
    } catch (error) {
        console.error('Error fetching chart data:', error);
    }
}

function renderChart(labels, incomeData, expenseData) {
    const canvas = document.getElementById('cashFlowChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (cashFlowChartInstance) {
        cashFlowChartInstance.destroy();
    }

    // Gradient for Income
    const gradientIncome = ctx.createLinearGradient(0, 0, 0, 400);
    gradientIncome.addColorStop(0, 'rgba(56, 189, 248, 0.5)');
    gradientIncome.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

    // Gradient for Expenses
    const gradientExpense = ctx.createLinearGradient(0, 0, 0, 400);
    gradientExpense.addColorStop(0, 'rgba(139, 92, 246, 0.5)');
    gradientExpense.addColorStop(1, 'rgba(139, 92, 246, 0.0)');

    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Outfit', sans-serif";

    cashFlowChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Income',
                    data: incomeData,
                    borderColor: '#38bdf8',
                    backgroundColor: gradientIncome,
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: '#06090e',
                    pointBorderColor: '#38bdf8',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Expenses',
                    data: expenseData,
                    borderColor: '#8b5cf6',
                    backgroundColor: gradientExpense,
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: '#06090e',
                    pointBorderColor: '#8b5cf6',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    align: 'end',
                    labels: {
                        usePointStyle: true,
                        boxWidth: 8,
                        padding: 20
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(11, 17, 26, 0.9)',
                    titleColor: '#ffffff',
                    bodyColor: '#cbd5e1',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                    mode: 'index',
                    intersect: false,
                    bodyFont: {
                        family: "'Outfit', sans-serif"
                    },
                    titleFont: {
                        family: "'Outfit', sans-serif",
                        size: 14,
                        weight: '600'
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false,
                        drawBorder: false
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        callback: function (value) {
                            return 'NGN ' + value / 1000 + 'k';
                        }
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}

function setupEventListeners() {
    const chartPeriod = document.getElementById('chart-period');
    if (chartPeriod) {
        chartPeriod.addEventListener('change', (e) => {
            loadChartData(e.target.value);
        });
    }

    const addMoneyBtn = document.getElementById('add-money-btn');
    const addMoneyModal = document.getElementById('add-money-modal');
    const cancelModalBtn = document.getElementById('cancel-modal');
    const confirmDepositBtn = document.getElementById('confirm-deposit');
    const depositAmountInput = document.getElementById('deposit-amount');

    if (addMoneyBtn && addMoneyModal) {
        addMoneyBtn.addEventListener('click', () => {
            addMoneyModal.style.display = 'flex';
            if (depositAmountInput) depositAmountInput.focus();
        });
    }

    if (cancelModalBtn && addMoneyModal) {
        cancelModalBtn.addEventListener('click', () => {
            addMoneyModal.style.display = 'none';
            if (depositAmountInput) depositAmountInput.value = '';
        });
    }

    // Unify Confirm Deposit Button Logic
    if (confirmDepositBtn) {
        confirmDepositBtn.addEventListener('click', async () => {
            try {
                const amount = parseFloat(depositAmountInput.value);

                if (isNaN(amount) || amount <= 0) {
                    showToast('Please enter a valid amount.', 'error');
                    return;
                }

                // Check card fields
                const cardNumber = document.getElementById('card-number');
                const cardExpiry = document.getElementById('card-expiry');
                const cardCvv = document.getElementById('card-cvv');

                if (cardNumber) {
                    if (!cardNumber.value || !cardExpiry.value || !cardCvv.value) {
                        showToast('Please fill in all card details.', 'error');
                        return;
                    }
                    if (cardNumber.value.length < 16) {
                        showToast('Invalid Card Number', 'error');
                        return;
                    }
                }

                // Show loading state
                const originalText = confirmDepositBtn.innerText;
                confirmDepositBtn.innerText = 'Initializing Secure Payment...';
                confirmDepositBtn.disabled = true;

                // Simulate payment gateway delay
                setTimeout(async () => {
                    const response = await fetch('/api/add_money', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ amount, payment_method: 'card' })
                    });
                    const data = await response.json();

                    confirmDepositBtn.innerText = originalText;
                    confirmDepositBtn.disabled = false;

                    if (data.success) {
                        showToast(`Successfully deposited ${formatCurrency(amount)} via Card!`, 'success');
                        addMoneyModal.style.display = 'none';
                        depositAmountInput.value = '';
                        // Clear card fields if they exist
                        if (cardNumber) {
                            cardNumber.value = '';
                            cardExpiry.value = '';
                            cardCvv.value = '';
                        }
                        loadUserData();
                        loadTransactions();
                    }
                }, 2000);
            } catch (error) {
                console.error('Error adding money:', error);
                showToast('Failed to add money.', 'error');
                confirmDepositBtn.disabled = false;
            }
        });
    }

    // Payment Method Switching Logic
    const methodBtns = document.querySelectorAll('.method-btn');
    const cardSection = document.getElementById('card-deposit-section');
    const transferSection = document.getElementById('transfer-deposit-section');

    if (methodBtns.length > 0) {
        methodBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                methodBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                if (btn.dataset.method === 'card') {
                    if (cardSection) cardSection.style.display = 'block';
                    if (transferSection) transferSection.style.display = 'none';
                } else {
                    if (cardSection) cardSection.style.display = 'none';
                    if (transferSection) transferSection.style.display = 'block';
                }
            });
        });
    }

    const cancelTransferBtn = document.getElementById('cancel-modal-transfer');
    if (cancelTransferBtn && addMoneyModal) {
        cancelTransferBtn.addEventListener('click', () => {
            addMoneyModal.style.display = 'none';
        });
    }

    const confirmTransferBtn = document.getElementById('confirm-transfer');
    if (confirmTransferBtn) {
        confirmTransferBtn.addEventListener('click', () => {
            const senderNameInput = document.getElementById('sender-name');
            const senderName = senderNameInput ? senderNameInput.value : '';

            if (!senderName) {
                showToast('Please enter your account name for verification', 'error');
                return;
            }
            showToast('Payment notification received! We will verify it shortly.', 'success');
            addMoneyModal.style.display = 'none';
            if (senderNameInput) senderNameInput.value = '';
        });
    }

    // Notifications toggle logic
    const notificationBtn = document.getElementById('notification-btn');
    const notificationDropdown = document.getElementById('notifications-dropdown');
    const markReadBtn = document.getElementById('mark-read-btn');

    if (notificationBtn && notificationDropdown) {
        notificationBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            notificationDropdown.style.display = notificationDropdown.style.display === 'none' ? 'block' : 'none';
        });
    }

    if (markReadBtn) {
        markReadBtn.addEventListener('click', async () => {
            const response = await fetch('/api/mark_notifications_read', { method: 'POST' });
            if (response.ok) {
                loadNotifications();
                showToast('All notifications read');
            }
        });
    }

    document.addEventListener('click', () => {
        if (notificationDropdown) notificationDropdown.style.display = 'none';
    });

    if (notificationDropdown) {
        notificationDropdown.addEventListener('click', (e) => e.stopPropagation());
    }

    // Card Specific Buttons
    const freezeBtn = document.getElementById('freeze-card-btn');
    if (freezeBtn) {
        freezeBtn.addEventListener('click', () => {
            const isFrozen = freezeBtn.innerText.includes('Unfreeze');
            freezeBtn.innerText = isFrozen ? 'Freeze Card' : 'Unfreeze Card';
            showToast(isFrozen ? 'Card unfrozen successfully' : 'Card frozen successfully', isFrozen ? 'success' : 'info');
        });
    }

    const viewDetailsBtn = document.getElementById('view-card-details-btn');
    if (viewDetailsBtn) {
        viewDetailsBtn.addEventListener('click', () => {
            const cardNum = document.querySelector('.credit-card .card-number');
            const cardBottom = document.querySelector('.credit-card .card-bottom');
            const isHidden = cardNum.innerText.includes('*');

            if (isHidden) {
                cardNum.innerText = '4289 5562 1098 4289';
                // Add/Update CVV display
                let cvvDisplay = document.getElementById('card-cvv-show');
                if (!cvvDisplay) {
                    cvvDisplay = document.createElement('span');
                    cvvDisplay.id = 'card-cvv-show';
                    cvvDisplay.style.color = 'var(--accent-1)';
                    cvvDisplay.style.fontWeight = '700';
                    cvvDisplay.style.marginLeft = '10px';
                    cardBottom.appendChild(cvvDisplay);
                }
                cvvDisplay.innerText = 'CVV: 552';
                viewDetailsBtn.innerText = 'Hide Details';
                showToast('Card details revealed', 'success');
            } else {
                cardNum.innerText = '**** **** **** 4289';
                const cvvDisplay = document.getElementById('card-cvv-show');
                if (cvvDisplay) cvvDisplay.innerText = '';
                viewDetailsBtn.innerText = 'View Details';
                showToast('Card details hidden');
            }
        });
    }
}









// Global variables
let allDevices = [];
let filteredDevices = [];
let filterOptions = {};
let currentSort = { field: null, direction: 'asc' };
let currentView = 'table';
let currentPage = 1;
let hasMoreDevices = true;

// DOM elements
const elements = {
    loading: document.getElementById('loading'),
    searchInput: document.getElementById('search-input'),
    filterToggle: document.getElementById('filter-toggle'),
    filtersSidebar: document.getElementById('filters-sidebar'),
    closeFilters: document.getElementById('close-filters'),
    clearFilters: document.getElementById('clear-filters'),
    tableView: document.getElementById('table-view'),
    cardView: document.getElementById('card-view'),
    tableContainer: document.getElementById('table-container'),
    cardsContainer: document.getElementById('cards-container'),
    devicesTable: document.getElementById('devices-table'),
    devicesTbody: document.getElementById('devices-tbody'),
    devicesCards: document.getElementById('devices-cards'),
    noResults: document.getElementById('no-results'),
    refreshBtn: document.getElementById('refresh-btn'),
    exportBtn: document.getElementById('export-btn'),
    overlay: document.getElementById('overlay'),
    deviceModal: document.getElementById('device-modal'),
    closeModal: document.querySelector('.close-modal'),
    totalDevicesCard: document.getElementById('total-devices').parentElement.parentElement,
    allocatedCard: document.getElementById('allocated-devices').parentElement.parentElement,
    availableCard: document.getElementById('available-devices').parentElement.parentElement,
    repairingCard: document.getElementById('repairing-devices').parentElement.parentElement,
    faultyCard: document.getElementById('faulty-devices').parentElement.parentElement,
    repairedCard: document.getElementById('repaired-devices').parentElement.parentElement
};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    loadFilterOptions();
    loadDevices();
    loadDashboardStats();
});

// Event listeners
function initializeEventListeners() {
    elements.searchInput.addEventListener('input', debounce(handleSearch, 300));
    elements.filterToggle.addEventListener('click', toggleFilters);
    elements.closeFilters.addEventListener('click', closeFilters);
    elements.clearFilters.addEventListener('click', clearAllFilters);
    elements.overlay.addEventListener('click', closeFilters);
    elements.tableView.addEventListener('click', () => switchView('table'));
    elements.cardView.addEventListener('click', () => switchView('card'));
    elements.devicesTable.addEventListener('click', handleTableSort);
    elements.refreshBtn.addEventListener('click', refreshData);
    elements.exportBtn.addEventListener('click', exportData);
    elements.closeModal.addEventListener('click', closeModal);
    elements.deviceModal.addEventListener('click', (e) => {
        if (e.target === elements.deviceModal) closeModal();
    });
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-btn')) {
            switchTab(e.target.dataset.tab);
        }
    });
    document.addEventListener('click', (e) => {
        const row = e.target.closest('tr');
        if (row && row.dataset.deviceId) {
            showDeviceModal(row.dataset.deviceId);
        }
        const card = e.target.closest('.device-card');
        if (card && card.dataset.deviceId) {
            showDeviceModal(card.dataset.deviceId);
        }
    });
    const filterSelects = [
        'category-filter',
        'acceptance-status-filter',
        'allocation-status-filter',
        'state-city-filter',
        'flow-type-filter',
        'ticket-type-filter'
    ];
    filterSelects.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', applyFilters);
        }
    });
    elements.totalDevicesCard.addEventListener('click', () => filterByAllocationStatus(''));
    elements.allocatedCard.addEventListener('click', () => filterByAllocationStatus('ALLOCATED'));
    elements.availableCard.addEventListener('click', () => filterByAllocationStatus('GOOD')); // Changed to match 'GOOD'
    elements.repairingCard.addEventListener('click', () => filterByAllocationStatus('REPAIRING'));
    elements.faultyCard.addEventListener('click', () => filterByAllocationStatus('FAULTY'));
    elements.repairedCard.addEventListener('click', () => filterByAllocationStatus('REPAIRED'));
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
            closeFilters();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            elements.searchInput.focus();
        }
    });
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.id = 'load-more-btn';
    loadMoreBtn.className = 'btn btn-primary';
    loadMoreBtn.innerHTML = '<i class="fas fa-plus"></i> Load More';
    loadMoreBtn.addEventListener('click', loadMoreDevices);
    document.getElementById('load-more-container').appendChild(loadMoreBtn);
    loadMoreBtn.style.display = 'none';
}

function filterByAllocationStatus(status) {
    const allocationStatusFilter = document.getElementById('allocation-status-filter');
    if (allocationStatusFilter) {
        allocationStatusFilter.value = status;
        applyFilters();
    } else {
        console.error('allocation-status-filter element not found');
        showNotification('Unable to apply allocation status filter', 'error');
    }
}

async function loadFilterOptions() {
    try {
        const response = await fetch('/api/filters');
        filterOptions = await response.json();
        populateFilterDropdowns();
        console.log('Filter options loaded:', filterOptions);
    } catch (error) {
        console.error('Error loading filter options:', error);
        showNotification('Error loading filter options', 'error');
    }
}

function populateFilterDropdowns() {
    const filterMappings = {
        'category-filter': filterOptions.categories,
        'acceptance-status-filter': filterOptions.acceptance_statuses,
        'allocation-status-filter': filterOptions.allocation_statuses,
        'state-city-filter': filterOptions.state_cities,
        'flow-type-filter': filterOptions.flow_types,
        'ticket-type-filter': filterOptions.ticket_types
    };
    Object.entries(filterMappings).forEach(([selectId, options]) => {
        const select = document.getElementById(selectId);
        if (select && options) {
            select.innerHTML = select.children[0].outerHTML;
            options.forEach(option => {
                const optionElement = document.createElement('option');
                optionElement.value = option;
                optionElement.textContent = option;
                select.appendChild(optionElement);
            });
        }
    });
}

async function loadDevices(page = 1) {
    if (!hasMoreDevices && page > 1) return;

    try {
        showLoading(true);
        const filters = getCurrentFilters();
        console.log('Applying filters:', filters);
        const params = new URLSearchParams({
            ...filters,
            page: page,
            per_page: 50
        });
        if (currentSort.field) {
            params.append('sort_by', currentSort.field);
            params.append('sort_order', currentSort.direction.toUpperCase());
        }
        const response = await fetch(`/api/devices/paginated?${params}`);
        const newDevices = await response.json();

        if (!Array.isArray(newDevices)) {
            console.error('Invalid response from /api/devices/paginated:', newDevices);
            newDevices = [];
        }

        if (newDevices.length < 50) {
            hasMoreDevices = false;
            document.getElementById('load-more-btn').style.display = 'none';
        } else {
            hasMoreDevices = true;
            document.getElementById('load-more-btn').style.display = 'block';
        }

        if (page === 1) {
            allDevices = newDevices;
            filteredDevices = newDevices;
        } else {
            allDevices = [...allDevices, ...newDevices];
            filteredDevices = [...filteredDevices, ...newDevices];
        }

        console.log('Filtered devices:', filteredDevices);
        renderDevices();
    } catch (error) {
        console.error('Error loading devices:', error);
        showNotification('Error loading devices', 'error');
        allDevices = [];
        filteredDevices = [];
        elements.devicesTbody.innerHTML = '';
        elements.devicesCards.innerHTML = '';
        renderDevices();
    } finally {
        showLoading(false);
    }
}

function loadMoreDevices() {
    currentPage++;
    loadDevices(currentPage);
}

async function loadDashboardStats() {
    try {
        const response = await fetch('/api/dashboard-stats');
        const stats = await response.json();
        console.log('Dashboard stats fetched:', stats);
        updateDashboardStats(stats);
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }
}

function updateDashboardStats(stats) {
    document.getElementById('total-devices').textContent = stats.total_devices || 0;
    document.getElementById('allocated-devices').textContent = stats.allocated || 0;
    document.getElementById('available-devices').textContent = stats.available || 0;
    document.getElementById('repairing-devices').textContent = stats.repairing || 0;
    document.getElementById('faulty-devices').textContent = stats.faulty || 0;
    document.getElementById('repaired-devices').textContent = stats.repaired || 0;
    console.log('Dashboard stats updated:', stats);
}

function getCurrentFilters() {
    return {
        search: elements.searchInput.value.trim(),
        category: document.getElementById('category-filter')?.value || '',
        acceptance_status: document.getElementById('acceptance-status-filter')?.value || '',
        allocation_status: document.getElementById('allocation-status-filter')?.value || '',
        state_city: (document.getElementById('state-city-filter')?.value || '').trim(),
        flow_type: document.getElementById('flow-type-filter')?.value || '',
        ticket_type: document.getElementById('ticket-type-filter')?.value || ''
    };
}

function handleSearch() {
    applyFilters();
}

async function applyFilters() {
    currentPage = 1;
    hasMoreDevices = true;
    allDevices = [];
    filteredDevices = [];
    elements.devicesTbody.innerHTML = '';
    elements.devicesCards.innerHTML = '';
    console.log('Applying filters, clearing UI');
    await loadDevices();
}

function clearAllFilters() {
    elements.searchInput.value = '';
    const filterSelects = [
        'category-filter',
        'acceptance-status-filter',
        'allocation-status-filter',
        'state-city-filter',
        'flow-type-filter',
        'ticket-type-filter'
    ];
    filterSelects.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.selectedIndex = 0;
    });
    applyFilters();
}

function toggleFilters() {
    elements.filtersSidebar.classList.toggle('open');
    elements.overlay.classList.toggle('show');
}

function closeFilters() {
    elements.filtersSidebar.classList.remove('open');
    elements.overlay.classList.remove('show');
}

function switchView(view) {
    currentView = view;
    if (view === 'table') {
        elements.tableView.classList.add('active');
        elements.cardView.classList.remove('active');
        elements.tableContainer.style.display = filteredDevices.length > 0 ? 'block' : 'none';
        elements.cardsContainer.style.display = 'none';
    } else {
        elements.cardView.classList.add('active');
        elements.tableView.classList.remove('active');
        elements.tableContainer.style.display = 'none';
        elements.cardsContainer.style.display = filteredDevices.length > 0 ? 'block' : 'none';
    }
    renderDevices();
}

function handleTableSort(e) {
    const th = e.target.closest('th');
    if (!th || !th.dataset.sort) return;
    const field = th.dataset.sort;
    if (currentSort.field === field) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.field = field;
        currentSort.direction = 'asc';
    }
    updateSortIcons();
    applyFilters();
}

function updateSortIcons() {
    document.querySelectorAll('.sort-icon').forEach(icon => {
        icon.className = 'fas fa-sort sort-icon';
    });
    if (currentSort.field) {
        const activeHeader = document.querySelector(`th[data-sort="${currentSort.field}"] .sort-icon`);
        if (activeHeader) {
            activeHeader.className = currentSort.direction === 'asc' 
                ? 'fas fa-sort-up sort-icon active'
                : 'fas fa-sort-down sort-icon active';
        }
    }
}

function renderDevices() {
    console.log('Rendering devices, length:', filteredDevices.length);
    elements.devicesTbody.innerHTML = '';
    elements.devicesCards.innerHTML = '';
    if (!filteredDevices || filteredDevices.length === 0) {
        elements.noResults.style.display = 'block';
        elements.tableContainer.style.display = 'none';
        elements.cardsContainer.style.display = 'none';
        return;
    }
    elements.noResults.style.display = 'none';
    if (currentView === 'table') {
        renderTable();
        elements.tableContainer.style.display = 'block';
        elements.cardsContainer.style.display = 'none';
    } else {
        renderCards();
        elements.tableContainer.style.display = 'none';
        elements.cardsContainer.style.display = 'block';
    }
}

function renderTable() {
    elements.devicesTbody.innerHTML = filteredDevices.map(device => `
        <tr data-device-id="${device.DEVICE_ID}">
            <td>
                <div class="device-info">
                    <div class="device-id">${device.DEVICE_ID}</div>
                    <div class="device-serial">${device.DEVICE_SERIAL_NO}</div>
                    <div class="device-model">${device.MODEL_MAKE}</div>
                    <span class="device-category">${device.CATEGORY}</span>
                </div>
            </td>
            <td>
                <div class="location-info">
                    <div class="location-name">${device.LOCATION_NAME}</div>
                    <div class="location-city">${device.STATE_CITY}</div>
                    <div class="location-movement">${formatDate(device.LOCATION_MOVEMENT_DATE)}</div>
                </div>
            </td>
            <td>
                <div class="assignment-info">
                    <div class="assignment-name">${device.L1_NAME || 'Not assigned'}</div>
                    <div class="assignment-account">${device.L1_ACCOUNT_NO || ''}</div>
                    <div class="assignment-date">${device.DATE_OF_L1_ACCEPTANCE ? formatDate(device.DATE_OF_L1_ACCEPTANCE) : ''}</div>
                </div>
            </td>
            <td>
                <div class="assignment-info">
                    <div class="assignment-name">${device.L2_NAME || 'Not assigned'}</div>
                    <div class="assignment-account">${device.L2_ACCOUNT_NO || ''}</div>
                    <div class="assignment-date">${device.DATE_OF_L2_ACCEPTANCE ? formatDate(device.DATE_OF_L2_ACCEPTANCE) : ''}</div>
                </div>
            </td>
            <td>
                <div class="assignment-info">
                    <div class="assignment-name">${device.ENGG_NAME || 'Not assigned'}</div>
                    <div class="assignment-account">${device.ENGG_ACCOUNT_NO || ''}</div>
                    <div class="assignment-date">${device.DATE_OF_ENGG_ACCEPTANCE ? formatDate(device.DATE_OF_ENGG_ACCEPTANCE) : ''}</div>
                </div>
            </td>
            <td>
                <div class="assignment-info">
                    <div class="assignment-name">${device.CUSTOMER_NAME}</div>
                    <div class="assignment-account">${device.CUSTOMER_ACCOUNT_NO}</div>
                    <div class="assignment-date">${device.DATE_OF_CUSTOMER_ALLOCATION ? formatDate(device.DATE_OF_CUSTOMER_ALLOCATION) : ''}</div>
                </div>
            </td>
            <td>
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    ${getStatusBadge(device.ACCEPTANCE_STATUS, 'acceptance')}
                    ${getStatusBadge(device.DEVICE_ALLOCATION_STATUS, 'allocation')}
                </div>
            </td>
            <td>
                <div class="ticket-info">
                    <div class="ticket-number">${device.TICKET_NO}</div>
                    <div class="ticket-type">${device.TYPE_OF_TICKET}</div>
                    <div class="ticket-date">${formatDate(device.TICKET_DATE)}</div>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderCards() {
    elements.devicesCards.innerHTML = filteredDevices.map(device => `
        <div class="device-card" data-device-id="${device.DEVICE_ID}">
            <div class="card-header">
                <div class="card-device-info">
                    <div class="card-device-id">${device.DEVICE_ID}</div>
                    <div class="card-badges">
                        ${getStatusBadge(device.ACCEPTANCE_STATUS, 'acceptance')}
                        ${getStatusBadge(device.DEVICE_ALLOCATION_STATUS, 'allocation')}
                    </div>
                </div>
                <div class="card-details">
                    <div class="card-detail">
                        <div class="card-detail-label">Serial No</div>
                        <div class="card-detail-value">${device.DEVICE_SERIAL_NO}</div>
                    </div>
                    <div class="card-detail">
                        <div class="card-detail-label">Model</div>
                        <div class="card-detail-value">${device.MODEL_MAKE}</div>
                    </div>
                    <div class="card-detail">
                        <div class="card-detail-label">Category</div>
                        <div class="card-detail-value">${device.CATEGORY}</div>
                    </div>
                    <div class="card-detail">
                        <div class="card-detail-label">Location</div>
                        <div class="card-detail-value">${device.LOCATION_NAME}</div>
                    </div>
                </div>
            </div>
            <div class="card-body">
                <div class="card-assignments">
                    <div class="card-assignment">
                        <div class="card-assignment-label">L1</div>
                        <div class="card-assignment-name">${device.L1_NAME || 'Not assigned'}</div>
                    </div>
                    <div class="card-assignment">
                        <div class="card-assignment-label">L2</div>
                        <div class="card-assignment-name">${device.L2_NAME || 'Not assigned'}</div>
                    </div>
                    <div class="card-assignment">
                        <div class="card-assignment-label">Engineer</div>
                        <div class="card-assignment-name">${device.ENGG_NAME || 'Not assigned'}</div>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

function getStatusBadge(status, type) {
    const statusClass = getStatusClass(status, type);
    return `<span class="status-badge ${statusClass}">${status || 'N/A'}</span>`;
}

function getStatusClass(status, type) {
    if (type === 'acceptance') {
        switch (status) {
            case 'Accepted': return 'status-accepted';
            case 'Pending': return 'status-pending';
            case 'In Progress': return 'status-in-progress';
            case 'Rejected': return 'status-rejected';
            default: return 'status-pending';
        }
    } else {
        switch (status) {
            case 'ALLOCATED': return 'status-allocated';
            case 'GOOD': return 'status-available'; // Changed to match 'GOOD'
            case 'REPAIRED': return 'status-accepted';
            case 'REPAIRING': return 'status-in-progress';
            case 'FAULTY': return 'status-rejected';
            default: return 'status-available';
        }
    }
}

function showDeviceModal(deviceId) {
    const device = allDevices.find(d => d.DEVICE_ID === deviceId);
    if (!device) return;
    document.getElementById('modal-device-id').textContent = `Device: ${device.DEVICE_ID}`;
    populateGeneralTab(device);
    populateAssignmentTab(device);
    populateCustomerTab(device);
    populateTicketTab(device);
    elements.deviceModal.classList.add('show');
    elements.overlay.classList.add('show');
}

function populateGeneralTab(device) {
    document.getElementById('general-tab').innerHTML = `
        <div class="detail-section">
            <h3>Device Information</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">Device ID</div>
                    <div class="detail-value monospace">${device.DEVICE_ID}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Serial Number</div>
                    <div class="detail-value monospace">${device.DEVICE_SERIAL_NO}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Model/Make</div>
                    <div class="detail-value">${device.MODEL_MAKE}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Category</div>
                    <div class="detail-value">${device.CATEGORY}</div>
                </div>
            </div>
        </div>
        <div class="detail-section">
            <h3>Location Information</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">Location Name</div>
                    <div class="detail-value">${device.LOCATION_NAME}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">State/City</div>
                    <div class="detail-value">${device.STATE_CITY}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Movement Path</div>
                    <div class="detail-value">${device.FROM_WHTO_LOCATOR || 'N/A'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Movement Date</div>
                    <div class="detail-value">${formatDate(device.LOCATION_MOVEMENT_DATE)}</div>
                </div>
            </div>
        </div>
        <div class="detail-section">
            <h3>Status Information</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">Acceptance Status</div>
                    <div class="detail-value">${getStatusBadge(device.ACCEPTANCE_STATUS, 'acceptance')}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Allocation Status</div>
                    <div class="detail-value">${getStatusBadge(device.DEVICE_ALLOCATION_STATUS, 'allocation')}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Flow Type</div>
                    <div class="detail-value">${device.FLOW_TYPE}</div>
                </div>
            </div>
        </div>
    `;
}

function populateAssignmentTab(device) {
    document.getElementById('assignment-tab').innerHTML = `
        <div class="detail-section">
            <h3>L1 Assignment</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">Account Number</div>
                    <div class="detail-value monospace">${device.L1_ACCOUNT_NO || 'N/A'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Name</div>
                    <div class="detail-value">${device.L1_NAME || 'Not assigned'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Acceptance Date</div>
                    <div class="detail-value">${device.DATE_OF_L1_ACCEPTANCE ? formatDate(device.DATE_OF_L1_ACCEPTANCE) : 'N/A'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Acceptance App</div>
                    <div class="detail-value">${device.L1_ACCEPTANCE_APP || 'N/A'}</div>
                </div>
            </div>
        </div>
        <div class="detail-section">
            <h3>L2 Assignment</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">Account Number</div>
                    <div class="detail-value monospace">${device.L2_ACCOUNT_NO || 'N/A'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Name</div>
                    <div class="card-assignment-name">${device.L2_NAME || 'Not assigned'}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Acceptance Date</div>
                        <div class="detail-value">${device.DATE_OF_L2_ACCEPTANCE ? formatDate(device.DATE_OF_L2_ACCEPTANCE) : 'N/A'}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Acceptance App</div>
                        <div class="detail-value">${device.L2_ACCEPTANCE_APP || 'N/A'}</div>
                    </div>
                </div>
                <div class="detail-section">
                    <h3>Engineer Assignment</h3>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <div class="detail-label">Account Number</div>
                            <div class="detail-value monospace">${device.ENGG_ACCOUNT_NO || 'N/A'}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Name</div>
                            <div class="detail-value">${device.ENGG_NAME || 'Not assigned'}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Assignment Date</div>
                            <div class="detail-value">${device.L1_ASSIGNED_TO_ENGG ? formatDate(device.L1_ASSIGNED_TO_ENGG) : 'N/A'}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Acceptance Date</div>
                            <div class="detail-value">${device.DATE_OF_ENGG_ACCEPTANCE ? formatDate(device.DATE_OF_ENGG_ACCEPTANCE) : 'N/A'}</div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        function populateCustomerTab(device) {
            document.getElementById('customer-tab').innerHTML = `
                <div class="detail-section">
                    <h3>Customer Information</h3>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <div class="detail-label">Account Number</div>
                            <div class="detail-value monospace">${device.CUSTOMER_ACCOUNT_NO || 'N/A'}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Name</div>
                            <div class="detail-value">${device.CUSTOMER_NAME || 'Not assigned'}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Allocation Date</div>
                            <div class="detail-value">${device.DATE_OF_CUSTOMER_ALLOCATION ? formatDate(device.DATE_OF_CUSTOMER_ALLOCATION) : 'N/A'}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Current Location User</div>
                            <div class="detail-value">${device.CURRENT_LOCATION_USER_ID || 'N/A'}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Location Contact</div>
                            <div class="detail-value">${device.LOCATION_FIRST_NAME} ${device.LOCATION_LAST_NAME || ''}</div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        function populateTicketTab(device) {
            document.getElementById('ticket-tab').innerHTML = `
                <div class="detail-section">
                    <h3>Ticket Information</h3>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <div class="detail-label">Ticket Number</div>
                            <div class="detail-value monospace">${device.TICKET_NO || 'N/A'}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Type</div>
                            <div class="detail-value">${device.TYPE_OF_TICKET || 'N/A'}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Date</div>
                            <div class="detail-value">${formatDate(device.TICKET_DATE)}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Status</div>
                            <div class="detail-value">${device.TICKET_STATUS || 'N/A'}</div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        function switchTab(tabId) {
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
            document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
            document.getElementById(`${tabId}-tab`).classList.add('active');
        }
        
        function closeModal() {
            elements.deviceModal.classList.remove('show');
            elements.overlay.classList.remove('show');
        }
        
        function formatDate(dateStr) {
            if (!dateStr) return 'N/A';
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return 'N/A';
            return date.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        }
        
        function showLoading(isLoading) {
            elements.loading.style.display = isLoading ? 'flex' : 'none';
            if (!isLoading) {
                elements.tableContainer.style.display = currentView === 'table' && filteredDevices.length > 0 ? 'block' : 'none';
                elements.cardsContainer.style.display = currentView === 'card' && filteredDevices.length > 0 ? 'block' : 'none';
                elements.noResults.style.display = filteredDevices.length === 0 ? 'block' : 'none';
            }
        }
        
        async function refreshData() {
            currentPage = 1;
            hasMoreDevices = true;
            allDevices = [];
            filteredDevices = [];
            elements.devicesTbody.innerHTML = '';
            elements.devicesCards.innerHTML = '';
            await loadDevices();
            await loadDashboardStats();
            showNotification('Data refreshed', 'success');
        }
        
        function exportData() {
            const headers = [
                'Device ID', 'Serial No', 'Model/Make', 'Category', 'Location Name', 'State/City',
                'Movement Date', 'L1 Account', 'L1 Name', 'L1 Acceptance Date', 'L1 Acceptance App',
                'L2 Account', 'L2 Name', 'L2 Acceptance Date', 'L2 Acceptance App', 'Engg Account',
                'Engg Name', 'Engg Assignment Date', 'Engg Acceptance Date', 'Acceptance Status',
                'Flow Type', 'Ticket No', 'Ticket Date', 'Ticket Type', 'Ticket Status',
                'Customer Account', 'Customer Name', 'Customer Allocation Date', 'Allocation Status'
            ];
            const csv = [
                headers.join(','),
                ...filteredDevices.map(device => [
                    `"${device.DEVICE_ID}"`, `"${device.DEVICE_SERIAL_NO}"`, `"${device.MODEL_MAKE}"`,
                    `"${device.CATEGORY}"`, `"${device.LOCATION_NAME}"`, `"${device.STATE_CITY}"`,
                    `"${formatDate(device.LOCATION_MOVEMENT_DATE)}"`, `"${device.L1_ACCOUNT_NO}"`,
                    `"${device.L1_NAME}"`, `"${formatDate(device.DATE_OF_L1_ACCEPTANCE)}"`,
                    `"${device.L1_ACCEPTANCE_APP}"`, `"${device.L2_ACCOUNT_NO}"`, `"${device.L2_NAME}"`,
                    `"${formatDate(device.DATE_OF_L2_ACCEPTANCE)}"`, `"${device.L2_ACCEPTANCE_APP}"`,
                    `"${device.ENGG_ACCOUNT_NO}"`, `"${device.ENGG_NAME}"`,
                    `"${formatDate(device.L1_ASSIGNED_TO_ENGG)}"`,
                    `"${formatDate(device.DATE_OF_ENGG_ACCEPTANCE)}"`, `"${device.ACCEPTANCE_STATUS}"`,
                    `"${device.FLOW_TYPE}"`, `"${device.TICKET_NO}"`, `"${formatDate(device.TICKET_DATE)}"`,
                    `"${device.TYPE_OF_TICKET}"`, `"${device.TICKET_STATUS}"`, `"${device.CUSTOMER_ACCOUNT_NO}"`,
                    `"${device.CUSTOMER_NAME}"`, `"${formatDate(device.DATE_OF_CUSTOMER_ALLOCATION)}"`,
                    `"${device.DEVICE_ALLOCATION_STATUS}"`
                ].join(','))
            ].join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cpe_devices_${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
            showNotification('Data exported successfully', 'success');
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
        
        function showNotification(message, type = 'info') {
            console.log(`${type}: ${message}`);
        }
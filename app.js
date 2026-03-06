// app.js - Frontend Logic for FOF Logistics Mobile Interface

document.addEventListener('DOMContentLoaded', () => {

    const API_URL = 'https://script.google.com/macros/s/AKfycbxEwlrKIZNgIb-4WEBPeaz35ekVvRuL8HRAplehgssnKKg6XG0-t9zze62TOgBZK2Q/exec';
    let vehicleData = [];

    // --- Settings / LocalStorage ---
    let appSettings = JSON.parse(localStorage.getItem('fof_logi_settings')) || {
        slName: 'Non identifié',
        effectifs: 0,
        initialSupply: 12000,
        shiftActive: false,
        shiftStartTime: null
    };

    // --- DOM Elements ---
    const vehicleListEl = document.getElementById('vehicle-list');
    const groupTemplate = document.getElementById('category-group-template');
    const cardTemplate = document.getElementById('vehicle-card-template');

    const uiSupply = document.getElementById('global-supply');
    const uiDeployed = document.getElementById('global-deployed');
    const uiDestroyed = document.getElementById('global-destroyed');
    const uiEvasan = document.getElementById('global-evasan');
    const searchInput = document.getElementById('vehicle-search');

    // Settings UI
    const slInfoBtn = document.getElementById('sl-info-btn');
    const currentSlEl = document.getElementById('current-sl');
    const currentEffEl = document.getElementById('current-eff');
    const navSettingsBtn = document.getElementById('nav-settings');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings');
    const saveSettingsBtn = document.getElementById('save-settings');

    const inputSlName = document.getElementById('setting-sl-name');
    const inputEff = document.getElementById('setting-eff');
    const inputSupply = document.getElementById('setting-supply');

    const shiftIndicatorEl = document.getElementById('shift-indicator');
    const btnShiftToggle = document.getElementById('btn-shift-toggle');
    const shiftStatusText = document.getElementById('shift-status-text');

    async function init() {
        applySettingsToUI();
        setupSettingsEvents();

        try {
            const response = await fetch(API_URL);
            const result = await response.json();

            if (result.status === 'success') {
                // Remove the header row (typically row 8) if returned by the API
                vehicleData = result.data.filter(v => v.id > 8 && v.name !== "Type de véhicule");
                renderList(vehicleData);
                updateGlobalStats();
            } else {
                showError("Erreur API : " + result.message);
            }
        } catch (error) {
            console.error(error);
            showError("Impossible de contacter le QG.");
        }

        setupSearch();
    }

    function showError(msg) {
        vehicleListEl.innerHTML = `<div class="loading-state"><p style="color:var(--accent-danger)">${msg}</p></div>`;
    }

    // --- Icons Logic ---
    function getCategoryIcon(categoryName) {
        const catUpper = categoryName.toUpperCase();
        if (catUpper.includes('EM') || catUpper.includes('QG')) return 'fa-solid fa-satellite-dish';
        if (catUpper.includes('RAVITAILLEMENT') || catUpper.includes('MAINTENANCE')) return 'fa-solid fa-wrench';
        if (catUpper.includes('TRANSPORT DE TROUPES')) return 'fa-solid fa-truck';
        if (catUpper.includes('BLINDÉ') || catUpper.includes('INFANTERIE')) return 'fa-solid fa-truck-field';
        if (catUpper.includes('CHAR')) return 'fa-solid fa-tank-water';
        if (catUpper.includes('AÉRIEN') || catUpper.includes('MÉDEVAC')) return 'fa-solid fa-helicopter';
        if (catUpper.includes('EVASAN') || catUpper.includes('SANITAIRE')) return 'fa-solid fa-truck-medical';
        return 'fa-solid fa-box'; // Fallback
    }

    // --- Core Render Logic ---
    function renderList(data) {
        vehicleListEl.innerHTML = ''; // Clear loading or previous items

        if (data.length === 0) {
            vehicleListEl.innerHTML = '<div class="loading-state"><p>Aucun véhicule trouvé.</p></div>';
            return;
        }

        // 1. Group Data by Category
        const groupedData = {};
        data.forEach(vehicle => {
            if (!groupedData[vehicle.category]) {
                groupedData[vehicle.category] = {
                    vehicles: [],
                    deployedCount: 0,
                    totalCount: 0
                };
            }
            groupedData[vehicle.category].vehicles.push(vehicle);
            groupedData[vehicle.category].totalCount++;
            if (vehicle.status === "Opérationnel") {
                groupedData[vehicle.category].deployedCount++;
            }
        });

        // 2. Render Groups and Cards
        for (const [categoryName, categoryData] of Object.entries(groupedData)) {
            // Create Group Shell
            const groupClone = groupTemplate.content.cloneNode(true);
            const groupDiv = groupClone.querySelector('.category-group');
            const groupHeader = groupClone.querySelector('.category-header');
            const groupGrid = groupClone.querySelector('.category-grid');

            // Set Group Texts & Icons
            const iconClass = getCategoryIcon(categoryName);
            const titleGroup = groupClone.querySelector('.cat-title-group');
            titleGroup.innerHTML = `<i class="${iconClass} cat-icon"></i><span class="cat-name">${categoryName}</span>`;

            groupClone.querySelector('.cat-deployed-count').textContent = `${categoryData.deployedCount} Opérationnels`;
            groupClone.querySelector('.cat-total-count').textContent = `/ ${categoryData.totalCount} Total`;

            updateAccordionColorClass(groupDiv, categoryData.deployedCount, categoryData.totalCount);

            // Populate Cards inside this accordion
            categoryData.vehicles.forEach(vehicle => {
                const cardClone = cardTemplate.content.cloneNode(true);
                const card = cardClone.querySelector('.vehicle-card');

                // Set data attributes and class based on status
                card.dataset.id = vehicle.id;
                card.dataset.category = vehicle.category;
                updateCardStatusClass(card, vehicle.status);

                // Populate form elements
                const select = cardClone.querySelector('.status-select');
                select.value = vehicle.status;

                const inputDeployed = cardClone.querySelector('.deployed-input');
                inputDeployed.value = vehicle.deployed;

                const inputCrew = cardClone.querySelector('.crew-input');
                inputCrew.value = vehicle.crew || vehicle.note;

                // Populate Static Texts
                cardClone.querySelector('.vehicle-name').textContent = vehicle.name;

                const badgeEl = cardClone.querySelector('.grade-badge');
                if (vehicle.grade && vehicle.grade.trim() !== '') {
                    badgeEl.textContent = vehicle.grade;
                    badgeEl.style.display = 'inline-block';
                } else {
                    badgeEl.style.display = 'none';
                }

                cardClone.querySelector('.cost-val').textContent = vehicle.cost;

                // --- Event Listeners for this card ---
                select.addEventListener('change', (e) => {
                    const newStatus = e.target.value;
                    const oldStatus = vehicle.status;
                    vehicle.status = newStatus;
                    updateCardStatusClass(card, newStatus);
                    updateGlobalStats(); // Update stats which might re-render, though usually you just want to update DOM locally
                    syncData(vehicle);

                    // Update group colors
                    let offset = 0;
                    if (oldStatus === "Opérationnel" && newStatus !== "Opérationnel") offset = -1;
                    if (oldStatus !== "Opérationnel" && newStatus === "Opérationnel") offset = 1;
                    updateAccordionStatsLocal(groupDiv, offset, categoryData.totalCount);
                });

                const btnInc = cardClone.querySelector('.inc-btn');
                const btnDec = cardClone.querySelector('.dec-btn');

                btnInc.addEventListener('click', () => {
                    vehicle.deployed++;
                    inputDeployed.value = vehicle.deployed;
                    if (vehicle.deployed > 0 && vehicle.status === "Pas déployé") {
                        vehicle.status = "Opérationnel";
                        select.value = "Opérationnel";
                        updateCardStatusClass(card, "Opérationnel");
                        updateAccordionStatsLocal(groupDiv, 1, categoryData.totalCount);
                    }
                    updateGlobalStats();
                    syncData(vehicle);
                });

                btnDec.addEventListener('click', () => {
                    if (vehicle.deployed > 0) {
                        vehicle.deployed--;
                        inputDeployed.value = vehicle.deployed;
                        if (vehicle.deployed === 0) {
                            vehicle.status = "Pas déployé";
                            select.value = "Pas déployé";
                            updateCardStatusClass(card, "Pas déployé");
                            updateAccordionStatsLocal(groupDiv, -1, categoryData.totalCount);
                        }
                        updateGlobalStats();
                        syncData(vehicle);
                    }
                });

                inputCrew.addEventListener('change', (e) => {
                    vehicle.crew = e.target.value;
                    syncData(vehicle);
                });

                groupGrid.appendChild(cardClone);
            });

            vehicleListEl.appendChild(groupClone);
        }
    }

    // Quick helper to keep group counts updated visually without full re-render
    function updateAccordionStatsLocal(groupDiv, offset, totalCount) {
        if (offset === 0) return;

        const countSpan = groupDiv.querySelector('.cat-deployed-count');
        const currentText = countSpan.textContent;
        let currentCount = parseInt(currentText.split(' ')[0]);

        if (!isNaN(currentCount)) {
            currentCount += offset;
            countSpan.textContent = `${currentCount} Opérationnels`;
            updateAccordionColorClass(groupDiv, currentCount, totalCount);
        }
    }

    function updateAccordionColorClass(groupDiv, deployedCount, totalCount) {
        groupDiv.classList.remove('status-red', 'status-orange', 'status-green');

        if (deployedCount === 0) {
            groupDiv.classList.add('status-red');
        } else if (deployedCount > 0 && deployedCount < totalCount) {
            groupDiv.classList.add('status-orange');
        } else if (deployedCount === totalCount && totalCount > 0) {
            groupDiv.classList.add('status-green');
        } else {
            groupDiv.classList.add('status-red'); // fallback
        }
    }

    // --- Helpers ---
    function updateCardStatusClass(card, status) {
        card.classList.remove('status-operational', 'status-undeployed', 'status-destroyed');
        if (status === 'Opérationnel') card.classList.add('status-operational');
        else if (status === 'Détruit') card.classList.add('status-destroyed');
        else card.classList.add('status-undeployed'); // 'Pas déployé' or others
    }

    // --- Settings / Shift Logic ---
    function applySettingsToUI() {
        currentSlEl.textContent = appSettings.slName;
        currentEffEl.textContent = `[${appSettings.effectifs} EFF]`;

        // Update Shift Indicator
        if (appSettings.shiftActive) {
            shiftIndicatorEl.style.display = 'inline-block';
        } else {
            shiftIndicatorEl.style.display = 'none';
        }

        // Update Modal inputs
        inputSlName.value = appSettings.slName;
        inputEff.value = appSettings.effectifs;
        inputSupply.value = appSettings.initialSupply;

        updateShiftButtonUI();
    }

    function updateShiftButtonUI() {
        if (appSettings.shiftActive) {
            btnShiftToggle.style.backgroundColor = 'var(--accent-danger)';
            btnShiftToggle.innerHTML = `<i class="fa-solid fa-stop"></i> FIN DE SERVICE`;

            const startDate = new Date(appSettings.shiftStartTime);
            shiftStatusText.textContent = `En service depuis le ${startDate.toLocaleDateString('fr-FR')} à ${startDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.`;
        } else {
            btnShiftToggle.style.backgroundColor = 'var(--accent-primary)';
            btnShiftToggle.innerHTML = `<i class="fa-solid fa-play"></i> PRENDRE LE SERVICE`;
            shiftStatusText.textContent = "Hors service.";
        }
    }

    function setupSettingsEvents() {
        const openModal = () => {
            applySettingsToUI(); // populate with current values
            settingsModal.classList.remove('hidden');
        };

        const closeModal = () => {
            settingsModal.classList.add('hidden');
        };

        slInfoBtn.addEventListener('click', openModal);
        navSettingsBtn.addEventListener('click', openModal);

        closeSettingsBtn.addEventListener('click', closeModal);

        // Close on clicking outside
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                closeModal();
            }
        });

        saveSettingsBtn.addEventListener('click', () => {
            appSettings.slName = inputSlName.value || 'Non identifié';
            appSettings.effectifs = parseInt(inputEff.value) || 0;
            appSettings.initialSupply = parseInt(inputSupply.value) || 0;

            // Save to LocalStorage
            localStorage.setItem('fof_logi_settings', JSON.stringify(appSettings));

            // Apply to UI
            applySettingsToUI();

            // Recalculate global stats to apply new base supply
            updateGlobalStats();

            closeModal();
        });

        btnShiftToggle.addEventListener('click', () => {
            const now = new Date();
            const formattedTime = `${now.toLocaleDateString('fr-FR')} ${now.toLocaleTimeString('fr-FR')}`;

            let shiftData = {
                slName: appSettings.slName // always send current SL name
            };

            if (!appSettings.shiftActive) {
                // START SHIFT
                appSettings.shiftActive = true;
                appSettings.shiftStartTime = now.toISOString();
                shiftData.startTime = formattedTime;
                // Optional: clear end time on start
                shiftData.endTime = "";
            } else {
                // END SHIFT
                appSettings.shiftActive = false;
                appSettings.shiftStartTime = null;
                shiftData.endTime = formattedTime;
            }

            localStorage.setItem('fof_logi_settings', JSON.stringify(appSettings));
            updateShiftButtonUI();
            applySettingsToUI(); // update the green badge indicator

            syncShiftLog(shiftData);
        });
    }

    // --- Global Stats Logic ---
    function updateGlobalStats() {
        let deployed = 0;
        let destroyedCount = 0;
        let evasanCount = 0;
        let supplyCost = 0;

        vehicleData.forEach(v => {
            if (v.status === "Opérationnel") {
                deployed += v.deployed;
                supplyCost += (v.deployed * v.cost);
            }
            if (v.status === "Détruit") {
                destroyedCount += v.deployed;
                supplyCost += (v.deployed * v.cost);
            }
            if (v.category.toUpperCase().includes('EVASAN') || v.name.toUpperCase().includes('EVASAN')) {
                if (v.status === "Opérationnel") evasanCount += v.deployed;
            }
        });

        uiDeployed.textContent = deployed;
        uiDestroyed.textContent = destroyedCount;
        uiEvasan.textContent = evasanCount;

        const currentSupply = appSettings.initialSupply - supplyCost;
        uiSupply.textContent = currentSupply.toLocaleString('fr-FR');

        // Visual warning if supply is low
        if (currentSupply < 2000) {
            uiSupply.style.color = 'var(--accent-danger)';
        } else {
            uiSupply.style.color = '#fff'; // Default
        }
    }

    function setupSearch() {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = vehicleData.filter(v =>
                v.name.toLowerCase().includes(term) ||
                v.category.toLowerCase().includes(term)
            );
            renderList(filtered);
        });
    }

    // --- "API" Sync  ---
    function syncData(modifiedVehicle) {
        console.log(`[SYNC QG] Updating Sheet for: ${modifiedVehicle.name}`);

        fetch(API_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                action: 'update',
                vehicle: modifiedVehicle
            })
        }).catch(err => console.error("Erreur Sync", err));
    }

    function syncShiftLog(shiftData) {
        console.log(`[SYNC QG] Updating Shift Log:`, shiftData);

        fetch(API_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                action: 'shift_log',
                data: shiftData
            })
        }).catch(err => console.error("Erreur Sync Shift", err));
    }

    // Start App
    init();
});

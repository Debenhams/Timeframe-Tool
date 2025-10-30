/* ========================================================================
    INITIALIZATION SCRIPT (src/init.js)
    - Attaches all event listeners
    - Boots the application on DOMContentLoaded
======================================================================== */

(function () {
    "use strict";

    // --- Utility Functions ---
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => Array.from(document.querySelectorAll(s));

    /**
     * Main boot function, runs once the DOM is ready.
     */
    async function boot() {
        console.log("Initializing Professional Rota System v3...");

        // Set default week to today's week
        const today = new Date();
        const monday = window.setToMonday(today);
        $('#weekStart').value = window.toISODate(monday);

        // Wire up all event listeners
        wireTopBarControls();
        wireTabControls();
        wireRotationEditor();
        wireAdvisorAssignments();
        wireSchedulesTree();
        wirePlannerTooltips();
        
        // Load all data from Supabase
        await window.loadAllData();
        
        // Populate all UI elements with the loaded data
        window.refreshAllUI();

        // Set initial state for undo/redo
        window.saveHistory();
        window.updateUndoRedoButtons();

        console.log("Application Initialized.");
    }

    /**
     * Wires controls in the main top bar.
     */
    function wireTopBarControls() {
        // Date controls
        $('#weekStart').addEventListener('change', window.renderPlanner);
        $('#btnToday').addEventListener('click', () => {
            const today = new Date();
            const monday = window.setToMonday(today);
            $('#weekStart').value = window.toISODate(monday);
            window.renderPlanner();
        });
        $('#prevWeek').addEventListener('click', () => {
            const current = new Date($('#weekStart').value + 'T00:00:00');
            current.setDate(current.getDate() - 7);
            $('#weekStart').value = window.toISODate(current);
            window.renderPlanner();
        });
        $('#nextWeek').addEventListener('click', () => {
            const current = new Date($('#weekStart').value + 'T00:00:00');
            current.setDate(current.getDate() + 7);
            $('#weekStart').value = window.toISODate(current);
            window.renderPlanner();
        });

        // Day selector for horizontal planner
        $('#teamDay').addEventListener('change', window.renderPlanner);
        
        // Undo/Redo
        $('#btnUndo').addEventListener('click', window.undo);
        $('#btnRedo').addEventListener('click', window.redo);
        
        // Keyboard shortcuts for Undo/Redo
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z') {
                    e.preventDefault();
                    window.undo();
                } else if (e.key === 'y') {
                    e.preventDefault();
                    window.redo();
                }
            }
        });

        // Commit Week (Placeholder for now)
        $('#btnCommit').addEventListener('click', () => {
            alert("This will commit the auto-generated schedule for all selected advisors to the 'rotas' table for historical records. (Feature in development)");
            // TODO: Add logic to save to 'rotas' table
        });

        // Print
        $('#btnPrint').addEventListener('click', () => window.print());
    }

    /**
     * Wires the tab buttons ("Rotation Editor", "Advisor Assignments").
     */
    function wireTabControls() {
        const tabs = $$('.panel-tab-button');
        const tabContents = $$('.panel-body[id^="tab-"]');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Deactivate all
                tabs.forEach(t => t.classList.remove('active'));
                tabContents.forEach(c => c.style.display = 'none');
                
                // Activate clicked
                tab.classList.add('active');
                const tabId = tab.dataset.tab;
                $(`#${tabId}`).style.display = 'block';
            });
        });
    }

    /**
     * Wires all controls in the "Rotation Editor" tab.
     */
    function wireRotationEditor() {
        // Main dropdown
        $('#rotationNameSelect').addEventListener('change', (e) => {
            window.displayRotationPattern(e.target.value);
        });

        // New Rotation
        $('#btnNewRotation').addEventListener('click', () => {
            const name = prompt("Enter a name for the new rotation family (e.g., 'Flex A', 'Nights'):");
            if (!name || name.trim() === '') return;
            
            if (window.APP_STATE.rotationPatterns.has(name)) {
                alert("A rotation with this name already exists.");
                return;
            }
            
            // Add to state and UI
            window.APP_STATE.rotationPatterns.set(name, { name, pattern: {} });
            window.populateRotationFamilySelect();
            $('#rotationNameSelect').value = name;
            
            // Display the new (empty) grid
            window.displayRotationPattern(name);
            $('#btnSaveRotation').disabled = false; // Enable save
        });

        // Save Rotation
        $('#btnSaveRotation').addEventListener('click', window.saveRotationPattern);

        // Delete Rotation
        $('#btnDeleteRotation').addEventListener('click', window.deleteRotationPattern);

        // Mark as "dirty" (needs saving) when any grid dropdown changes
        $('#rotationEditorGrid').addEventListener('change', (e) => {
            if (e.target.matches('select')) {
                $('#btnSaveRotation').disabled = false;
                window.showRotationStatus("Unsaved changes", "saving");
            }
        });

        // Copy Week Down button
        $('#rotationEditorGrid').addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-copy-week');
            if (!btn) return;

            const sourceRow = btn.closest('tr');
            const sourceWeek = sourceRow.dataset.week;
            const sourceWeekNum = parseInt(sourceWeek.replace('week', ''), 10);
            
            if (sourceWeekNum >= 6) return; // Can't copy from last row

            const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
            const values = {};
            days.forEach(day => {
                values[day] = sourceRow.querySelector(`select[data-day="${day}"]`).value;
            });

            // Apply to all subsequent rows
            for (let w = sourceWeekNum + 1; w <= 6; w++) {
                const targetRow = $(`#rotationEditorGrid tr[data-week="week${w}"]`);
                if (targetRow) {
                    days.forEach(day => {
                        targetRow.querySelector(`select[data-day="${day}"]`).value = values[day];
                    });
                }
            }
            $('#btnSaveRotation').disabled = false;
            window.showRotationStatus("Unsaved changes", "saving");
        });
    }

    /**
     * Wires controls in the "Advisor Assignments" tab.
     */
    function wireAdvisorAssignments() {
        const tableBody = $('#advisorAssignmentBody');

        // Event delegation for optimized performance
        tableBody.addEventListener('change', (e) => {
            const el = e.target;
            const advisorId = el.dataset.advisorId;
            if (!advisorId) return;

            const row = el.closest('tr');
            const rotationName = row.querySelector('.assign-rotation-name').value;
            const startDate = row.querySelector('.assign-start-date').value;

            // Save the change and add to undo buffer
            window.saveAdvisorAssignment(advisorId, rotationName, startDate);
            window.saveHistory();
        });
    }

    /**
     * Wires controls in the "Schedules" tree (right sidebar).
     */
    function wireSchedulesTree() {
        // Filter as user types
        $('#treeSearch').addEventListener('input', window.rebuildAdvisorTree);

        // Clear selection button
        $('#btnClearSel').addEventListener('click', () => {
            window.APP_STATE.selectedAdvisors.clear();
            window.refreshAdvisorChips();
            window.rebuildAdvisorTree(); // To uncheck all boxes
            window.renderPlanner();
        });

        // Handle checkbox clicks (event delegation)
        $('#tree').addEventListener('change', (e) => {
            if (e.target.matches('.advisor-tree-checkbox')) {
                const id = e.target.value;
                if (e.target.checked) {
                    window.APP_STATE.selectedAdvisors.add(id);
                } else {
                    window.APP_STATE.selectedAdvisors.delete(id);
                }
                window.refreshAdvisorChips();
                window.renderPlanner(); // Re-render planner with new selection
            }
        });

        // Handle chip remove clicks (event delegation)
        $('#activeChips').addEventListener('click', (e) => {
            const btn = e.target.closest('.chip-remove');
            if (btn) {
                const id = btn.dataset.id;
                window.APP_STATE.selectedAdvisors.delete(id);
                window.refreshAdvisorChips();
                window.rebuildAdvisorTree(); // To uncheck the box
                window.renderPlanner();
            }
        });
    }

    /**
     * Wires the tooltip for the horizontal planner.
     */
    function wirePlannerTooltips() {
        const tooltip = $('#plannerTooltip');
        const body = $('#plannerBody');
        if (!tooltip || !body) return;

        let hideTimeout;

        body.addEventListener('mouseover', (e) => {
            const bar = e.target.closest('.planner-bar');
            if (bar && bar.dataset.tooltip) {
                clearTimeout(hideTimeout);
                tooltip.innerHTML = bar.dataset.tooltip;
                tooltip.style.display = 'block';
                tooltip.style.opacity = '1';
            }
        });
        
        body.addEventListener('mouseout', (e) => {
            const bar = e.target.closest('.planner-bar');
            if (bar) {
                hideTimeout = setTimeout(() => {
                    tooltip.style.opacity = '0';
                    setTimeout(() => tooltip.style.display = 'none', 200);
                }, 100);
            }
        });
        
        body.addEventListener('mousemove', (e) => {
            tooltip.style.left = `${e.clientX}px`;
            tooltip.style.top = `${e.clientY}px`;
        });
    }

    // --- Start the application ---
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

})();


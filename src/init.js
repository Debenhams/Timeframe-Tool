/**
 * WFM Intelligence Platform - Initialization (v15.8)
 * Bootloader script - Modified to include authentication layer.
 */

(function() {
    // Configuration for the authentication
    const AUTH_CONFIG = {
        // NOTE: This is a client-side password for demonstration purposes ONLY.
        // In a production environment, this MUST be replaced with secure backend authentication.
        REQUIRED_PASSWORD: "WFM_Auth_2025", // <<< SET THE PASSWORD HERE
        SESSION_KEY: "wfm_session_authenticated"
    };

    // Function to initialize the core application (the original init logic)
    function initializeCoreApplication() {
        if (window.APP && window.APP.Core) {
            // Start the application
            window.APP.Core.initialize();

        } else {
            // If APP.Core is not available, the planner.js file failed to load or is corrupted.
            console.error("Fatal Error: Application core not found. Check planner.js loading and syntax.");
            // Display a user-friendly error message
            const mainArea = document.getElementById('main-content-area');
            if (mainArea) {
                mainArea.innerHTML = `<div class="card" style="text-align: center; padding: 50px; margin: 24px;">
                    <h1>Initialization Failed</h1>
                    <p>The core application files could not be loaded or are corrupted.</p>
                    <p>Please check the console for errors and ensure all files are deployed correctly.</p>
                </div>`;
            }
        }
    }

    // Function to handle successful authentication
    function authenticateUser() {
        // Set session storage to remember the login state
        sessionStorage.setItem(AUTH_CONFIG.SESSION_KEY, "true");

        const overlay = document.getElementById('auth-overlay');
        if (overlay) {
            // Trigger the fade-out animation
            overlay.classList.add('hidden');
        }
        
        // Add the authenticated class to the body to reveal the app content (handled by CSS)
        document.body.classList.add('authenticated');

        // Initialize the application
        initializeCoreApplication();
    }

    // Function to handle the login form submission
    function handleLoginSubmit(event) {
        event.preventDefault();
        const passwordInput = document.getElementById('passwordInput');
        const errorMessage = document.getElementById('authErrorMessage');
        
        if (passwordInput && passwordInput.value === AUTH_CONFIG.REQUIRED_PASSWORD) {
            authenticateUser();
        } else {
            if (errorMessage) {
                errorMessage.style.display = 'block';
            }
            if (passwordInput) {
                passwordInput.value = '';
                passwordInput.focus();
            }
        }
    }

    // Bootloader logic
    document.addEventListener('DOMContentLoaded', () => {
        const isAuthenticated = sessionStorage.getItem(AUTH_CONFIG.SESSION_KEY) === "true";
        
        if (isAuthenticated) {
            authenticateUser();
        } else {
            // Show the overlay if not authenticated
            const overlay = document.getElementById('auth-overlay');
            if (overlay) {
                overlay.style.display = 'flex';
            }
            
            // Wire up the form
            const authForm = document.getElementById('auth-form');
            if (authForm) {
                authForm.addEventListener('submit', handleLoginSubmit);
            } else {
                console.error("Authentication form not found. Bypassing login.");
                authenticateUser();
            }
        }
    });
})();
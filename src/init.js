/**
 * WFM Intelligence Platform - Initialization (v15.8)
 * Bootloader script - Modified to include authentication layer.
 */

(function() {
    // Configuration for the authentication
    const AUTH_CONFIG = {
        // NOTE: This is a client-side password for demonstration purposes ONLY.
        // In a production environment, this MUST be replaced with secure backend authentication.
        
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
    async function handleLoginSubmit(event) {
        event.preventDefault();
        
        // 1. Get new email and password inputs
        const emailInput = document.getElementById('emailInput');
        const passwordInput = document.getElementById('passwordInput');
        
        // CHANGE 1: Get 'authNotice' instead of 'authErrorMessage'
        const authNotice = document.getElementById('authNotice');

        if (!emailInput || !passwordInput || !emailInput.value || !passwordInput.value) {
            // CHANGE 2: Update 'authNotice'
            if (authNotice) {
                authNotice.textContent = "Email and password are required.";
                // We also set the class to make it look like the advisor portal error
                authNotice.className = 'auth-notice error';
authNotice.style.display = 'block';
            }
            return;
}

        // 2. Create a temporary Supabase client just for login
        //    (These values are from your planner.js file)
        const SUPABASE_URL = "https://oypdnjxhjpgpwmkltzmk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95cGRuanhoanBncHdta2x0em1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4Nzk0MTEsImV4cCI6MjA3NTQ1NTQxMX0.Hqf1L4RHpIPUD4ut2uVsiGDsqKXvAjdwKuotmme4_Is";
        const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        try {
            // 3. Attempt to sign in
            const { data, error } = await supabase.auth.signInWithPassword({
                email: emailInput.value,
                password: passwordInput.value,
            });
if (error) {
                throw error;
// Jump to the catch block
            }

            // 4. Success!
            // CHANGE 3: Hide 'authNotice'
if (authNotice) authNotice.style.display = 'none';
            authenticateUser();

        } catch (error) {
            // 5. Failure
            // CHANGE 4: Show error in 'authNotice'
            if (authNotice) {
                authNotice.textContent = "Invalid email or password.";
                authNotice.className = 'auth-notice error';
authNotice.style.display = 'block';
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
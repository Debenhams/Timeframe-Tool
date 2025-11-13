/**
 * WFM Intelligence Platform - Initialization (v16.11)
 * Bootloader script - Handles Authentication and Core Startup.
 */

(function() {
    // Configuration for authentication
    const AUTH_CONFIG = {
        SESSION_KEY: "wfm_session_authenticated"
    };

    // 1. Initialize the Core Application
    function initializeCoreApplication() {
        if (window.APP && window.APP.Core) {
            // Start the application logic
            window.APP.Core.initialize();
        } else {
            console.error("Fatal Error: Application core not found. Check planner.js loading.");
            // User feedback for fatal error
            const mainArea = document.getElementById('main-content-area');
            if (mainArea) {
                mainArea.innerHTML = `
                    <div class="card" style="text-align: center; padding: 50px; margin: 24px;">
                        <h1 style="color: #EF4444;">Initialization Failed</h1>
                        <p>The core application files could not be loaded.</p>
                        <p>Please check the console for errors.</p>
                    </div>`;
            }
        }
    }

    // 2. Handle Successful Login
    function authenticateUser() {
        // Remember login state
        sessionStorage.setItem(AUTH_CONFIG.SESSION_KEY, "true");

        // Hide Overlay
        const overlay = document.getElementById('auth-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
            // Wait for animation to finish before setting display:none
            setTimeout(() => {
                overlay.style.display = 'none';
            }, 500);
        }
        
        // Add class to body to reveal the sidebar and content (handled by CSS)
        document.body.classList.add('authenticated');

        // Boot the app
        initializeCoreApplication();
    }

    // 3. Handle Form Submission (Login)
    async function handleLoginSubmit(event) {
        event.preventDefault();

        const emailInput = document.getElementById('emailInput');
        const passwordInput = document.getElementById('passwordInput');
        const errorMessage = document.getElementById('authErrorMessage');

        // Basic validation
        if (!emailInput || !passwordInput || !emailInput.value || !passwordInput.value) {
            if (errorMessage) {
                errorMessage.textContent = "Email and password are required.";
                errorMessage.style.display = 'block';
            }
            return;
        }

        // Create a temporary Supabase client just for auth
        // (Credentials match your planner.js config)
        const SUPABASE_URL = "https://oypdnjxhjpgpwmkltzmk.supabase.co";
        const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95cGRuanhoanBncHdta2x0em1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4Nzk0MTEsImV4cCI6MjA3NTQ1NTQxMX0.Hqf1L4RHpIPUD4ut2uVsiGDsqKXvAjdwKuotmme4_Is";
        
        if (typeof window.supabase === 'undefined') {
            console.error("Supabase library not loaded.");
            return;
        }

        const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        try {
            // Attempt Sign In
            const { data, error } = await supabase.auth.signInWithPassword({
                email: emailInput.value,
                password: passwordInput.value,
            });

            if (error) throw error;

            // Success
            if (errorMessage) errorMessage.style.display = 'none';
            authenticateUser();

        } catch (error) {
            console.error("Login Error:", error.message);
            if (errorMessage) {
                errorMessage.textContent = "Invalid email or password.";
                errorMessage.style.display = 'block';
            }
            if (passwordInput) {
                passwordInput.value = '';
                passwordInput.focus();
            }
        }
    }

    // 4. Bootloader (Run on Page Load)
    document.addEventListener('DOMContentLoaded', () => {
        const isAuthenticated = sessionStorage.getItem(AUTH_CONFIG.SESSION_KEY) === "true";
        
        if (isAuthenticated) {
            // User is already logged in, skip screen
            authenticateUser();
        } else {
            // Show Login Screen
            const overlay = document.getElementById('auth-overlay');
            if (overlay) {
                overlay.style.display = 'flex'; // CSS handles the flex layout
            }
            
            // Wire up the form
            const authForm = document.getElementById('auth-form');
            if (authForm) {
                authForm.addEventListener('submit', handleLoginSubmit);
            } else {
                console.warn("Authentication form not found. Bypassing login for dev.");
                authenticateUser();
            }
        }
    });
})();
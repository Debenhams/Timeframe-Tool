/**
 * WFM Intelligence Platform - Initialization (v15.8.4 - Fixed)
 * Bootloader script - Manages Supabase authentication, including password reset flow.
 * FIX: Corrected syntax errors in handlePasswordUpdate (pushState and catch block).
 */

(function() {
    // Configuration for the authentication
    const AUTH_CONFIG = {
        // Supabase Config (required as init.js now handles auth)
        SUPABASE_URL: "https://oypdnjxhjpgpwmkltzmk.supabase.co",
        SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95cGRuanhoanBncHdta2x0em1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4Nzk0MTEsImV4cCI6MjA3NTQ1NTQxMX0.Hqf1L4RHpIPUD4ut2uVsiGDsqKXvAjdwKuotmme4_Is"
    };

    let supabase = null;
    const ELS = {}; // DOM Cache for Auth UI

    // Initialize Supabase client
    function initializeSupabase() {
        if (window.supabase && window.supabase.createClient) {
            supabase = window.supabase.createClient(AUTH_CONFIG.SUPABASE_URL, AUTH_CONFIG.SUPABASE_ANON_KEY);
        } else {
            console.error("Supabase library not loaded.");
        }
    }

    // Cache DOM elements used in the auth flow
    function cacheAuthElements() {
        ELS.authOverlay = document.getElementById('auth-overlay');
        ELS.authForm = document.getElementById('auth-form');
        ELS.forgotPasswordForm = document.getElementById('forgot-password-form');
        ELS.updatePasswordForm = document.getElementById('update-password-form');
        ELS.signInView = document.getElementById('signInView');
        ELS.forgotPasswordView = document.getElementById('forgotPasswordView');
        ELS.updatePasswordView = document.getElementById('updatePasswordView');
        ELS.emailInput = document.getElementById('emailInput');
        ELS.passwordInput = document.getElementById('passwordInput');
        ELS.resetEmailInput = document.getElementById('resetEmailInput');
        ELS.newPasswordInput = document.getElementById('newPasswordInput');
        ELS.authNotice = document.getElementById('authNotice'); // Generalized notice
        ELS.forgotPasswordLink = document.getElementById('forgotPasswordLink');
        ELS.backToSignInLink = document.getElementById('backToSignInLink');
    }

    // Function to initialize the core application (the original init logic)
    function initializeCoreApplication() {
        if (window.APP && window.APP.Core) {
            // Start the application
            window.APP.Core.initialize();
        } else {
            console.error("Fatal Error: Application core not found. Check planner.js loading.");
            const mainArea = document.getElementById('main-content-area');
            if (mainArea) {
                mainArea.innerHTML = `<div class="card" style="text-align: center; padding: 50px; margin: 24px;">
                    <h1>Initialization Failed</h1>
                    <p>Please check the console for errors and ensure all files are deployed correctly.</p>
                </div>`;
            }
        }
    }

    // Function to handle successful authentication
    function authenticateUser() {
        // Hide the overlay
        if (ELS.authOverlay) {
            ELS.authOverlay.style.display = 'none';
        }
        
        // Initialize the core application logic
        initializeCoreApplication();
    }

    // Function to show the authentication overlay
    function showAuthentication() {
        if (ELS.authOverlay) {
            // Ensure the overlay is visible
            ELS.authOverlay.style.display = 'flex';
        }
        // Determine which view to show (signin, update)
        const hash = window.location.hash;
        if (hash && hash.includes("type=recovery")) {
            toggleAuthView('update');
        } else {
            toggleAuthView('signin');
        }
        setupAuthListeners();
    }

    // Toggle Auth Views
    function toggleAuthView(view) {
        if (ELS.authNotice) ELS.authNotice.style.display = 'none';
        if (ELS.signInView) ELS.signInView.style.display = 'none';
        if (ELS.forgotPasswordView) ELS.forgotPasswordView.style.display = 'none';
        if (ELS.updatePasswordView) ELS.updatePasswordView.style.display = 'none';

        if (view === 'forgot') {
            if (ELS.forgotPasswordView) ELS.forgotPasswordView.style.display = 'block';
            if (ELS.resetEmailInput) ELS.resetEmailInput.focus();
        } else if (view === 'update') {
            if (ELS.updatePasswordView) ELS.updatePasswordView.style.display = 'block';
            if (ELS.newPasswordInput) ELS.newPasswordInput.focus();
        } else { // 'signin'
            if (ELS.signInView) ELS.signInView.style.display = 'block';
            if (ELS.emailInput) ELS.emailInput.focus();
        }
    }

    // Setup event listeners for the auth forms
    function setupAuthListeners() {
        // Prevent multiple listeners
        if (ELS.authForm) ELS.authForm.removeEventListener('submit', handleLogin);
        if (ELS.forgotPasswordForm) ELS.forgotPasswordForm.removeEventListener('submit', handlePasswordResetRequest);
        if (ELS.updatePasswordForm) ELS.updatePasswordForm.removeEventListener('submit', handlePasswordUpdate);
        if (ELS.forgotPasswordLink) ELS.forgotPasswordLink.removeEventListener('click', handleForgotLink);
        if (ELS.backToSignInLink) ELS.backToSignInLink.removeEventListener('click', handleBackToSignInLink);

        // Add listeners
        if (ELS.authForm) ELS.authForm.addEventListener('submit', handleLogin);
        if (ELS.forgotPasswordForm) ELS.forgotPasswordForm.addEventListener('submit', handlePasswordResetRequest);
        if (ELS.updatePasswordForm) ELS.updatePasswordForm.addEventListener('submit', handlePasswordUpdate);
        
        if (ELS.forgotPasswordLink) {
            ELS.forgotPasswordLink.addEventListener('click', handleForgotLink);
        }
        if (ELS.backToSignInLink) {
            ELS.backToSignInLink.addEventListener('click', handleBackToSignInLink);
        }
    }
    
    // Link handlers
    function handleForgotLink(e) {
        e.preventDefault();
        toggleAuthView('forgot');
    }
    
    function handleBackToSignInLink(e) {
        e.preventDefault();
        toggleAuthView('signin');
    }

    // Helper to display auth messages
    function showAuthMessage(message, type = 'error') {
        if (ELS.authNotice) {
            ELS.authNotice.textContent = message;
            ELS.authNotice.className = `auth-notice ${type === 'success' ? 'success-message' : 'error-message'}`;
            ELS.authNotice.style.display = 'block';
        }
    }

    // Function to handle the login submission
    async function handleLogin(event) {
        event.preventDefault();
        const email = ELS.emailInput ? ELS.emailInput.value.trim() : '';
        const password = ELS.passwordInput ? ELS.passwordInput.value : '';

        if (!email || !password) {
            showAuthMessage("Please enter both email and password.");
            return;
        }

        const submitButton = ELS.authForm.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;

        try {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            
            // On successful login, clear any URL hash
            if (window.location.hash) {
                history.pushState("", document.title, window.location.pathname + window.location.search);
            }
            authenticateUser();
            
        } catch (error) {
            let errorMessage = error.message.includes("Invalid login credentials") ? "Invalid email or password." : error.message;
            showAuthMessage(errorMessage);
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    }

    // Function to handle the password reset request (Initiation)
    async function handlePasswordResetRequest(event) {
        event.preventDefault();
        const email = ELS.resetEmailInput ? ELS.resetEmailInput.value.trim() : '';

        if (!email) {
            showAuthMessage("Please enter your email address.");
            return;
        }

        const submitButton = ELS.forgotPasswordForm.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;

        try {
            // Get the base URL to send the user back to this page
            let redirectUrl = window.location.origin + window.location.pathname;

            const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });
            if (error) throw error;
            showAuthMessage("Password reset link sent. Please check your email.", "success");
            
        } catch (error) {
            showAuthMessage("Error: " + error.message);
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    }

    // Function to handle the password update (Completion)
    async function handlePasswordUpdate(event) {
        event.preventDefault();
        const newPassword = ELS.newPasswordInput ? ELS.newPasswordInput.value : '';

        if (!newPassword || newPassword.length < 6) {
            showAuthMessage("Password must be at least 6 characters.");
            return;
        }

        const submitButton = ELS.updatePasswordForm.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;

        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;

            showAuthMessage("Password updated successfully. Logging in...", "success");
            
            // Clear the URL hash and authenticate
            setTimeout(() => {
                // *** FIX 1: Changed push-State to pushState ***
                history.pushState("", document.title, window.location.pathname + window.location.search);
                authenticateUser();
            }, 1500);

        // *** FIX 2: Removed underscore from catch block ***
        } catch (error) { 
            showAuthMessage("Error updating password: " + error.message);
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    }

    // Main initialization logic
    async function initialize() {
        initializeSupabase();
        cacheAuthElements();

        if (!supabase) {
            showAuthMessage("Failed to initialize authentication. Please refresh.");
            showAuthentication(); // Show auth screen but expect errors
            return;
        }

        // Check current session
        const { data: { session }, error } = await supabase.auth.getSession();

        // If there is a session and we are NOT in recovery mode, authenticate immediately.
        const hash = window.location.hash;
        const isRecovery = hash && hash.includes("type=recovery");

        if (session && !error && !isRecovery) {
            authenticateUser();
        } else {
            // No active session, or we are in recovery mode, show authentication screen
            showAuthentication();
        }
    }

    // Start the initialization process when the DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})();
/**
 * WFM Intelligence Platform - Initialization (v15.8.4)
 * Bootloader script - Manages Supabase authentication, including password reset flow.
 * FIX: Stabilized initialization sequence to prevent white screen errors.
 */

(function() {
    // Configuration for the authentication
    const AUTH_CONFIG = {
        SUPABASE_URL: "https://oypdnjxhjpgpwmkltzmk.supabase.co",
        SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95cGRuanhoanBncHdta2x0em1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4Nzk0MTEsImV4cCI6MjA3NTQ1NTQxMX0.Hqf1L4RHpIPUD4ut2uVsiGDsqKXvAjdwKuotmme4_Is"
    };

    let supabase = null;
    const ELS = {}; // DOM Cache for Auth UI

    // Initialize Supabase client
    function initializeSupabase() {
        if (window.supabase && window.supabase.createClient) {
            try {
                supabase = window.supabase.createClient(AUTH_CONFIG.SUPABASE_URL, AUTH_CONFIG.SUPABASE_ANON_KEY);
            } catch (e) {
                console.error("Supabase initialization failed:", e);
            }
        } else {
            console.error("Supabase library not loaded.");
        }
    }

    // Cache DOM elements used in the auth flow (Robustly)
    function cacheAuthElements() {
        const elementsToCache = [
            'auth-overlay', 'auth-form', 'forgot-password-form', 'update-password-form',
            'signInView', 'forgotPasswordView', 'updatePasswordView',
            'emailInput', 'passwordInput', 'resetEmailInput', 'newPasswordInput',
            'authNotice', 'forgotPasswordLink', 'backToSignInLink'
        ];
        
        elementsToCache.forEach(id => {
            // Convert ID to camelCase for the ELS object key
            const camelCaseId = id.replace(/-([a-z])/g, function (g) { return g[1].toUpperCase(); });
            ELS[camelCaseId] = document.getElementById(id);
        });
    }

    // Function to initialize the core application (the original init logic)
    function initializeCoreApplication() {
        if (window.APP && window.APP.Core) {
            // Start the application
            window.APP.Core.initialize();
        } else {
            console.error("Fatal Error: Application core (APP.Core) not found. Check planner.js loading.");
            const mainArea = document.getElementById('main-content-area');
            if (mainArea) {
                // Display error in the main area instead of a white screen
                mainArea.innerHTML = `<div class="card" style="text-align: center; padding: 50px; margin: 24px;">
                    <h1>Initialization Failed</h1>
                    <p>Application core missing. Please check the console for errors.</p>
                </div>`;
            }
        }
    }

    // Function to handle successful authentication
    function authenticateUser() {
        // Hide the overlay
        if (ELS.authOverlay) {
            ELS.authOverlay.classList.add('hidden');
            setTimeout(() => {
                ELS.authOverlay.style.display = 'none';
            }, 500); // Match CSS transition time
        }
        
        // Reveal the main app layout
        document.body.classList.add('authenticated');

        // Initialize the core application logic
        initializeCoreApplication();
    }

    // Function to show the authentication overlay
    function showAuthentication() {
        if (ELS.authOverlay) {
            ELS.authOverlay.style.display = 'flex';
        } else {
            console.error("Auth overlay element missing.");
            return; // Cannot proceed with auth flow if overlay is missing
        }
        
        // Determine which view to show
        const hash = window.location.hash;
        if (hash && hash.includes("type=recovery")) {
            toggleAuthView('update');
        } else {
            toggleAuthView('signin');
        }
        setupAuthListeners();
    }

    // Toggle Auth Views (Robustly)
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
        } else {
            if (ELS.signInView) ELS.signInView.style.display = 'block';
            if (ELS.emailInput) ELS.emailInput.focus();
        }
    }

    // Setup event listeners for the auth forms (Robustly)
    function setupAuthListeners() {
        if (ELS.authForm) ELS.authForm.addEventListener('submit', handleLogin);
        if (ELS.forgotPasswordForm) ELS.forgotPasswordForm.addEventListener('submit', handlePasswordResetRequest);
        if (ELS.updatePasswordForm) ELS.updatePasswordForm.addEventListener('submit', handlePasswordUpdate);
        
        if (ELS.forgotPasswordLink) {
            ELS.forgotPasswordLink.addEventListener('click', (e) => {
                e.preventDefault();
                toggleAuthView('forgot');
            });
        }
        if (ELS.backToSignInLink) {
            ELS.backToSignInLink.addEventListener('click', (e) => {
                e.preventDefault();
                toggleAuthView('signin');
            });
        }
    }

    // Helper to display auth messages
    function showAuthMessage(message, type = 'error') {
        if (ELS.authNotice) {
            ELS.authNotice.textContent = message;
            ELS.authNotice.className = `auth-notice ${type}`;
            // Ensure compatibility with older CSS if 'error-message' class exists
            if (type === 'error') {
                ELS.authNotice.classList.add('error-message');
            }
            ELS.authNotice.style.display = 'block';
        }
    }

    // Function to handle the login submission
    async function handleLogin(event) {
        event.preventDefault();
        if (!supabase) {
            showAuthMessage("Database connection not initialized.");
            return;
        }

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
            // On successful login, ensure URL hash is cleared if present before authenticating
            if (window.location.hash) {
                window.location.href = window.location.pathname;
            } else {
                authenticateUser();
            }
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
        if (!supabase) return;

        const email = ELS.resetEmailInput ? ELS.resetEmailInput.value.trim() : '';

        if (!email) {
            showAuthMessage("Please enter your email address.");
            return;
        }

        const submitButton = ELS.forgotPasswordForm.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;

        try {
            let redirectUrl = undefined;
            if (location.origin && location.origin !== "null" && location.protocol !== 'file:') {
                redirectUrl = location.origin + location.pathname;
            }

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
        if (!supabase) return;

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

            showAuthMessage("Password updated successfully. Initializing...", "success");
            // Reload to clear the hash and start the app fresh
            setTimeout(() => location.href = location.pathname, 1000);

        } catch (error) {
            showAuthMessage("Error updating password: " + error.message);
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    }

    // Main initialization logic
    async function initialize() {
        try {
            initializeSupabase();
            cacheAuthElements();

            if (!supabase) {
                showAuthentication();
                showAuthMessage("Initialization failed: Database connection error.");
                return;
            }

            // Check current session
            const { data: { session }, error } = await supabase.auth.getSession();

            // Determine if we are in recovery mode
            const hash = window.location.hash;
            const isRecovery = hash && hash.includes("type=recovery");

            if (session && !error && !isRecovery) {
                authenticateUser();
            } else {
                // No active session, or we are in recovery mode, show authentication screen
                showAuthentication();
            }
        } catch (e) {
            // Catch any unexpected errors during initialization
            console.error("Critical Initialization Error:", e);
            showAuthentication();
            showAuthMessage("Application failed to start. Check console for details.");
        }
    }

    // Start the initialization process when the DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})();
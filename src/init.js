/**
 * WFM Intelligence Platform - Initialization & Auth (v15.8.1)
 * Bootloader script with session-based password protection.
 */

(function() {
    // --- START CONFIGURATION ---
    //
    // !!! SET YOUR TEMPORARY PASSWORD HERE !!!
    // This is the password everyone will use to access the site.
    //
    const SITE_PASSWORD = "WFMintel123!"; 
    //
    // --- END CONFIGURATION ---

    // This function runs once the HTML page is loaded
    document.addEventListener('DOMContentLoaded', () => {
        
        // Find all the necessary HTML elements
        const loginOverlay = document.getElementById('login-overlay');
        const loginButton = document.getElementById('loginButton');
        const passwordInput = document.getElementById('loginPassword');
        const loginError = document.getElementById('login-error-message');
        
        // Find the main app components
        const appSidebar = document.querySelector('.app-sidebar');
        const appMainContent = document.querySelector('.app-main-content');
        
        // 1. DEFINE THE LOGIN CHECK
        // This function checks if the user is already logged in for this session
        function checkLogin() {
            if (sessionStorage.getItem('isWfmLoggedIn') === 'true') {
                // User is logged in
                loginOverlay.classList.add('hidden'); // Hide the login modal
                
                // Show the main application
                appSidebar.style.display = 'flex';
                appMainContent.style.display = 'flex';
                
                // --- THIS IS YOUR OLD init.js CODE ---
                // Now that the user is authenticated, initialize the app
                if (window.APP && window.APP.Core) {
                    window.APP.Core.initialize();
                } else {
                    console.error("Fatal Error: Application core not found. Check planner.js loading and syntax.");
                    document.body.innerHTML = "<h1>Fatal Error: Application core not found.</h1>";
                }
                // --- END OF OLD init.js CODE ---

            } else {
                // User is NOT logged in.
                // Make sure the login modal is visible and the app is hidden.
                loginOverlay.style.display = 'flex';
                appSidebar.style.display = 'none';
                appMainContent.style.display = 'none';
            }
        }

        // 2. DEFINE THE LOGIN ATTEMPT
        function attemptLogin() {
            const password = passwordInput.value;
            
            if (password === SITE_PASSWORD) {
                // Correct password!
                // 1. Set the "session" flag
                sessionStorage.setItem('isWfmLoggedIn', 'true');
                
                // 2. Hide the error message
                loginError.style.display = 'none';

                // 3. Run the checkLogin function again. This will now pass.
                checkLogin();

            } else {
                // Wrong password
                // 1. Show the error message
                loginError.style.display = 'block';
                // 2. Clear the input
                passwordInput.value = "";
                passwordInput.focus();
            }
        }

        // 3. ADD EVENT LISTENERS
        if (loginButton) {
            loginButton.addEventListener('click', attemptLogin);
        }
        
        // Also allow pressing "Enter" to log in
        if (passwordInput) {
            passwordInput.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') {
                    attemptLogin();
                }
            });
        }

        // 4. RUN THE INITIAL CHECK
        // When the page first loads, run this check.
        // It will either show the app (if logged in) or the modal (if not).
        checkLogin();

    });
})();
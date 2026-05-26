/**
 * Bloh Clerk authentication bootstrap for login and signup pages.
 */

const CLERK_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js';
const ROOT_ID = 'clerk-root';
const ERROR_ID = 'auth-error';

/**
 * Displays an authentication error message.
 * @param {string} message - Error text
 */
function showError(message) {
  const el = document.getElementById(ERROR_ID);
  if (el) {
    el.textContent = message;
  }
}

/**
 * Loads a script tag and resolves when ready.
 * @param {string} src - Script URL
 * @returns {Promise<void>}
 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Clerk'));
    document.head.appendChild(script);
  });
}

/**
 * Initializes Clerk SignIn or SignUp on the current page.
 * @returns {Promise<void>}
 */
async function initClerkAuth() {
  const mode = document.currentScript?.dataset.mode ?? 'sign-in';
  const params = new URLSearchParams(window.location.search);
  const errorCode = params.get('error');

  if (errorCode === 'auth_failed') {
    showError('Sign in failed. Please try again.');
  } else if (errorCode === 'auth_email') {
    showError('Your account needs a verified email address.');
  }

  try {
    const configRes = await fetch('/auth/config');
    if (!configRes.ok) {
      showError('Authentication is not configured.');
      return;
    }

    const config = await configRes.json();
    await loadScript(CLERK_SCRIPT_URL);
    await window.Clerk.load({ publishableKey: config.publishableKey });

    const root = document.getElementById(ROOT_ID);
    if (!root) {
      return;
    }

    const appearance = {
      variables: {
        colorPrimary: '#c96442',
        colorBackground: '#faf7f2',
        colorText: '#1a1512',
        borderRadius: '0px',
      },
    };

    const redirectOptions = {
      signInUrl: config.signInUrl,
      signUpUrl: config.signUpUrl,
      afterSignInUrl: config.afterAuthUrl,
      afterSignUpUrl: config.afterAuthUrl,
    };

    if (mode === 'sign-up') {
      window.Clerk.mountSignUp(root, { appearance, ...redirectOptions });
    } else {
      window.Clerk.mountSignIn(root, { appearance, ...redirectOptions });
    }
  } catch {
    showError('Authentication failed to load. Check Clerk configuration.');
  }
}

void initClerkAuth();

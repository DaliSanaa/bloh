/**
 * Bloh Clerk authentication bootstrap for login and signup pages.
 * Loads Clerk JS from the instance Frontend API with the publishable key
 * on the script tag, then mounts SignIn or SignUp.
 */

const ROOT_ID = 'clerk-root';
const ERROR_ID = 'auth-error';
const CLERK_JS_VERSION = '6';

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
 * Returns the page auth mode from the bootstrap script tag.
 * @returns {'sign-in' | 'sign-up'} Auth mode
 */
function getAuthMode() {
  const script = document.querySelector('script[data-mode]');
  const mode = script?.dataset.mode;
  return mode === 'sign-up' ? 'sign-up' : 'sign-in';
}

/**
 * Derives the Clerk Frontend API hostname from a publishable key.
 * @param {string} publishableKey - Clerk publishable key
 * @returns {string} Frontend API hostname
 */
function decodeClerkFrontendApi(publishableKey) {
  const segments = publishableKey.split('_');
  if (segments.length < 3) {
    throw new Error('Invalid Clerk publishable key format');
  }

  const encoded = segments.slice(2).join('_');
  let domain = atob(encoded);
  if (domain.endsWith('$')) {
    domain = domain.slice(0, -1);
  }

  return domain;
}

/**
 * Appends a script tag and resolves when it has loaded.
 * @param {string} src - Script URL
 * @param {Record<string, string>} attributes - Optional attributes
 * @returns {Promise<void>}
 */
function loadScript(src, attributes = {}) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.type = 'text/javascript';

    for (const [name, value] of Object.entries(attributes)) {
      script.setAttribute(name, value);
    }

    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

/**
 * Loads Clerk UI and clerk-js from the instance Frontend API CDN.
 * @param {string} publishableKey - Clerk publishable key
 * @param {string} frontendApi - Clerk Frontend API hostname
 * @returns {Promise<void>}
 */
async function loadClerkBundles(publishableKey, frontendApi) {
  const baseUrl = `https://${frontendApi}`;

  await loadScript(`${baseUrl}/npm/@clerk/ui@1/dist/ui.browser.js`);
  await loadScript(
    `${baseUrl}/npm/@clerk/clerk-js@${CLERK_JS_VERSION}/dist/clerk.browser.js`,
    { 'data-clerk-publishable-key': publishableKey },
  );
}

/**
 * Initializes Clerk SignIn or SignUp on the current page.
 * @returns {Promise<void>}
 */
async function initClerkAuth() {
  const mode = getAuthMode();
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
    const publishableKey = config.publishableKey;

    if (typeof publishableKey !== 'string' || publishableKey.length === 0) {
      showError('Authentication is not configured.');
      return;
    }

    const frontendApi = decodeClerkFrontendApi(publishableKey);
    await loadClerkBundles(publishableKey, frontendApi);

    await window.Clerk.load({
      ui: { ClerkUI: window.__internal_ClerkUICtor },
    });

    if (window.Clerk.isSignedIn) {
      window.location.href = config.afterAuthUrl;
      return;
    }

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

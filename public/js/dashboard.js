/**
 * Bloh dashboard — account usage, API keys, and billing.
 */

/** @type {{ plan: string } | null} */
let currentUser = null;

/**
 * Redirects to login if not authenticated.
 */
async function requireAuth() {
  const res = await fetch('/auth/me');
  if (!res.ok) {
    window.location.href = '/login';
    return null;
  }
  const body = await res.json();
  currentUser = body.user;
  document.getElementById('user-email').textContent = body.user.email;
  return body.user;
}

/**
 * Updates plan badge and action buttons.
 * @param {string} plan - User plan
 */
function updatePlanUi(plan) {
  const normalizedPlan = plan === 'business' ? 'max' : plan;
  const badge = document.getElementById('plan-badge');
  badge.textContent = normalizedPlan.toUpperCase();

  const proBtn = document.getElementById('upgrade-pro-btn');
  const maxBtn = document.getElementById('upgrade-max-btn');
  const portalBtn = document.getElementById('billing-portal-btn');

  proBtn.classList.add('hidden');
  maxBtn.classList.add('hidden');
  portalBtn.classList.add('hidden');

  if (normalizedPlan === 'free') {
    proBtn.classList.remove('hidden');
    maxBtn.classList.remove('hidden');
  } else if (normalizedPlan === 'pro') {
    maxBtn.classList.remove('hidden');
  } else if (normalizedPlan === 'max') {
    portalBtn.classList.remove('hidden');
  }
}

/**
 * Loads and renders usage data.
 */
async function loadUsage() {
  const res = await fetch('/account/usage');
  const data = await res.json();

  updatePlanUi(data.plan);
  document.getElementById('credit-balance').textContent =
    `${data.remaining} / ${data.limit} credits remaining`;
  document.getElementById('credit-detail').textContent =
    `${data.used} credits used this month`;

  const pct = data.limit > 0 ? Math.min(100, (data.used / data.limit) * 100) : 0;
  document.getElementById('progress-fill').style.width = `${pct}%`;

  renderChart(data.history ?? []);
  renderHistoryTable(data.history ?? []);
}

/**
 * Renders a CSS bar chart for usage history.
 * @param {Array<{ month: string; credits: number }>} history - Monthly usage
 */
function renderChart(history) {
  const chart = document.getElementById('usage-chart');
  if (!history.length) {
    chart.innerHTML = '<p class="credit-detail">No usage yet</p>';
    return;
  }

  const max = Math.max(...history.map((h) => h.credits), 1);
  chart.innerHTML = history.map((entry) => {
    const height = Math.round((entry.credits / max) * 100);
    return `<div class="chart-bar-wrap">
      <div class="chart-bar" style="height:${height}%"></div>
      <span class="chart-label">${entry.month.slice(5)}</span>
    </div>`;
  }).join('');
}

/**
 * Renders usage history table rows.
 * @param {Array<{ month: string; credits: number }>} history - Monthly usage
 */
function renderHistoryTable(history) {
  const tbody = document.getElementById('history-body');
  tbody.innerHTML = history.map((entry) =>
    `<tr><td>${entry.month}</td><td>${entry.credits}</td></tr>`,
  ).join('');
}

/**
 * Loads and renders API keys.
 */
async function loadKeys() {
  const res = await fetch('/account/keys');
  const data = await res.json();
  const tbody = document.getElementById('keys-body');

  tbody.innerHTML = data.keys.map((key) =>
    `<tr>
      <td><code>${key.keyPrefix}…</code></td>
      <td>${key.name}</td>
      <td>${key.isActive ? 'Active' : 'Revoked'}</td>
      <td>${key.createdAt.slice(0, 10)}</td>
      <td>${key.isActive ? `<button class="btn btn-sm revoke-btn" data-id="${key.id}">Revoke</button>` : ''}</td>
    </tr>`,
  ).join('');

  document.querySelectorAll('.revoke-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      await fetch(`/account/keys/${id}`, { method: 'DELETE' });
      await loadKeys();
    });
  });
}

/**
 * Starts Stripe checkout for a plan.
 * @param {string} plan - Target plan
 */
async function startUpgrade(plan) {
  const res = await fetch('/account/upgrade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan }),
  });
  const data = await res.json();
  if (data.checkoutUrl) {
    window.location.href = data.checkoutUrl;
  }
}

/**
 * Opens Stripe billing portal.
 */
async function openBillingPortal() {
  const res = await fetch('/account/billing-portal', { method: 'POST' });
  const data = await res.json();
  if (data.portalUrl) {
    window.location.href = data.portalUrl;
  }
}

/**
 * Loads the Clerk browser SDK.
 * @returns {Promise<void>}
 */
function loadClerkScript() {
  if (window.Clerk) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Clerk'));
    document.head.appendChild(script);
  });
}

/**
 * Shows the one-time API key after Clerk signup.
 */
async function showWelcomeKeyIfNeeded() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('welcome') !== '1') {
    return;
  }

  const res = await fetch('/auth/clerk/welcome-key');
  if (!res.ok) {
    return;
  }

  const body = await res.json();
  const reveal = document.getElementById('key-reveal');
  document.getElementById('revealed-key').textContent = body.apiKey;
  reveal.classList.remove('hidden');
  window.history.replaceState({}, '', '/dashboard');
}

/**
 * Signs out from Bloh and Clerk.
 */
async function signOut() {
  await fetch('/auth/logout', { method: 'POST' });

  try {
    const configRes = await fetch('/auth/config');
    const config = await configRes.json();
    await loadClerkScript();
    await window.Clerk.load({ publishableKey: config.publishableKey });
    await window.Clerk.signOut({ redirectUrl: `${window.location.origin}/login` });
  } catch {
    window.location.href = '/login';
  }
}

document.getElementById('logout-btn').addEventListener('click', () => {
  void signOut();
});

document.getElementById('upgrade-pro-btn').addEventListener('click', () => startUpgrade('pro'));
document.getElementById('upgrade-max-btn').addEventListener('click', () => startUpgrade('max'));
document.getElementById('billing-portal-btn').addEventListener('click', openBillingPortal);

document.getElementById('generate-key-btn').addEventListener('click', async () => {
  const res = await fetch('/account/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Default' }),
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error?.message ?? 'Failed to generate key');
    return;
  }
  const reveal = document.getElementById('key-reveal');
  document.getElementById('revealed-key').textContent = data.key;
  reveal.classList.remove('hidden');
  await loadKeys();
});

document.getElementById('copy-revealed-key').addEventListener('click', async () => {
  const key = document.getElementById('revealed-key').textContent;
  await navigator.clipboard.writeText(key);
});

requireAuth().then(async (user) => {
  if (!user) return;
  await showWelcomeKeyIfNeeded();
  await loadUsage();
  await loadKeys();
});

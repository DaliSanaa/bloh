/**
 * Updates navigation based on auth state.
 */
async function updateAuthNav() {
  const nav = document.getElementById('auth-nav');
  if (!nav) return;

  try {
    const res = await fetch('/auth/me');
    if (res.ok) {
      nav.innerHTML = '<a href="/dashboard">Dashboard</a>';
    } else {
      nav.innerHTML = '<a href="/login">Login</a><a href="/signup">Sign up</a>';
    }
  } catch {
    nav.innerHTML = '<a href="/login">Login</a><a href="/signup">Sign up</a>';
  }
}

updateAuthNav();

// Frontend client for user authentication and preferences sync.
// Communicates with /api/auth.

async function requestAuth(body, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch("/api/auth", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({ error: "Network or server error." }));
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export async function loginUserApi(username, password) {
  return requestAuth({ action: "login", username, password });
}

export async function registerUserApi(username, password, preferences = {}) {
  return requestAuth({ action: "register", username, password, preferences });
}

export async function getMeApi(token) {
  return requestAuth({ action: "me" }, token);
}

export async function savePreferencesApi(token, preferences) {
  return requestAuth({ action: "save-preferences", preferences }, token);
}

export async function logoutUserApi(token) {
  try {
    await requestAuth({ action: "logout" }, token);
  } catch {
    // Non-critical if offline or network fails
  }
  return { ok: true };
}

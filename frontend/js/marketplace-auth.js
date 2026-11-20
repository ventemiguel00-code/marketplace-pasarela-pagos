(function exposeMarketplaceAuth(root) {
  const SESSION_KEY = 'usc_payments_auth_session';
  const listeners = new Set();
  let configuration = null;
  let session = null;
  let status = 'checking';

  function emit(nextStatus) {
    status = nextStatus;
    for (const listener of listeners) listener(getState());
  }

  function decodePayload(token) {
    const parts = String(token ?? '').split('.');
    if (parts.length !== 3) throw new Error('TOKEN_INVALID');
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(root.atob(padded));
  }

  function audienceMatches(actual, expected) {
    return Array.isArray(actual) ? actual.includes(expected) : actual === expected;
  }

  function validateSession(candidate) {
    if (!candidate?.access_token || !candidate?.refresh_token) throw new Error('SESSION_INVALID');
    const claims = decodePayload(candidate.access_token);
    if (
      claims.iss !== configuration.issuer
      || !audienceMatches(claims.aud, configuration.audience)
      || typeof claims.sub !== 'string'
      || !claims.sub
      || !Number.isFinite(claims.exp)
      || claims.exp * 1000 <= Date.now()
    ) {
      throw new Error('SESSION_CLAIMS_INVALID');
    }
    return {
      accessToken: candidate.access_token,
      refreshToken: candidate.refresh_token,
      expiresAt: claims.exp * 1000,
      subject: claims.sub,
      email: candidate.user?.email ?? null,
      audience: claims.aud,
      issuer: claims.iss,
    };
  }

  function persist(nextSession) {
    session = nextSession;
    if (session) root.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else root.sessionStorage.removeItem(SESSION_KEY);
  }

  async function authRequest(path, body, accessToken = null) {
    const response = await root.fetch(`${configuration.url}/auth/v1/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: configuration.publishableKey,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error_description || payload.msg || 'AUTH_REQUEST_FAILED');
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async function refresh() {
    if (!session?.refreshToken) return null;
    try {
      const payload = await authRequest('token?grant_type=refresh_token', {
        refresh_token: session.refreshToken,
      });
      persist(validateSession(payload));
      emit('authenticated');
      return session.accessToken;
    } catch {
      persist(null);
      emit('expired');
      return null;
    }
  }

  async function initialize() {
    try {
      const response = await root.fetch('/api/public-config', { cache: 'no-store' });
      if (!response.ok) throw new Error('CONFIG_UNAVAILABLE');
      const payload = await response.json();
      configuration = payload.authentication;
      if (!configuration?.required) {
        emit('local');
        return getState();
      }
      if (!configuration.url || !configuration.publishableKey || !configuration.issuer || !configuration.audience) {
        throw new Error('CONFIG_INCOMPLETE');
      }
      const stored = root.sessionStorage.getItem(SESSION_KEY);
      if (!stored) {
        emit('anonymous');
        return getState();
      }
      session = JSON.parse(stored);
      if (session.expiresAt > Date.now() + 30000) emit('authenticated');
      else await refresh();
      return getState();
    } catch {
      persist(null);
      emit('unavailable');
      return getState();
    }
  }

  async function login(email, password) {
    if (!configuration?.required) throw new Error('AUTH_NOT_REQUIRED');
    emit('checking');
    try {
      const payload = await authRequest('token?grant_type=password', { email, password });
      persist(validateSession(payload));
      emit('authenticated');
      return getState();
    } catch (error) {
      persist(null);
      emit('anonymous');
      throw error;
    }
  }

  async function logout() {
    const token = session?.accessToken;
    persist(null);
    emit(configuration?.required ? 'anonymous' : 'local');
    if (token) await authRequest('logout', null, token).catch(() => {});
  }

  function invalidate() {
    persist(null);
    emit('expired');
  }

  async function getAccessToken() {
    if (!configuration?.required) return null;
    if (!session) return null;
    if (session.expiresAt <= Date.now() + 30000) return refresh();
    return session.accessToken;
  }

  function getState() {
    return {
      status,
      required: Boolean(configuration?.required),
      authenticated: status === 'authenticated',
      email: session?.email ?? null,
    };
  }

  function getPublicSessionInfo() {
    return session ? {
      issuer: session.issuer,
      audience: session.audience,
      expiresAt: session.expiresAt,
    } : null;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  root.MarketplaceAuth = {
    initialize,
    login,
    logout,
    invalidate,
    getAccessToken,
    getState,
    getPublicSessionInfo,
    subscribe,
  };
}(window));

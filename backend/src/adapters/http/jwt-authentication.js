let joseModule;

async function getJose() {
  joseModule ??= import('jose');
  return joseModule;
}

function unauthorized(res) {
  return res.status(401).json({ error: 'Token de autenticación no válido o vencido' });
}

function createJwtAuthentication({
  required = false,
  issuer,
  audience,
  jwksUrl,
  keySet = null,
  algorithms = ['ES256'],
} = {}) {
  if (!required) {
    return (req, res, next) => next();
  }

  if (!issuer || !audience || (!jwksUrl && !keySet)) {
    throw new Error('JWT requiere issuer, audience y JWKS configurados.');
  }
  if (!Array.isArray(algorithms) || algorithms.length === 0) {
    throw new Error('JWT requiere al menos un algoritmo permitido.');
  }

  let remoteKeySet;
  return async function authenticateBuyer(req, res, next) {
    const authorization = req.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return unauthorized(res);

    const token = authorization.slice('Bearer '.length).trim();
    if (!token) return unauthorized(res);

    try {
      const { createRemoteJWKSet, jwtVerify } = await getJose();
      remoteKeySet ??= keySet || createRemoteJWKSet(new URL(jwksUrl));
      const { payload } = await jwtVerify(token, remoteKeySet, {
        issuer,
        audience,
        algorithms,
      });
      if (typeof payload.sub !== 'string' || payload.sub.length === 0) return unauthorized(res);
      req.auth = { subject: payload.sub, roles: payload.role ? [payload.role] : [] };
      return next();
    } catch {
      return unauthorized(res);
    }
  };
}

module.exports = { createJwtAuthentication };

const nowInSeconds = () => Math.floor(Date.now() / 1000);

const decodeTokenPayload = (token) => {
  if (!token) return null;
  try {
    const parts = String(token).split('.');
    if (parts.length < 2) return null;
    return JSON.parse(atob(parts[1]));
  } catch (err) {
    return null;
  }
};

export const isPayloadExpired = (payload) => {
  const exp = Number(payload?.exp);
  if (!Number.isFinite(exp) || exp <= 0) return false;
  return exp <= nowInSeconds();
};

export const getTokenPayload = () => {
  const token = localStorage.getItem('token');
  if (!token) return null;

  const payload = decodeTokenPayload(token);
  if (!payload || isPayloadExpired(payload)) {
    localStorage.removeItem('token');
    return null;
  }
  return payload;
};

export const getValidToken = () => {
  const payload = getTokenPayload();
  if (!payload) return null;
  return localStorage.getItem('token');
};

export const hasValidSession = () => Boolean(getTokenPayload());

export const getUserRole = () => {
  const payload = getTokenPayload();
  return payload?.role || null;
};

export const getUserId = () => {
  const payload = getTokenPayload();
  return payload?.id || null;
};

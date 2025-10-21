const PROJECT_STATE_STORAGE_KEY = "inventory-app-project-state";
const PROJECT_VALUES_STORAGE_KEY = "inventory-app-project-values";
const PROJECT_STATE_COOKIE_PREFIX = "iap_state_chunk_";
const PROJECT_STATE_COOKIE_COUNT = "iap_state_chunk_count";
const PROJECT_STATE_COOKIE_TTL = 60 * 60 * 24 * 365 * 2; // dois anos

const getCookieValue = (name) => {
  if (typeof document === "undefined") return null;
  const pattern = new RegExp(`(?:^|; )${name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1")}=([^;]*)`);
  const match = document.cookie.match(pattern);
  return match ? decodeURIComponent(match[1]) : null;
};

const clearProjectStateCookies = () => {
  if (typeof document === "undefined") return;
  const countValue = getCookieValue(PROJECT_STATE_COOKIE_COUNT);
  const count = Number(countValue);
  if (Number.isFinite(count) && count > 0) {
    for (let i = 0; i < count; i += 1) {
      document.cookie = `${PROJECT_STATE_COOKIE_PREFIX}${i}=; path=/; max-age=0`;
    }
  }
  document.cookie = `${PROJECT_STATE_COOKIE_COUNT}=; path=/; max-age=0`;
};

const writeProjectStateCookie = (jsonPayload) => {
  if (typeof document === "undefined") return;
  try {
    const encoded = window.btoa(unescape(encodeURIComponent(jsonPayload)));
    const chunkSize = 3500;
    const totalChunks = Math.ceil(encoded.length / chunkSize);

    const previousCountValue = getCookieValue(PROJECT_STATE_COOKIE_COUNT);
    const previousCount = Number(previousCountValue);

    for (let i = 0; i < totalChunks; i += 1) {
      const chunk = encoded.slice(i * chunkSize, i * chunkSize + chunkSize);
      document.cookie = `${PROJECT_STATE_COOKIE_PREFIX}${i}=${chunk}; path=/; max-age=${PROJECT_STATE_COOKIE_TTL}`;
    }

    document.cookie = `${PROJECT_STATE_COOKIE_COUNT}=${totalChunks}; path=/; max-age=${PROJECT_STATE_COOKIE_TTL}`;

    if (Number.isFinite(previousCount) && previousCount > totalChunks) {
      for (let i = totalChunks; i < previousCount; i += 1) {
        document.cookie = `${PROJECT_STATE_COOKIE_PREFIX}${i}=; path=/; max-age=0`;
      }
    }
  } catch (err) {
    console.error("Erro ao gravar cookie de estado do projeto", err);
  }
};

const readProjectStateCookie = () => {
  if (typeof document === "undefined") return null;
  try {
    const countValue = getCookieValue(PROJECT_STATE_COOKIE_COUNT);
    const count = Number(countValue);
    if (!Number.isFinite(count) || count <= 0) return null;

    let encoded = "";
    for (let i = 0; i < count; i += 1) {
      const chunk = getCookieValue(`${PROJECT_STATE_COOKIE_PREFIX}${i}`);
      if (!chunk) return null;
      encoded += chunk;
    }

    if (!encoded) return null;
    const json = decodeURIComponent(escape(window.atob(encoded)));
    return json;
  } catch (err) {
    console.error("Erro ao ler cookie de estado do projeto", err);
    return null;
  }
};

export {
  PROJECT_STATE_STORAGE_KEY,
  PROJECT_VALUES_STORAGE_KEY,
  clearProjectStateCookies,
  writeProjectStateCookie,
  readProjectStateCookie,
};


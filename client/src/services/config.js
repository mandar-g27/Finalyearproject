// Shared configuration for the client app.
// The API base URL is derived from VITE_API_URL when set, otherwise it
// defaults to using the same host as the page on port 5000 (matching the
// Flask server in this project).

const resolveApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl;

  if (typeof window === "undefined") {
    return "http://localhost:5000";
  }

  const host = window.location.hostname;
  const scheme = window.location.protocol;

  // When running in a browser on the same machine, localhost works.
  // When running on another device (phone/tablet), use the same host that
  // is serving the web app so it can reach the backend on the same LAN.
  if (host === "localhost" || host === "127.0.0.1") {
    return "http://localhost:5000";
  }

  return `${scheme}//${host}:5000`;
};

export const API_BASE_URL = resolveApiBaseUrl();

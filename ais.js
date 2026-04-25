import WebSocket from "ws";

// On the prod box the upstream ais-server listens on 127.0.0.1:3105.
// For local dev, set AIS_SERVER_URL in .env (e.g. point it at an SSH tunnel
// to the production ais-server so a local API can read real AIS data).
const AIS_SERVER = process.env.AIS_SERVER_URL || "ws://127.0.0.1:3105/";
const TIMEOUT_MS = 3000;

export const getBoatAIS = (mmsi) => {
  return new Promise((resolve) => {
    const ws = new WebSocket(AIS_SERVER);
    const timer = setTimeout(() => {
      ws.close();
      resolve(null);
    }, TIMEOUT_MS);

    ws.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });

    ws.on("open", () => {
      ws.send(JSON.stringify({ getBoat: mmsi }));
    });

    ws.on("message", (msg) => {
      clearTimeout(timer);
      const m = JSON.parse(msg);
      ws.close();
      resolve(m.data || null);
    });
  });
};

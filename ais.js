import WebSocket from "ws";

const AIS_SERVER = "ws://127.0.0.1:3105/";
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

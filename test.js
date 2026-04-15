import { claimProcess } from "./claim.js";

const MMSI = 230666000;

try {
  claimProcess(MMSI, 123, (status) => {
    console.log("status", status);
  });
} catch (e) {
  console.error(e);
}

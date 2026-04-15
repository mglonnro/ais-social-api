import pkg from "pg";
const { Client } = pkg;
import fs from "fs";

const client = new Client({
  user: "postgres",
  host: "localhost",
  database: "aissocial",
  password: "Kikku2020",
  port: 5432,
});

await client.connect();

const ships = JSON.parse(fs.readFileSync("../ais-server/ais.json"));
console.log("ships", Object.keys(ships).length);

const rows = await client.query("SELECT * from boats WHERE name is null");
for (const r of rows.rows) {
  if (ships[r.mmsi]) {
    console.log("Found", r.mmsi, ships[r.mmsi].ShipName);
    await client.query("UPDATE boats SET name = $1 WHERE boat_id = $2", [
      ships[r.mmsi].ShipName,
      r.boat_id,
    ]);
  }
}

console.log(await client.query("SELECT count(*) FROM boats"));
await client.end();

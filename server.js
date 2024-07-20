import DB from "./db.js";
import fs from "fs";
import Hasher from "./hasher.js";
import bodyParser from "body-parser";
import cors from "cors";
import sanitize from "sanitize-filename";
import { exec, spawn } from "child_process";
import StateFile from "./statefile.js";
import Auth from "./auth.js";
import base64Img from "base64-img";
import path from "path";
import multer from "multer";
import GeoJSON from "geojson";
import { getIdFromToken } from "./auth/appleAuth.mjs";
import { googleGetIdFromToken } from "./auth/googleAuth.mjs";
import { createUser, getUniqueNickName } from "./users.js";
import { hasToken, getUserIdFromHeaders, makeToken } from "./auth/token.mjs";
import { v4 as uuidv4 } from "uuid";
import imageType, { minimumBytes } from "image-type";
import { uploadToStorage } from "./fb.mjs";
import { getSpotScore } from "./score.js";
import { claimProcess, STATUS_RUNNING, STATUS_CLAIMED } from "./claim.js";

const port = process.env.PORT;
const upload = multer({ dest: "useruploads/" });

import http from "http";
import express from "express";

/*
import WebSocket from "ws";
*/

const app = express();
const server = http.createServer(app);

const db = new DB();
db.connect();

const auth = new Auth(db);

app.use(cors());
app.use(
  bodyParser.urlencoded({
    limit: "20mb",
    extended: true,
    verify: (req, res, buf, encoding) => {
      console.log("bodyParser.urlencoded:", encoding, buf.toString());
    },
  }),
);

app.use(
  bodyParser.json({
    verify: (req, res, buf, encoding) => {
      console.log("bodyParser.json:", encoding);
    },
  }),
);
app.use(
  bodyParser.text({
    verify: (req, res, buf, encoding) => {
      console.log("bodyParser.text:", encoding);
    },
  }),
);

app.use(
  bodyParser.raw({
    limit: "20mb",
    verify: (req, res, buf, encoding) => {
      console.log("bodyParser.raw:", encoding);
    },
  }),
);

var dataclients = {};
var dataclients2 = {};
var paused = {};
var pingPaused = {};
var pings = {};
var state = {};
var state2 = {};
var state_ts = {}; // state with time stamp tagged data points
var aisstate = {};
var sources = {};

// Var to hold claim process data
var claims = {};

const ais_timeout = 5 * 60; // seconds

state = Object.assign({}, StateFile.readJSON("nmea.state"));
delete state.state;

state2 = Object.assign({}, StateFile.readJSON("nmea2.state"));
delete state2.state;

state_ts = Object.assign({}, StateFile.readJSON("nmea_ts.state"));
delete state_ts.state;

aisstate = Object.assign({}, StateFile.readJSON("ais.state"));
delete aisstate.state;

var dataservers = {};

/*
const wss = new WebSocket.Server({ clientTracking: false, noServer: true });

server.on("upgrade", function (request, socket, head) {
  console.log("Parsing session from request...", request.url);

  wss.handleUpgrade(request, socket, head, function (ws) {
    wss.emit("connection", ws, request);
  });
});

wss.on("connection", function (ws, request) {
  console.log("Connection from", request.url);
  let c = request.url.split("/");

  //  ws_client(ws, { params: { boatId: c[2] } });
  //  ws_client2(ws, { params: { boatId: c[2] } });
  //   ws_server(ws, { params: { boatId: c[2] } });
});
*/

setInterval(() => {
  /* Clean out >5 min old entries from state2 */

  //expireState(state2);

  StateFile.writeJSON("nmea.state", state);
  StateFile.writeJSON("nmea2.state", state2);
  StateFile.writeJSON("nmea_ts.state", state_ts);
  StateFile.writeJSON("ais.state", aisstate);

  for (let k in dataservers) {
    if (dataservers[k]) {
      if (dataservers[k].readyState === WebSocket.OPEN) {
        dataservers[k].ping("!");
      }
    }
  }
}, 5000);

async function ws_server(ws, req) {
  console.log("ws:/boatdata", req.params.boatId);
  var boatId = req.params.boatId;

  dataservers[boatId] = ws;

  ws.on("pong", function (msg) {
    setLastSeen();
  });

  ws.on("close", () => {
    console.log("close server", boatId);
    dataservers[boatId] = undefined;
  });
}

function ws_client(ws, req) {
  console.log("ws:/boatdataclient", req.params.boatId);

  if (!dataclients[boatId]) {
    dataclients[boatId] = [ws];
  } else {
    dataclients[boatId].push(ws);
  }

  ws.on("ping", (msg) => {
    ws.pong(msg);
  });

  ws.on("close", () => {
    console.log("ws dataclient close", boatId);
    for (let x = 0; x < dataclients[boatId].length; x++) {
      if (dataclients[boatId][x] == ws) {
        dataclients[boatId][x] = undefined;
      }
    }
  });

  /* Inbound messages from client */
  ws.on("message", (msg) => {
    console.log("ws dataclient msg:", msg);
  });
}

function setPause(boatId, clientNo, value) {
  if (!paused[boatId]) {
    paused[boatId] = [];
  }

  paused[boatId][clientNo] = value;

  console.log("seting pause", boatId, clientNo, value);
  console.log(paused);
}

function setPingPause(boatId, clientNo, value) {
  if (!pingPaused[boatId]) {
    pingPaused[boatId] = [];
  }

  pingPaused[boatId][clientNo] = value;
}

function setPing(boatId, clientNo) {
  if (!pings[boatId]) {
    pings[boatId] = [];
  }

  console.log("Got ping from", boatId, clientNo);
  pings[boatId][clientNo] = new Date();
  setPingPause(boatId, clientNo, false);
}

// Interval to pause data clients that haven't pinged.
setInterval(() => {
  let now = new Date();

  for (const boatId in pings) {
    for (let x = 0; x < pings[boatId].length; x++) {
      if (pings[boatId][x] && !pingPaused[boatId][x]) {
        if (now.getTime() - pings[boatId][x].getTime() >= 5000) {
          console.log("Setting ping pause for", boatId, x);
          setPingPause(boatId, x, true);
        }
      }
    }
  }
}, 5000);

const PROVIDER_APPLE = "apple",
  PROVIDER_GOOGLE = "google";

app.post("/auth", async (req, res) => {
  try {
    const { authType, data } = req.body;
    console.log("authType", authType, "data", data);

    let userId;

    /* Separate tracks for Apple and Google auth */
    if (true) {
      let providerUserId, dbUser;

      if (authType === PROVIDER_APPLE) {
        providerUserId = getIdFromToken(data.identityToken);
        console.log("Found valid appleUserId", providerUserId);
        dbUser = await db.getUserByAppleId(providerUserId);
      } else if (authType === PROVIDER_GOOGLE) {
        providerUserId = await googleGetIdFromToken(data.idToken);
        console.log("Found valid googleUserId", providerUserId);
        dbUser = await db.getUserByGoogleId(providerUserId);
      } else {
        res.status(401).end();
        return;
      }

      res.append("Content-Type", "application/json");

      /* We didn't find any, so let's create a new */
      if (!dbUser) {
        var newUser;

        if (authType === PROVIDER_APPLE) {
          newUser = await createUser({ appleId: providerUserId });
        } else {
          newUser = await createUser({ googleId: providerUserId });
        }

        console.log("newUser", newUser);
        const token = makeToken({ user_id: newUser.user_id });

        res.send(
          Object.assign({}, newUser, {
            token: token,
            isNewUser: true,
            score: 0,
          }),
        );
      } else {
        const score = await db.getUserScore(dbUser.user_id);
        const token = makeToken({ user_id: dbUser.user_id });
        res.send(Object.assign({}, dbUser, { score: score, token: token }));
      }

      res.status(200).end();
    }
  } catch (e) {
    console.error(e);
    res.status(401).end();
    return;
  }

  res.status(401).end();
});

app.delete("/users/:userId", async (req, res) => {
  const userId = getUserIdFromHeaders(req.headers);

  console.log("deleteuser", userId);

  if (!userId || userId !== parseInt(req.params.userId)) {
    res.status(401).end();
    return;
  }

  console.log("deleting");

  const ok = await db.deleteUser(userId);

  if (ok) {
    console.log("delete ok");
    res.append("Content-Type", "application/json");
    res.send({ deleted: true });
    res.status(200).end();
  } else {
    res.status(500).end();
  }
});

app.patch("/image-upload/:mmsi", async (req, res) => {
  const userId = getUserIdFromHeaders(req.headers);

  if (!userId) {
    res.status(401).end();
    return;
  }

  console.log("binary-upload", req.body.length);

  const type = await imageType(req.body);
  console.log("image type", type);

  const _fname = uuidv4();
  const fname = "./uploads/" + _fname;
  fs.writeFileSync(fname, req.body);

  // upload to storage
  const file = await uploadToStorage(req.params.mmsi, fname, _fname, type.mime);

  const boat = await db.getBoatByMMSI(req.params.mmsi);
  const STORAGE_BASE = "https://storage.googleapis.com/ais-social.appspot.com/";

  if (boat) {
    const result = await db.postBoatMedia(
      userId,
      boat.boat_id,
      STORAGE_BASE + file[0].metadata.name,
    );
    if (result) {
      res.send(result);
      res.status(200).end();
      return;
    }
  }

  res.status(500).end();
});

app.patch("/multipart-upload", upload.single("photo"), (req, res) => {
  console.log("multipart");
  console.log(req.body);
  res.end("OK");
});

app.get("/nick", async (req, res) => {
  // todo add auth
  const nickName = await getUniqueNickName();
  res.append("Content-Type", "application/json");
  res.send({ nickName: nickName });
  res.status(200).end();
});

let claimStatus = {},
  claimCancel = {},
  claimPosition = {};

app.get("/claims/:boatId/start", async (req, res) => {
  const userId = getUserIdFromHeaders(req.headers);
  const boat = await db.getBoatByMMSI(req.params.boatId);

  if (!userId) {
    // no claim process without user
    console.error("No claim process without user");
    res.status(401).end();
  } else {
    let uuid = uuidv4();
    claimStatus[uuid] = null;

    console.log("Starting claim process for", req.params.boatId, userId, uuid);

    claimProcess(parseInt(req.params.boatId), userId, (data) => {
      console.log("Callback!", data);

      /* If the claim process has been cancelled, then return null to stop it */
      if (claimCancel[uuid]) {
        return null;
      }

      /* If we have received info that the user is too far away */
      if (claimPosition[uuid] === false) {
        return null;
      }

      if (!claimStatus[uuid]) {
        claimStatus[uuid] = { status: STATUS_RUNNING };
      }

      claimStatus[uuid] = {
        ...claimStatus[uuid],
        [data.doneStage]: data,
        claimPosition: claimPosition[uuid],
      };
      if (data.status === STATUS_CLAIMED) {
        claimStatus[uuid].status = STATUS_CLAIMED;
      }

      return claimStatus[uuid];
    });

    res.send({ processId: uuid });
    res.status(200).end();
  }
});

app.put("/claims/process/:processId/location/:state", async (req, res) => {
  const userId = getUserIdFromHeaders(req.headers);
  const processId = req.params.processId;
  const state = parseInt(req.params.state);

  if (!userId) {
    res.status(401).end();
  } else {
    claimPosition[processId] = state === 1;
    console.log("claimPosition", processId, claimPosition[processId]);
  }
});

app.delete("/claims/:claimId", async (req, res) => {
  const userId = getUserIdFromHeaders(req.headers);
  const claimId = req.params.claimId;

  if (!userId) {
    res.status(401).end();
  } else {
    const ret = await db.deleteClaim(userId, claimId);
    if (ret) {
      res.send(ret);
    } else {
      res.status(401).end();
    }
  }
});

app.delete("/claims/process/:processId", async (req, res) => {
  const userId = getUserIdFromHeaders(req.headers);
  const processId = req.params.processId;

  if (!userId) {
    res.status(401).end();
    // we should also check for _correct_ userid */
  } else {
    claimCancel[processId] = true;
    claimStatus[processId].status = "canceled";
    res.status(200).end();
  }
});

app.get("/claims/process/:processId/status", async (req, res) => {
  const userId = getUserIdFromHeaders(req.headers);
  const processId = req.params.processId;

  if (claimStatus[processId]) {
    res.send(claimStatus[processId]);
  } else {
    res.send({ status: undefined });
  }
  res.status(200).end();
});

/* Messages */
app.post("/messages", async (req, res) => {
  const userId = getUserIdFromHeaders(req.headers);
  const data = req.body; // a message

  console.log("POST message", data);

  if (data.fromuserid !== userId) {
    res.status(401).end();
    return;
  }

  /* Figure out touserid */
  if (data.toboatid) {
    data.touserid = await db.getClaim(data.toboatid);
  }

  try {
    const ret = await db.insertMessage(userId, data);

    if (!ret) {
      res.status(500).end();
    } else {
      ret.server_id = ret.id;
      delete ret.id;

      res.send(ret);
      res.status(200).end();
    }
  } catch (e) {
    console.error(e);
    res.status(500).end();
  }
});

app.get("/users/:userId/messages", async (req, res) => {
  const userId = getUserIdFromHeaders(req.headers);
  let after;

  if (req.query.after) {
    after = new Date(req.query.after);
  }

  if (userId && userId === parseInt(req.params.userId)) {
    const msgs = await db.getUserMessages(userId, after);
    res.send(msgs);
  } else {
    res.status(401).end();
  }
});

app.get("/boats/:boatId", async (req, res) => {
  // if we have an userid, we'll return user specific extra info with the boat
  const userId = getUserIdFromHeaders(req.headers);
  const boat = await db.getBoatByMMSI(req.params.boatId);

  // set estimated score for new spot
  boat.spot_score = getSpotScore(boat.spot_count);

  if (userId) {
    const userRelation = await db.getUserBoatRelation(userId, boat.boat_id);
    if (userRelation) {
      boat.user = userRelation;
    }
  } else {
    if (hasToken(req.headers)) {
      boat.user = { expired: true };
    }
  }

  const boatMedia = await db.getBoatMedia(boat.boat_id);
  console.log("boatMedia", boatMedia);
  if (boatMedia) {
    boat.media = boatMedia;
  }

  console.log("returning boat", boat);

  res.append("Content-Type", "application/json");
  if (boat) {
    res.send(boat);
    res.status(200).end();
  } else {
    res.status(404).end();
  }
});

app.put("/boats/:boatId", async (req, res) => {
  let data = req.body;
  console.log("data", data);
  const result = await db.putBoat(data);

  res.append("Content-Type", "application/json");
  if (result.rows.length) {
    res.send(result.rows[0]);
    res.status(200).end();
  } else {
    res.status(500).end();
  }
});

const getHallOfFame = (userId) => {
  return db.getHallOfFame(userId);
};

app.get("/halloffame", async (req, res) => {
  const ret = await getHallOfFame();

  console.log("ret", ret);
  res.append("Content-Type", "application/json");
  res.send(ret);
});

app.get("/users/:userId/spotted", async (req, res) => {
  const userId = getUserIdFromHeaders(req.headers);

  console.log("spotted", userId, req.params.userId);

  if (!userId || userId !== parseInt(req.params.userId)) {
    res.status(401).end();
    return;
  }

  const result = await db.getUserSpotted(userId);

  res.append("Content-Type", "application/json");

  if (!result) {
    res.status(500).end();
  } else {
    res.send(result);
  }
});

app.post("/boats/:mmsi/media", async (req, res) => {
  const userId = getUserIdFromHeaders(req.headers);

  if (!userId) {
    res.status(401).end();
    return;
  }

  let data = req.body;
  console.log("data", data);

  res.append("Content-Type", "application/json");

  const boat = await db.getBoatByMMSI(req.params.mmsi);
  if (boat) {
    const result = await db.postBoatMedia(userId, boat.boat_id, data.uri);
    if (result) {
      res.send(result);
      res.status(200).end();
      return;
    }
  }

  res.status(500).end();
});

app.get("/users/me", async (req, res) => {
  const userId = getUserIdFromHeaders(req.headers);
  if (!userId) {
    res.status(401).end();
    return;
  }

  res.append("Content-Type", "application/json");
  const result = await db.getUser(userId);
  const score = await db.getUserScore(userId);
  const token = makeToken({ user_id: userId });

  if (result) {
    res.send(Object.assign({}, result, { score: score, token: token }));
    res.status(200).end();
  } else {
    res.status(404).end();
  }
});

app.get("/users/:userId", async (req, res) => {
  const result = await db.getUser(req.params.userId);
  const score = await db.getUserScore(req.params.userId);

  if (result) {
    res.send(Object.assign({}, result, { score: score }));
    res.status(200).end();
  } else {
    res.status(404).end();
  }
});

app.post("/users/:userId/score", async (req, res) => {
  // auth here
  let data = req.body;

  res.append("Content-Type", "application/json");
  const result = await db.postScore(data);

  if (result) {
    const spotted = await db.getUserSpotted(data.userId, data.boatId);
    res.send(Object.assign({}, result, { spotted: spotted }));
    res.status(200).end();
  } else {
    res.status(500).end();
  }
});

app.delete("/users/:userId/spot/:boatId", async (req, res) => {
  const userId = getUserIdFromHeaders(req.headers);
  console.log("userId:req.params.userId", userId, req.params.userId);
  if (userId !== parseInt(req.params.userId)) {
    res.status(401).end();
    return;
  }

  res.append("Content-Type", "application/json");

  const result = await db.undoSpot(req.params.userId, req.params.boatId);

  if (result) {
    res.send(result);
    res.status(200).end();
  } else {
    res.status(500).end();
  }
});

/*
app.post("/boats", async (req, res) => {
  let userid = await auth.getUserId(req.headers.authorization);
  let data = req.body;
  console.log("data", data);

  const id = await db.addBoat(userid, data);
  if (!id) {
    res.status(500).end();
    return;
  }

  const boatdata = await db.getBoat(id);
  res.append("Content-Type", "application/json");
  res.send(boatdata);
});
*/

/*
app.get("/boats/:boatId", async (req, res) => {
  console.log(new Date(), "GET boats/{boatId}");

  let access = await auth.getUserAccess(
    req.params.boatId,
    req.headers.authorization,
    req.query.api_key
  );

  console.log(
    "access",
    req.params.boatId,
    access,
    req.headers.authorization,
    req.query.api_key
  );

  if (!access.read) {
    res.status(401).end();
    return;
  }

  var data = await db.getBoat(req.params.boatId);

  // we're not returning this, KISS
  delete data.shortId;

  res.append("Content-Type", "application/json");
  res.send(data);

  console.log(new Date(), "END");
});
*/

/*
const UPLOADDIR = "uploads";
const BUCKET = "gs://charlotte-data";
const PUBLICBUCKET = "gs://charlotte-public";

app.put("/boats/:boatId/photo", async (req, res) => {
  console.log("PUT PHOTO", typeof req.body);
  let data = req.body;
  let fname = req.params.boatId + "_128";

  base64Img.img(data, UPLOADDIR, fname, (err, filepath) => {
    if (err != null) {
      console.error(err);
      res.status(500).end();
    } else {
      let filename =
        PUBLICBUCKET + "/" + req.params.boatId + "/" + path.basename(filepath);
      console.log("filename", filename, "filepath", filepath, "err", err);

      exec("gsutil cp " + filepath + " " + filename, (err, stdout, stderr) => {
        if (err) {
          console.error("Couldn't upload to Cloud Storage.");
          console.error(err);
          console.log(`stdout: ${stdout}`);
          console.log(`stderr: ${stderr}`);
          res.status(500).end();
        }
        console.log("Upload ok");

        db.setBoatPhoto(
          req.params.boatId,
          "https://storage.cloud.google.com/charlotte-public/" +
            req.params.boatId +
            "/" +
            path.basename(filepath)
        );
      });
    }
  });
});

app.get("/boat/:boatId/hash/:objectName", async (req, res) => {
  let filename = BUCKET + "/" + req.params.boatId + "/" + req.params.objectName;

  exec("gsutil stat " + filename, (err, stdout, stderr) => {
    if (err) {
      console.error(err);
      console.log(`stdeerr: ${stderr}`);
      res.status(500).end();
    } else {
      let arr = stdout.split("\n");
      for (let x = 0; x < arr.length; x++) {
        if (arr[x].indexOf("(md5)") != -1) {
          var hash = arr[x].substring(arr[x].indexOf(":") + 1);
          hash = hash.trim();
          //res.append("Content-Type", "application/json");
          //res.send(JSON.stringify({ hash: hash }));
          res.append("Content-Type", "text/plain");
          res.send(hash);
          return;
        }
      }
      res.status(500).end();
    }
  });
});

//
// Process a file uploaded to the cloud storage
//
app.get("/boats/:boatId/process/:fileId", async (req, res, next) => {
  try {
    var ret = await fileProcessor.processFile(
      req.params.boatId,
      req.params.fileId
    );
    res.status(ret.status).end();
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

app.get("/boats/:boatId/files/:fileId/status", async (req, res, next) => {
  let status = await db.getFileStatus(req.params.boatId, req.params.fileId);
  if (!status) {
    status = {};
  }

  res.append("Content-Type", "application/json");
  res.send(JSON.stringify(status));
});

app.post(
  "/boats/:boatId/upload",
  upload.array("files", 12),
  function (req, res, next) {
    console.log("In upload");
    // req.files is array of `photos` files
    //   // req.body will contain the text fields, if there were any
    console.dir(req.files);
  }
);
*/

app.get("/", async (req, res) => {
  res.append("Content-Type", "application/json");
  res.send(JSON.stringify({ hello: "World" }));
});

app.get("/ping", async (req, res) => {
  res.append("Content-Type", "text/plain");
  res.send("pong\n");
});

server.listen(port, () =>
  console.log(`AIS Social APIlistening on port ${port}!`),
);

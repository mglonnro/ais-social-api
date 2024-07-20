import WebSocket from "ws";
import DB from "./db.js";

const STAGES = {
  RECEIVE_AIS_1: 0,
  RECEIVE_AIS_2: 1,
  WAIT: 2,
  RECEIVE_SILENCE: 3,
  WAIT2: 4,
  RECEIVE_AIS_3: 5,
  FAIL: 99,
};

export const STATUS_OK = "ok";
export const STATUS_FAIL = "fail";
export const STATUS_CLAIMED = "claimed";
export const STATUS_RUNNING = "running";

export const claimProcess = (boatId, userId, cbStatus) => {
  let ws = new WebSocket("ws://127.0.0.1:3105/");
  let stage = STAGES.RECEIVE_AIS_1,
    timestamp;
  let t1;
  const WAIT1_TIME = 60 * 1000; // one minute
  const SILENCE_TIME = 10 * 60 * 1000; // ten minutes
  const WAIT2_TIME = WAIT1_TIME;

  let claimPosition; // this holds true = verified position ok, false = too far, undefned = don't know

  const status = (data) => {
    const ret = cbStatus(data);
    console.log("RET from status", ret);

    if (!ret) {
      ws.close();
    } else {
      claimPosition = ret.claimPosition;
    }

    return ret;
  };

  // Send off first status
  if (
    !status({
      nextStage: stage,
      nextInfo: "Waiting for AIS ping 1/2",
      time: new Date(),
    })
  )
    return;

  ws.on("error", console.error);
  ws.on("open", function open() {
    console.log("open");
    ws.send(JSON.stringify({ listenMMSI: boatId }));
  });

  ws.on("message", async (data) => {
    console.log(new Date().toISOString());
    console.log("received: %s", data);

    // get the actual data in JSON
    let _data = JSON.parse(data);
    let boatData = _data.data[Object.keys(_data.data)[0]];

    if (stage === STAGES.RECEIVE_AIS_1) {
      if (
        !status({
          doneStage: stage,
          nextStage: STAGES.RECEIVE_AIS_2,
          doneInfo: "Received AIS ping 1/2",
          nextInfo: "Waiting for AIS ping 2/2",
          time: new Date(),
          data: boatData,
          status: STATUS_OK,
        })
      )
        return;

      stage = STAGES.RECEIVE_AIS_2;
    } else if (stage === STAGES.RECEIVE_AIS_2) {
      if (
        !status({
          doneStage: stage,
          nextStage: STAGES.WAIT,
          doneInfo: "Received AIS ping 2/2",
          nextInfo: "Waiting for AIS off",
          waitTime: WAIT1_TIME / 1000,
          time: new Date(),
          data: boatData,
          status: STATUS_OK,
        })
      )
        return;

      stage = STAGES.WAIT;
      setTimeout(() => {
        if (
          !status({
            doneStage: stage,
            nextStage: STAGES.RECEIVE_SILENCE,
            doneInfo: "Wait is over OK",
            nextInfo: "Checking for AIS silence",
            waitTime: SILENCE_TIME / 1000,
            time: new Date(),
            status: STATUS_OK,
          })
        )
          return;

        stage = STAGES.RECEIVE_SILENCE;
        t1 = setTimeout(() => {
          if (
            !status({
              doneStage: stage,
              nextStage: STAGES.WAIT2,
              doneInfo: "AIS silence ok",
              nextInfo: "Waiting for AIS on",
              waitTime: WAIT1_TIME / 1000,
              time: new Date(),
              status: STATUS_OK,
            })
          )
            return;
          stage = STAGES.WAIT2;

          setTimeout(() => {
            if (
              !status({
                doneStage: stage,
                nextStage: STAGES.RECEIVE_AIS_3,
                doneInfo: "Wait is over OK",
                nextInfo: "Waiting for AIS ping 1/1",
                time: new Date(),
                data: boatData,
                status: STATUS_OK,
              })
            )
              return;
            stage = STAGES.RECEIVE_AIS_3;
          }, WAIT2_TIME);
        }, SILENCE_TIME);
      }, WAIT1_TIME);
    } else if (stage === STAGES.RECEIVE_SILENCE) {
      ws.close();

      if (
        !status({
          doneStage: stage,
          doneInfo: "Received AIS message during silence",
          status: STATUS_FAIL,
          time: new Date(),
        })
      )
        return;
    } else if (stage === STAGES.RECEIVE_AIS_3) {
      /* DO we have claim pos? */
      if (claimPosition !== true) {
        console.log("We don't have claimPosition???", claimPosition);
        return;
      }

      ws.close();

      // Insert claim into db
      const db = new DB();
      db.connect();

      let boat = await db.getBoatByMMSI(boatId);
      if (!boat) {
        return;
      }

      let res = await db.insertClaim(userId, boat.boat_id);
      if (res) {
        status({
          doneStage: stage,
          nextStage: STAGES.CLAIMED,
          doneInfo: "Received AIS ping 1/1",
          nextInfo: "Boat claimed!",
          status: STATUS_CLAIMED,
          time: new Date(),
          data: res.rows[0],
        });
      }
      // will return here
    }
  });
};

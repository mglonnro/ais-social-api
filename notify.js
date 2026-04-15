import { Expo } from "expo-server-sdk";

export class Notify {
  constructor() {
    this.expo = new Expo({
      accessToken: process.env.EXPO_ACCESS_TOKEN,
      useFcmV1: false,
    });
    this.tickets = [];

    this.interval = setInterval(() => {
      this.getReceipts();
    }, 10000);
  }

  sendMessage({ username }, { pushtoken }, message) {
    if (!Expo.isExpoPushToken(pushtoken)) {
      console.error(`Push token ${pushtoken} is not valid`);
      return;
    }

    let messages = [
      {
        to: pushtoken,
        title: message.fromboatid
          ? message.fromboatname || message.fromboatmmsi
          : username,
        sound: "default",
        body: message.message,
      },
    ];

    let chunks = this.expo.chunkPushNotifications(messages);
    (async () => {
      for (let chunk of chunks) {
        try {
          let ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
          console.log(ticketChunk);
          this.tickets.push(...ticketChunk);
        } catch (error) {
          console.error(error);
        }
      }
    })();
  }

  getReceipts() {
    let receiptIds = [];
    for (let ticket of this.tickets) {
      if (ticket.status === "ok" && ticket.rcpt !== "done") {
        receiptIds.push(ticket.id);
      }
    }

    if (!receiptIds.length) {
      return;
    }

    let receiptIdChunks = this.expo.chunkPushNotificationReceiptIds(receiptIds);
    (async () => {
      for (let chunk of receiptIdChunks) {
        try {
          let receipts =
            await this.expo.getPushNotificationReceiptsAsync(chunk);
          console.log(receipts);
          for (let receiptId in receipts) {
            let { status, message, details } = receipts[receiptId];

            // Update this rcpt to processed
            for (let x = 0; x < this.tickets.length; x++) {
              if (receiptId === this.tickets[x].id) {
                this.tickets[x].rcpt = "done";
              }
            }

            if (status === "ok") {
              continue;
            } else if (status === "error") {
              console.error(
                `There was an error sending a notification: ${message}`,
              );
              if (details && details.error) {
                console.error(`The error code is ${details.error}`);
              }
            }
          }
        } catch (error) {
          console.error(error);
        }
      }
    })();
  }
}

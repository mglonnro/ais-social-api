import admin from "firebase-admin";

var config = {
  apiKey: "AIzaSyD63qIab0G6AB5LEc0YIWAGH7zLYBCRbng",
  projectId: "ais-social",
  storageBucket: "ais-social.appspot.com",
  messagingSenderId: "1029131700997",
};

/* assume included in global html */

admin.initializeApp(config);

export default admin;

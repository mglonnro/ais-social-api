import admin from "firebase-admin";

var config = {
  apiKey: "AIzaSyDszSCTk4UQvjyBFl1RuHQ68Esr4KXy4kg",
  authDomain: "naked-sailor.firebaseapp.com",
  databaseURL: "https://naked-sailor.firebaseio.com",
  projectId: "naked-sailor",
  storageBucket: "naked-sailor.appspot.com",
  messagingSenderId: "1029131700997",
};

/* assume included in global html */

admin.initializeApp(config);

export default admin;

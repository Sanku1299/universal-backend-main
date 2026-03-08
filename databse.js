const mongoose = require("mongoose");

let isConnected = false;

async function connectDB() {

  if (isConnected) return;

  await mongoose.connect("mongodb+srv://logistics:universal123@shipment.uuywqxb.mongodb.net/?appName=shipment");

  isConnected = true;

}

module.exports = connectDB;
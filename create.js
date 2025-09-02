const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Assistant = require("./models/Assistant");
require("dotenv").config();

async function resetPassword() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ MongoDB connected");

  const email = "assistant1@gmail.com"; // assistant email
  const newPassword = "assistant123";   // desired new password

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  const assistant = await Assistant.findOneAndUpdate(
    { email },
    { password: hashedPassword },
    { new: true }
  );

  if (assistant) {
    console.log("✅ Password reset successful for", email);
  } else {
    console.log("❌ Assistant not found");
  }

  mongoose.connection.close();
}

resetPassword();

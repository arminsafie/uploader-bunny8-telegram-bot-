const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const multer = require("multer");
const uuid = require("uuid");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const sqlite3 = require("sqlite3").verbose();

// Telegram bot token
const token = "7287925433:AAHmU0kzBcL06IG-rTGEMY3pWxDtRqsctkY";

// Initialize the bot
const bot = new TelegramBot(token, { polling: true });

// Set up Express
const app = express();
const port = 5001;

// Initialize SQLite database
const db = new sqlite3.Database("./bot_users.db");

// Create users table if not exists
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT UNIQUE,
    first_name TEXT,
    last_name TEXT,
    username TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Password for accessing user list
const userListPassword = "armin"; // Change this to your actual password

// Storage setup for multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, `${uuid.v4()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage });

if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

const startKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: "Upload Video", callback_data: "upload_video" },
        { text: "Download Video", callback_data: "download_video" },
      ],
      [{ text: "Start", callback_data: "start" }],
    ],
  },
};

// Handle '/start' command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.chat.first_name;
  const lastName = msg.chat.last_name;
  const username = msg.chat.username;

  db.run(
    `INSERT OR IGNORE INTO users (chat_id, first_name, last_name, username) VALUES (?, ?, ?, ?)`,
    [chatId, firstName, lastName, username],
    (err) => {
      if (err) {
        console.error("Failed to insert user:", err);
      }
    }
  );

  bot.sendMessage(chatId, "Welcome! Choose an option:", startKeyboard);
});

// Handle new chat members
bot.on("new_chat_members", (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.chat.first_name;
  const lastName = msg.chat.last_name;
  const username = msg.chat.username;

  db.run(
    `INSERT OR IGNORE INTO users (chat_id, first_name, last_name, username) VALUES (?, ?, ?, ?)`,
    [chatId, firstName, lastName, username],
    (err) => {
      if (err) {
        console.error("Failed to insert user:", err);
      }
    }
  );

  bot.sendMessage(chatId, "Welcome! Choose an option:", startKeyboard);
});

// Handle callback queries
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const action = query.data;

  switch (action) {
    case "upload_video":
      bot.sendMessage(chatId, "Please upload a video.");
      break;

    case "download_video":
      bot.sendMessage(chatId, "Please send the video URL to download.");
      break;

    case "start":
      bot.sendMessage(chatId, "Starting process...");
      break;

    default:
      bot.sendMessage(chatId, "Unknown action.");
  }

  bot.answerCallbackQuery(query.id);
});

// Store chat states to manage password input
const chatStates = {};

// Handle '/users' command
bot.onText(/\/users/, (msg) => {
  const chatId = msg.chat.id;

  // Ask for password
  bot.sendMessage(chatId, "Enter the password to access the user list:");

  // Set the state of the chat to "awaiting_password"
  chatStates[chatId] = "awaiting_password";
});

// Handle messages to check password and display user list
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Check if we are awaiting a password in this chat
  if (chatStates[chatId] === "awaiting_password") {
    if (text === userListPassword) {
      // Correct password, retrieve and send user list
      db.all(`SELECT * FROM users`, [], (err, rows) => {
        if (err) {
          console.error("Failed to retrieve users:", err);
          bot.sendMessage(chatId, "Failed to retrieve users.");
          return;
        }

        const userList = rows
          .map((row) => `${row.first_name} ${row.last_name} (@${row.username})`)
          .join("\n");
        bot.sendMessage(chatId, `Registered users:\n${userList}`);
      });
    } else {
      // Incorrect password
      bot.sendMessage(chatId, "Incorrect password. Access denied.");
    }

    // Reset chat state
    chatStates[chatId] = null;
  }
});

// Handle video uploads
bot.on("video", async (msg) => {
  const chatId = msg.chat.id;
  const video = msg.video;

  try {
    const file = await bot.getFile(video.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const fileName = `${uuid.v4()}.mp4`;
    const filePath = path.join("uploads", fileName);

    const response = await axios({
      url: fileUrl,
      responseType: "stream",
    });

    response.data.pipe(fs.createWriteStream(filePath));

    response.data.on("end", () => {
      const videoUrl = `http://localhost:${port}/${fileName}`;
      bot.sendMessage(chatId, `Here is your video: ${videoUrl} `); //this part of the code
    });

    response.data.on("error", () => {
      bot.sendMessage(chatId, "Failed to save the video.");
    });
  } catch (err) {
    bot.sendMessage(chatId, "Failed to download the video.");
  }
});

// Handle messages that contain a video URL
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text && text.startsWith("http://localhost:5001/")) {
    const videoName = path.basename(text);
    const videoPath = path.join(__dirname, "uploads", videoName);

    if (fs.existsSync(videoPath)) {
      const loadingMessage = await bot.sendMessage(chatId, "Loading...");

      try {
        await bot.editMessageText("Uploading...", {
          chat_id: chatId,
          message_id: loadingMessage.message_id,
        });

        const sentVideoMessage = await bot.sendVideo(chatId, videoPath);

        await bot.sendMessage(
          chatId,
          "Upload complete! The video will be deleted in 30 seconds."
        );

        setTimeout(async () => {
          try {
            await bot.deleteMessage(chatId, sentVideoMessage.message_id);
            console.log(
              `Deleted video message with ID: ${sentVideoMessage.message_id}`
            );
          } catch (deleteError) {
            console.error("Failed to delete video message:", deleteError);
          }
        }, 30000);
      } catch (error) {
        await bot.editMessageText(
          "An error occurred while processing your request.",
          {
            chat_id: chatId,
            message_id: loadingMessage.message_id,
          }
        );
      }
    } else {
      bot.sendMessage(chatId, "Video not found.");
    }
  }
});

// Express route to serve the uploaded video
app.get("/:videoName", (req, res) => {
  const videoName = req.params.videoName;
  const videoPath = path.join(__dirname, "uploads", videoName);

  if (fs.existsSync(videoPath)) {
    res.sendFile(videoPath);
  } else {
    res.status(404).send("Video not found");
  }
});

// Start the Express server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Close database on exit
process.on("exit", () => {
  db.close();
});

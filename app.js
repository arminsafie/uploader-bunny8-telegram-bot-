const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const multer = require("multer");
const uuid = require("uuid");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

// Telegram bot token (replace 'YOUR_BOT_TOKEN' with your bot's token)
const token = "7287925433:AAHmU0kzBcL06IG-rTGEMY3pWxDtRqsctkY";

// Initialize the bot
const bot = new TelegramBot(token, { polling: true });

// Set up Express
const app = express();
const port = 5001; // Change to a different port if needed

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

// Ensure the uploads directory exists
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

// Inline Keyboard Markup
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
  bot.sendMessage(chatId, "Welcome! Choose an option:", startKeyboard);
});

// Handle new chat members
bot.on("new_chat_members", (msg) => {
  const chatId = msg.chat.id;
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

  // Optionally, acknowledge the callback query to remove the loading animation
  bot.answerCallbackQuery(query.id);
});

// Handle video uploads
bot.on("video", async (msg) => {
  const chatId = msg.chat.id;
  const video = msg.video;

  try {
    // Get the file information
    const file = await bot.getFile(video.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const fileName = `${uuid.v4()}.mp4`;
    const filePath = path.join("uploads", fileName);

    // Download the video file
    const response = await axios({
      url: fileUrl,
      responseType: "stream",
    });

    // Save the video file
    response.data.pipe(fs.createWriteStream(filePath));

    response.data.on("end", () => {
      const videoUrl = `http://localhost:${port}/${fileName}`;
      bot.sendMessage(chatId, `Here is your video: ${videoUrl}`);
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

  // Check if the message is a URL pointing to your server
  if (text && text.startsWith("http://localhost:5001/")) {
    const videoName = path.basename(text); // Extract the video name from the URL
    const videoPath = path.join(__dirname, "uploads", videoName);

    if (fs.existsSync(videoPath)) {
      // Send a loading message
      const loadingMessage = await bot.sendMessage(chatId, "Loading...");

      try {
        // Update the message to indicate uploading status
        await bot.editMessageText("Uploading...", {
          chat_id: chatId,
          message_id: loadingMessage.message_id,
        });

        // Send the video
        const sentVideoMessage = await bot.sendVideo(chatId, videoPath);

        // Notify the user that the video will be deleted in 30 seconds
        await bot.sendMessage(
          chatId,
          "Upload complete! The video will be deleted in 30 seconds."
        );

        // Schedule video message deletion after 30 seconds
        setTimeout(async () => {
          try {
            await bot.deleteMessage(chatId, sentVideoMessage.message_id);
            console.log(
              `Deleted video message with ID: ${sentVideoMessage.message_id}`
            );
          } catch (deleteError) {
            console.error("Failed to delete video message:", deleteError);
          }
        }, 30000); // 30,000 milliseconds = 30 seconds
      } catch (error) {
        // Handle any errors during the process
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

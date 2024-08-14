const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const multer = require("multer");
const uuid = require("uuid");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

// Telegram bot token
const token = "7287925433:AAHmU0kzBcL06IG-rTGEMY3pWxDtRqsctkY";

// Initialize the bot
const bot = new TelegramBot(token, { polling: true });

// Set up Express
const app = express();
const port = 5001; // Use environment variable or default

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

// List of channels
const channels = [
  { id: "@jaghiahs", name: "jaghiahs", link: "https://t.me/jaghiahs" },
  {
    id: "@sobhanbigham",
    name: "sobhanbigham",
    link: "https://t.me/sobhanbigham",
  },
  {
    id: "@arminkoskesh",
    name: "arminkoskesh",
    link: "https://t.me/arminkoskesh",
  },
];

// Function to check if a user is a member of all channels and return unjoined channels
async function getUnjoinedChannels(userId) {
  const unjoinedChannels = [];

  for (const channel of channels) {
    try {
      const member = await bot.getChatMember(channel.id, userId);
      if (!["member", "administrator", "creator"].includes(member.status)) {
        unjoinedChannels.push(channel);
      }
    } catch (err) {
      console.error(`Error checking membership in ${channel.name}:`, err);
      unjoinedChannels.push(channel); // Assume not a member if there's an error
    }
  }

  return unjoinedChannels;
}

// Handle '/start' command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const unjoinedChannels = await getUnjoinedChannels(userId);

  if (unjoinedChannels.length === 0) {
    // User is a member of all channels
    bot.sendMessage(chatId, "Welcome! Choose an option:", startKeyboard);
  } else {
    // User hasn't joined all channels, show them a list with inline buttons
    const channelKeyboard = {
      reply_markup: {
        inline_keyboard: unjoinedChannels
          .map((channel) => [
            { text: `Join ${channel.name}`, url: channel.link },
          ])
          .concat([
            [{ text: "Check Membership", callback_data: "check_membership" }],
          ]),
      },
    };

    bot.sendMessage(
      chatId,
      "You need to join all of the channels to use this bot. Please join the following channels:",
      channelKeyboard
    );
  }
});

// Handle callback queries
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const action = query.data;

  if (action === "check_membership") {
    const unjoinedChannels = await getUnjoinedChannels(userId);

    if (unjoinedChannels.length === 0) {
      bot.sendMessage(
        chatId,
        "Welcome! You have joined all channels. Choose an option:",
        startKeyboard
      );
    } else {
      const channelKeyboard = {
        reply_markup: {
          inline_keyboard: unjoinedChannels
            .map((channel) => [
              { text: `Join ${channel.name}`, url: channel.link },
            ])
            .concat([
              [{ text: "Check Membership", callback_data: "check_membership" }],
            ]),
        },
      };

      bot.sendMessage(
        chatId,
        "You need to join all of the channels to use this bot. Please join the following channels:",
        channelKeyboard
      );
    }
  }
});

// Handle video uploads
bot.on("video", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const unjoinedChannels = await getUnjoinedChannels(userId);

  if (unjoinedChannels.length === 0) {
    const video = msg.video;

    try {
      // Get the file information
      const file = await bot.getFile(video.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
      const fileName = `${uuid.v4()}.mp4`;
      const filePath = path.join("uploads", fileName);

      // Download the video file
      const response = await axios({ url: fileUrl, responseType: "stream" });

      // Save the video file
      const writeStream = fs.createWriteStream(filePath);
      response.data.pipe(writeStream);

      writeStream.on("finish", () => {
        const videoUrl = `\n\n\`\`\`\nhttp://localhost:${port}/${fileName}\n\`\`\``;
        const text = `Here is the text you can copy:\n\n\`\`\`\nThis is the text you can copy!\n\`\`\``;
        bot.sendMessage(chatId, videoUrl, {
          parse_mode: "MarkdownV2",
        });
      });

      writeStream.on("error", () => {
        bot.sendMessage(chatId, "Failed to save the video.");
      });
    } catch (err) {
      bot.sendMessage(chatId, "Failed to download the video.");
    }
  } else {
    const channelKeyboard = {
      reply_markup: {
        inline_keyboard: unjoinedChannels
          .map((channel) => [
            { text: `Join ${channel.name}`, url: channel.link },
          ])
          .concat([
            [{ text: "Check Membership", callback_data: "check_membership" }],
          ]),
      },
    };

    bot.sendMessage(
      chatId,
      "You need to join all of the channels to use this bot. Please join the following channels:",
      channelKeyboard
    );
  }
});

// Handle messages that contain a video URL
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  const unjoinedChannels = await getUnjoinedChannels(userId);

  if (unjoinedChannels.length === 0) {
    // Check if the message is a URL pointing to your server
    if (text && text.startsWith(`http://localhost:${port}`)) {
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
  } else {
    const channelKeyboard = {
      reply_markup: {
        inline_keyboard: unjoinedChannels
          .map((channel) => [
            { text: `Join ${channel.name}`, url: channel.link },
          ])
          .concat([
            [{ text: "Check Membership", callback_data: "check_membership" }],
          ]),
      },
    };

    bot.sendMessage(
      chatId,
      "You need to join all of the channels to use this bot. Please join the following channels:",
      channelKeyboard
    );
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

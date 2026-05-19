import { Telegraf } from "telegraf";
import { describeUrlSupport } from "@transcriber/core";

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.log("TELEGRAM_BOT_TOKEN is not set. Bot workspace is ready but not running.");
  process.exit(0);
}

const bot = new Telegraf(token);

bot.start((context) => context.reply("Send a direct audio/video URL and I will route it to the transcription pipeline."));
bot.on("text", (context) => {
  const text = context.message.text.trim();
  const support = describeUrlSupport(text);
  if (support === "direct-media") {
    return context.reply("Direct media URL accepted. Transcription command wiring is next.");
  }

  return context.reply("For the MVP bot, send a direct media URL. YouTube/page extraction is planned behind the source extractor.");
});

void bot.launch();

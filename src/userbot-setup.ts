import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import readline from "readline";
import dotenv from "dotenv";

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (query: string): Promise<string> => {
  return new Promise((resolve) => rl.question(query, resolve));
};

async function main() {
  console.log("=== Telegram Userbot Session Setup ===");
  console.log("This script will guide you to generate a TELEGRAM_USER_SESSION token.");
  console.log("Please make sure you have API_ID and API_HASH from https://my.telegram.org\n");

  const apiIdInput = process.env.TELEGRAM_API_ID || await ask("Enter your TELEGRAM_API_ID: ");
  const apiHashInput = process.env.TELEGRAM_API_HASH || await ask("Enter your TELEGRAM_API_HASH: ");

  const apiId = parseInt(apiIdInput.trim(), 10);
  const apiHash = apiHashInput.trim();

  if (isNaN(apiId) || !apiHash) {
    console.error("Error: Invalid API_ID or API_HASH");
    rl.close();
    process.exit(1);
  }

  const stringSession = new StringSession(""); // starts empty
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  try {
    await client.start({
      phoneNumber: async () => await ask("Enter your phone number (e.g. +86188... or +1...): "),
      password: async () => await ask("Enter your 2FA Password (if enabled, otherwise press Enter): "),
      phoneCode: async () => await ask("Enter the SMS verification code you received: "),
      onError: (err) => console.error("Login Error:", err),
    });

    console.log("\n[SUCCESS] Successfully logged in!");
    const sessionString = client.session.save() as any;
    console.log("\nYour TELEGRAM_USER_SESSION is:\n");
    console.log("=================================================================================");
    console.log(sessionString);
    console.log("=================================================================================\n");
    console.log("Please copy this session string and set it in your .env file as:");
    console.log(`TELEGRAM_USER_SESSION="${sessionString}"`);
    console.log(`TELEGRAM_API_ID=${apiId}`);
    console.log(`TELEGRAM_API_HASH="${apiHash}"`);
  } catch (err) {
    console.error("\n[ERROR] Authentication failed:", err);
  } finally {
    rl.close();
    await client.disconnect();
  }
}

main().catch(console.error);

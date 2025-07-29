const cheerio = require("cheerio");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
require("dotenv").config();

const CONFIG = {
  URLS: [
    "https://www.kelz0r.dk/magic/gundam-card-game-gd01-newtype-rising-booster-box-display-packs-p-349296.html",
    "https://www.kelz0r.dk/magic/_poke-me01-mega-evolution-base-set-m-1807.html",
  ],
  CHECK_INTERVAL_MINUTES: 1,
  SELECTOR: "#bodyContent .popbtn.btn-success",
  IN_STOCK_TEXT: "Add to Cart",
  USER_AGENT:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
};

if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CHANNEL_ID) {
  console.error(
    "Error: Missing DISCORD_TOKEN or DISCORD_CHANNEL_ID in .env file."
  );
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

async function sendAlert(url, buttonText, inStock) {
  const timestamp = new Date().toLocaleString();
  console.log(`[${timestamp}] Status changed for ${url}. Sending alert...`);

  try {
    const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);
    if (!channel) {
      console.error("Could not find the specified Discord channel.");
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("Kelz0r Product Status Alert")
      .setURL(url)
      .setColor(inStock ? "#00FF00" : "#FF0000")
      .addFields(
        {
          name: "Status",
          value: inStock ? "In Stock" : "Out of Stock",
          inline: true,
        },
        { name: "Button Text", value: `\`${buttonText}\``, inline: true },
        { name: "Product URL", value: url, inline: false }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    console.log("Alert sent successfully.");
  } catch (error) {
    console.error("Error sending Discord alert:", error);
  }
}

async function monitorPage() {
  // Store previous status for each URL
  const previousStockStatuses = new Map();

  const runCheck = async () => {
    const checkTime = new Date().toLocaleString();
    console.log(
      `[${checkTime}] Running check for ${CONFIG.URLS.length} URLs...`
    );

    // Check each URL
    for (const url of CONFIG.URLS) {
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": CONFIG.USER_AGENT },
        });

        if (!response.ok) {
          throw new Error(
            `Failed to fetch page: ${response.status} ${response.statusText}`
          );
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const buttonElement = $(CONFIG.SELECTOR);
        const buttonText = buttonElement.find("span").last().text().trim();

        if (!buttonText) {
          console.warn(
            `[${checkTime}] Warning: Could not find button text for ${url} with selector "${CONFIG.SELECTOR}".`
          );
          continue;
        }

        const currentStockStatus =
          buttonText.toLowerCase() === CONFIG.IN_STOCK_TEXT.toLowerCase();

        const previousStockStatus = previousStockStatuses.get(url);

        if (previousStockStatus === undefined) {
          console.log(`Initial status detected for ${url}: "${buttonText}"`);
          previousStockStatuses.set(url, currentStockStatus);
          continue;
        }

        if (previousStockStatus !== currentStockStatus) {
          await sendAlert(url, buttonText, currentStockStatus);
          previousStockStatuses.set(url, currentStockStatus);
        } else {
          console.log(`No change detected for ${url}. Status: "${buttonText}"`);
        }
      } catch (error) {
        console.error(
          `[${checkTime}] An error occurred while monitoring ${url}:`,
          error.message
        );
      }
    }
  };

  await runCheck();

  const checkIntervalMs = CONFIG.CHECK_INTERVAL_MINUTES * 60 * 1000;
  setTimeout(function loop() {
    runCheck().then(() => setTimeout(loop, checkIntervalMs));
  }, checkIntervalMs);
}

client.once("ready", (c) => {
  console.log(`Discord client is ready! Logged in as ${c.user.tag}`);
  console.log("Starting page monitor...");
  monitorPage();
});

client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error("Failed to login to Discord:", error);
});

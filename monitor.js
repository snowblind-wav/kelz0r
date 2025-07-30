const cheerio = require("cheerio");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
require("dotenv").config();

const CONFIG = {
  URLS: [
    "https://www.kelz0r.dk/magic/gundam-card-game-gd01-newtype-rising-booster-box-display-packs-p-349296.html",
    "https://www.kelz0r.dk/magic/_poke-me01-mega-evolution-base-set-m-1807.html",
  ],
  PRICE_MONITOR_URLS: [
    "https://www.kelz0r.dk/magic/pokemon-tin-kasse-2025-summer-scarlet-violet-black-bolt-white-flare-unova-mini-tins-displaymini-tins-boosters-p-354134.html",
  ],
  CHECK_INTERVAL_MINUTES: 1,
  SELECTOR: "#bodyContent .popbtn.btn-success",
  PRICE_SELECTOR: ".proinfoprice span",
  IN_STOCK_TEXT: "Add to Cart",
  USER_AGENT:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  // Create headers object for requests
  HEADERS: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    Cookie: "currency=USD",
  },
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

async function sendAlert(url, buttonText, inStock, priceData = null) {
  const timestamp = new Date().toLocaleString();
  console.log(`[${timestamp}] Status changed for ${url}. Sending alert...`);

  try {
    const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);
    if (!channel) {
      console.error("Could not find the specified Discord channel.");
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("Kelz0r Product Alert")
      .setURL(url)
      .setTimestamp();

    if (priceData) {
      embed
        .setColor("#FFA500") // Orange for price changes
        .addFields(
          { name: "Alert Type", value: "Price Change", inline: true },
          { name: "Previous Price", value: priceData.previous, inline: true },
          { name: "Current Price", value: priceData.current, inline: true },
          { name: "Product URL", value: url, inline: false }
        );
    } else {
      embed.setColor(inStock ? "#00FF00" : "#FF0000").addFields(
        {
          name: "Status",
          value: inStock ? "In Stock" : "Out of Stock",
          inline: true,
        },
        { name: "Button Text", value: `\`${buttonText}\``, inline: true },
        { name: "Product URL", value: url, inline: false }
      );
    }

    await channel.send({ embeds: [embed] });
    console.log("Alert sent successfully.");
  } catch (error) {
    console.error("Error sending Discord alert:", error);
  }
}

async function monitorPage() {
  // Store previous status for each URL
  const previousStockStatuses = new Map();
  const previousPrices = new Map();

  const runCheck = async () => {
    const checkTime = new Date().toLocaleString();
    const totalUrls = CONFIG.URLS.length + CONFIG.PRICE_MONITOR_URLS.length;
    console.log(`[${checkTime}] Running check for ${totalUrls} URLs...`);

    // Check stock status URLs
    for (const url of CONFIG.URLS) {
      try {
        const response = await fetch(url, {
          headers: CONFIG.HEADERS,
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

    // Check price monitor URLs
    for (const url of CONFIG.PRICE_MONITOR_URLS) {
      try {
        const response = await fetch(url, {
          headers: CONFIG.HEADERS,
        });

        if (!response.ok) {
          throw new Error(
            `Failed to fetch page: ${response.status} ${response.statusText}`
          );
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const priceElement = $(CONFIG.PRICE_SELECTOR);
        const currentPrice = priceElement.text().trim();

        if (!currentPrice) {
          console.warn(
            `[${checkTime}] Warning: Could not find price for ${url} with selector "${CONFIG.PRICE_SELECTOR}".`
          );
          continue;
        }

        const previousPrice = previousPrices.get(url);

        if (previousPrice === undefined) {
          console.log(`Initial price detected for ${url}: ${currentPrice}`);
          previousPrices.set(url, currentPrice);
          continue;
        }

        if (previousPrice !== currentPrice) {
          await sendAlert(url, null, null, {
            previous: previousPrice,
            current: currentPrice,
          });
          previousPrices.set(url, currentPrice);
        } else {
          console.log(
            `No price change detected for ${url}. Price: ${currentPrice}`
          );
        }
      } catch (error) {
        console.error(
          `[${checkTime}] An error occurred while monitoring price for ${url}:`,
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

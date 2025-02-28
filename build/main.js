"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var import_adapter_core = require("@iobroker/adapter-core");
var import_axios = __toESM(require("axios"));
class Nomosenergy extends import_adapter_core.Adapter {
  updateInterval = null;
  hourlyUpdateInterval = null;
  constructor(options) {
    console.log("Constructor called with options: ", options);
    super(options);
    this.log.debug("Constructor called with options: " + JSON.stringify(options));
    this.on("ready", this.onReady.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async onReady() {
    this.log.debug("onReady started");
    try {
      await this.setObjectNotExistsAsync("info.last_update_time", {
        type: "state",
        common: {
          name: "Last update time",
          type: "string",
          role: "date",
          read: true,
          write: false
        },
        native: {}
      });
      this.log.debug("last_update_time object created");
      await this.setObjectNotExistsAsync("info.last_update_success", {
        type: "state",
        common: {
          name: "Last update success",
          type: "boolean",
          role: "indicator",
          read: true,
          write: false
        },
        native: {}
      });
      this.log.debug("last_update_success object created");
      const updateData = async () => {
        this.log.debug("updateData started");
        try {
          const token = await this.authenticate();
          this.log.debug("Authentication successful, token received");
          const subscriptionId = await this.getSubscriptionId(token);
          this.log.debug("Subscription ID retrieved: " + subscriptionId);
          const priceData = await this.getPriceSeries(token, subscriptionId);
          this.log.debug("Price data fetched: " + JSON.stringify(priceData));
          await this.storePrices(priceData);
          this.log.debug("Prices stored");
          await this.updateCurrentPrice();
          this.log.debug("Current price updated");
          await this.setStateAsync("info.last_update_time", (/* @__PURE__ */ new Date()).toISOString(), true);
          this.log.debug("Last update time set");
          await this.setStateAsync("info.last_update_success", true, true);
          this.log.debug("Last update success set to true");
          this.log.info("Data updated successfully");
        } catch (error) {
          this.log.error(`Update failed: ${error.message || String(error)}`);
          await this.setStateAsync("info.last_update_success", false, true);
          this.log.debug("Last update success set to false due to error");
        }
      };
      this.log.debug("Calling initial updateData");
      await updateData();
      const now = /* @__PURE__ */ new Date();
      const msUntilNextHour = (60 - now.getMinutes()) * 60 * 1e3 - now.getSeconds() * 1e3 - now.getMilliseconds();
      this.log.debug(`Scheduling next update in ${msUntilNextHour} ms`);
      setTimeout(() => {
        this.log.debug("Executing scheduled updateData");
        updateData();
        this.updateInterval = setInterval(() => {
          this.log.debug("Executing interval updateData");
          updateData();
        }, 60 * 60 * 1e3);
      }, msUntilNextHour);
      this.log.debug("Calling initial updateCurrentPrice");
      await this.updateCurrentPrice();
      this.log.debug(`Scheduling hourly update in ${msUntilNextHour} ms`);
      setTimeout(() => {
        this.log.debug("Executing scheduled updateCurrentPrice");
        this.updateCurrentPrice();
        this.hourlyUpdateInterval = setInterval(() => {
          this.log.debug("Executing hourly updateCurrentPrice");
          this.updateCurrentPrice();
        }, 60 * 60 * 1e3);
      }, msUntilNextHour);
      this.log.debug("onReady completed");
    } catch (error) {
      this.log.error(`onReady failed: ${error.message || String(error)}`);
      throw error;
    }
  }
  onUnload(callback) {
    this.log.debug("onUnload started");
    try {
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
        this.updateInterval = null;
        this.log.debug("updateInterval cleared");
      }
      if (this.hourlyUpdateInterval) {
        clearInterval(this.hourlyUpdateInterval);
        this.hourlyUpdateInterval = null;
        this.log.debug("hourlyUpdateInterval cleared");
      }
      this.log.debug("onUnload completed");
      callback();
    } catch (error) {
      this.log.error(`onUnload failed: ${error.message || String(error)}`);
      callback();
    }
  }
  async authenticate() {
    this.log.debug("authenticate started");
    const config = this.config;
    this.log.debug("Config: " + JSON.stringify(config));
    if (!config.client_id || !config.client_secret) {
      this.log.error("Client ID or Client Secret not configured");
      throw new Error("Client ID or Client Secret not configured");
    }
    const authString = Buffer.from(`${config.client_id}:${config.client_secret}`).toString("base64");
    const headers = {
      Authorization: `Basic ${authString}`,
      "Content-Type": "application/x-www-form-urlencoded"
    };
    const data = "grant_type=client_credentials";
    try {
      this.log.debug("Sending authentication request");
      const response = await import_axios.default.post(
        "https://api.sandbox.nomos.energy/oauth/token",
        data,
        { headers }
      );
      this.log.debug("Authentication response: " + JSON.stringify(response.data));
      if (!response.data.access_token) {
        this.log.error("No access token received");
        throw new Error("No access token received");
      }
      this.log.debug("authenticate completed");
      return response.data.access_token;
    } catch (error) {
      this.log.error(`Authentication failed: ${error.message || String(error)}`);
      throw new Error(`Authentication failed: ${error.message || String(error)}`);
    }
  }
  async getSubscriptionId(token) {
    this.log.debug("getSubscriptionId started with token: " + token);
    const headers = {
      Authorization: `Bearer ${token}`
    };
    try {
      this.log.debug("Fetching subscriptions");
      const response = await import_axios.default.get(
        "https://api.sandbox.nomos.energy/subscriptions",
        { headers }
      );
      this.log.debug("Subscriptions response: " + JSON.stringify(response.data));
      const subscriptions = response.data.items;
      if (!subscriptions || subscriptions.length === 0) {
        this.log.error("No subscriptions found");
        throw new Error("No subscriptions found");
      }
      const subscriptionId = subscriptions[0].id;
      this.log.info(`Using subscription ID: ${subscriptionId}`);
      this.log.debug("getSubscriptionId completed");
      return subscriptionId;
    } catch (error) {
      this.log.error(`Failed to fetch subscriptions: ${error.message || String(error)}`);
      throw new Error(`Failed to fetch subscriptions: ${error.message || String(error)}`);
    }
  }
  async getPriceSeries(token, subscriptionId) {
    this.log.debug("getPriceSeries started with token: " + token + " and subscriptionId: " + subscriptionId);
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 864e5).toISOString().split("T")[0];
    const params = {
      start: today,
      end: tomorrow
    };
    const headers = {
      Authorization: `Bearer ${token}`
    };
    try {
      this.log.debug("Fetching price series");
      const response = await import_axios.default.get(
        `https://api.sandbox.nomos.energy/subscriptions/${subscriptionId}/prices`,
        { headers, params }
      );
      this.log.debug("Price series response: " + JSON.stringify(response.data));
      this.log.debug("getPriceSeries completed");
      return response.data;
    } catch (error) {
      this.log.error(`Failed to fetch price series: ${error.message || String(error)}`);
      throw new Error(`Failed to fetch price series: ${error.message || String(error)}`);
    }
  }
  async storePrices(priceData) {
    this.log.debug("storePrices started with data: " + JSON.stringify(priceData));
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 864e5).toISOString().split("T")[0];
    await this.setObjectNotExistsAsync("prices_today", {
      type: "channel",
      common: { name: "Prices for today" },
      native: {}
    });
    this.log.debug("prices_today channel created");
    await this.setObjectNotExistsAsync("prices_tomorrow", {
      type: "channel",
      common: { name: "Prices for tomorrow" },
      native: {}
    });
    this.log.debug("prices_tomorrow channel created");
    const items = priceData.items || [];
    for (const item of items) {
      const timestamp = item.timestamp;
      const dateStr = timestamp.split("T")[0];
      const hour = new Date(timestamp).getHours().toString();
      const folder = dateStr === today ? "prices_today" : dateStr === tomorrow ? "prices_tomorrow" : null;
      if (folder) {
        const stateId = `${folder}.${hour}`;
        await this.setObjectNotExistsAsync(stateId, {
          type: "state",
          common: {
            name: `Price for hour ${hour}`,
            type: "number",
            role: "value",
            unit: "ct/kWh",
            read: true,
            write: false
          },
          native: {}
        });
        await this.setStateAsync(stateId, item.amount, true);
        this.log.debug(`Stored price for ${stateId}`);
      }
    }
    const chartToday = /* @__PURE__ */ new Date();
    chartToday.setHours(0, 0, 0, 0);
    const xAxisData = [];
    const seriesData = [];
    for (let i = 0; i <= 48; i++) {
      const currentDate = new Date(chartToday.getTime() + i * 36e5);
      const day = currentDate.getDate().toString().padStart(2, "0");
      const month = (currentDate.getMonth() + 1).toString().padStart(2, "0");
      const hour = currentDate.getHours().toString().padStart(2, "0");
      xAxisData.push(`${day}.${month}.
${hour}:00`);
      const matchingItem = items.find((item) => {
        const itemDate = new Date(item.timestamp);
        return itemDate.getTime() === currentDate.getTime();
      });
      seriesData.push(matchingItem ? matchingItem.amount : null);
    }
    const chartConfig = {
      backgroundColor: "rgb(232, 232, 232)",
      title: {
        text: "Nomos Energy Price",
        textStyle: {
          color: "#ffffff"
        }
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "cross"
        }
      },
      grid: {
        left: "10%",
        right: "4%",
        top: "8%",
        bottom: "8%"
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: xAxisData
      },
      yAxis: {
        type: "value",
        axisLabel: {
          formatter: "{value} ct/kWh"
        },
        axisPointer: {
          snap: true
        }
      },
      visualMap: {
        min: 0.2,
        max: 0.3,
        inRange: {
          color: ["green", "yellow", "red"]
        },
        show: false
      },
      series: [
        {
          name: "Total",
          type: "line",
          step: "end",
          symbol: "none",
          data: seriesData,
          markArea: {
            itemStyle: {
              color: "rgba(120, 200, 120, 0.2)"
            },
            data: [
              [{ xAxis: "" }, { xAxis: "" }]
            ]
          }
        }
      ]
    };
    const chartConfigString = JSON.stringify(chartConfig);
    await this.setObjectNotExistsAsync("prices.chart_config", {
      type: "state",
      common: {
        name: "Chart configuration for prices",
        type: "string",
        role: "json",
        read: true,
        write: false
      },
      native: {}
    });
    await this.setStateAsync("prices.chart_config", chartConfigString, true);
    this.log.debug("Chart config stored");
    this.log.debug("storePrices completed");
  }
  async updateCurrentPrice() {
    this.log.debug("updateCurrentPrice started");
    const now = /* @__PURE__ */ new Date();
    const currentHour = now.getHours().toString();
    const stateId = `prices_today.${currentHour}`;
    await this.setObjectNotExistsAsync("prices.current_Price", {
      type: "state",
      common: {
        name: "Current price",
        type: "number",
        role: "value",
        unit: "ct/kWh",
        read: true,
        write: false
      },
      native: {}
    });
    this.log.debug("current_Price object created");
    const priceState = await this.getStateAsync(stateId);
    const currentPrice = priceState && priceState.val !== null ? priceState.val : null;
    await this.setStateAsync("prices.current_Price", currentPrice, true);
    this.log.debug("Current price set to: " + currentPrice);
    this.log.debug("updateCurrentPrice completed");
  }
}
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});
module.exports = (options) => new Nomosenergy(options);
//# sourceMappingURL=main.js.map

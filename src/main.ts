import { Adapter, AdapterOptions } from "@iobroker/adapter-core";
import axios from "axios";

interface NomosenergyConfig {
    client_id: string;
    client_secret: string;
}

class Nomosenergy extends Adapter {
    private updateInterval: NodeJS.Timeout | null = null;
    private hourlyUpdateInterval: NodeJS.Timeout | null = null;

    constructor(options: AdapterOptions) {
        super({ ...options, name: "nomosenergy" });
        this.on("ready", this.onReady.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }

    private async onReady(): Promise<void> {
        await this.setObjectNotExistsAsync("info.last_update_time", {
            type: "state",
            common: { name: "Last update time", type: "string", role: "date", read: true, write: false },
            native: {},
        });
        await this.setObjectNotExistsAsync("info.last_update_success", {
            type: "state",
            common: { name: "Last update success", type: "boolean", role: "indicator", read: true, write: false },
            native: {},
        });

        const updateData = async (): Promise<void> => {
            try {
                const token = await this.authenticate();
                const subscriptionId = await this.getSubscriptionId(token);
                const priceData = await this.getPriceSeries(token, subscriptionId);
                await this.storePrices(priceData);
                await this.updateCurrentPrice();
                await this.setStateAsync("info.last_update_time", new Date().toISOString(), true);
                await this.setStateAsync("info.last_update_success", true, true);
                this.log.info("Data updated successfully");
            } catch (error: unknown) {
                await this.setStateAsync("info.last_update_success", false, true);
                this.log.error(`Update failed: ${(error as Error).message || String(error)}`);
            }
        };

        await updateData();

        const now = new Date();
        const msUntilNextHour = (60 - now.getMinutes()) * 60 * 1000 - now.getSeconds() * 1000 - now.getMilliseconds();
        setTimeout(() => {
            updateData();
            this.updateInterval = setInterval(updateData, 60 * 60 * 1000);
        }, msUntilNextHour);

        await this.updateCurrentPrice();
        setTimeout(() => {
            this.updateCurrentPrice();
            this.hourlyUpdateInterval = setInterval(this.updateCurrentPrice.bind(this), 60 * 60 * 1000);
        }, msUntilNextHour);
    }

    private onUnload(callback: () => void): void {
        try {
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = null;
            }
            if (this.hourlyUpdateInterval) {
                clearInterval(this.hourlyUpdateInterval);
                this.hourlyUpdateInterval = null;
            }
            callback();
        } catch {
            callback();
        }
    }

    private async authenticate(): Promise<string> {
        const config = this.config as unknown as NomosenergyConfig;
        if (!config.client_id || !config.client_secret) {
            throw new Error("Client ID or Client Secret not configured");
        }
        const authString = Buffer.from(`${config.client_id}:${config.client_secret}`).toString("base64");
        const headers = {
            Authorization: `Basic ${authString}`,
            "Content-Type": "application/x-www-form-urlencoded",
        };
        const data = "grant_type=client_credentials";
        const response = await axios.post("https://api.sandbox.nomos.energy/oauth/token", data, { headers });
        if (!response.data.access_token) {
            throw new Error("No access token received");
        }
        return response.data.access_token;
    }

    private async getSubscriptionId(token: string): Promise<string> {
        const headers = { Authorization: `Bearer ${token}` };
        const response = await axios.get("https://api.sandbox.nomos.energy/subscriptions", { headers });
        const subscriptions = response.data.items;
        if (!subscriptions || subscriptions.length === 0) {
            throw new Error("No subscriptions found");
        }
        const subscriptionId = subscriptions[0].id;
        this.log.info(`Using subscription ID: ${subscriptionId}`);
        return subscriptionId;
    }

    private async getPriceSeries(token: string, subscriptionId: string): Promise<any> {
        const today = new Date().toISOString().split("T")[0];
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
        const params = { start: today, end: tomorrow };
        const headers = { Authorization: `Bearer ${token}` };
        const response = await axios.get(`https://api.sandbox.nomos.energy/subscriptions/${subscriptionId}/prices`, { headers, params });
        return response.data;
    }

    private async storePrices(priceData: any): Promise<void> {
        const today = new Date().toISOString().split("T")[0];
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
        await this.setObjectNotExistsAsync("prices_today", { type: "channel", common: { name: "Prices for today" }, native: {} });
        await this.setObjectNotExistsAsync("prices_tomorrow", { type: "channel", common: { name: "Prices for tomorrow" }, native: {} });

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
                    common: { name: `Price for hour ${hour}`, type: "number", role: "value", unit: "ct/kWh", read: true, write: false },
                    native: {},
                });
                await this.setStateAsync(stateId, item.amount, true);
            }
        }

        const chartToday = new Date();
        chartToday.setHours(0, 0, 0, 0);
        const xAxisData = [];
        const seriesData = [];
        for (let i = 0; i <= 48; i++) {
            const currentDate = new Date(chartToday.getTime() + i * 3600000);
            const day = currentDate.getDate().toString().padStart(2, "0");
            const month = (currentDate.getMonth() + 1).toString().padStart(2, "0");
            const hour = currentDate.getHours().toString().padStart(2, "0");
            xAxisData.push(`${day}.${month}.\n${hour}:00`);
            const matchingItem = items.find((item: any) => new Date(item.timestamp).getTime() === currentDate.getTime());
            seriesData.push(matchingItem ? matchingItem.amount : null);
        }

        const chartConfig = {
            backgroundColor: "rgb(232, 232, 232)",
            title: { text: "Nomos Energy Price", textStyle: { color: "#ffffff" } },
            tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
            grid: { left: "10%", right: "4%", top: "8%", bottom: "8%" },
            xAxis: { type: "category", boundaryGap: false, data: xAxisData },
            yAxis: { type: "value", axisLabel: { formatter: "{value} ct/kWh" }, axisPointer: { snap: true } },
            visualMap: { min: 0.2, max: 0.3, inRange: { color: ["green", "yellow", "red"] }, show: false },
            series: [{ name: "Total", type: "line", step: "end", symbol: "none", data: seriesData, markArea: { itemStyle: { color: "rgba(120, 200, 120, 0.2)" }, data: [[{ xAxis: "" }, { xAxis: "" }]] } }],
        };
        const chartConfigString = JSON.stringify(chartConfig);
        await this.setObjectNotExistsAsync("prices.chart_config", { type: "state", common: { name: "Chart configuration for prices", type: "string", role: "json", read: true, write: false }, native: {} });
        await this.setStateAsync("prices.chart_config", chartConfigString, true);
    }

    private async updateCurrentPrice(): Promise<void> {
        const now = new Date();
        const currentHour = now.getHours().toString();
        const stateId = `prices_today.${currentHour}`;
        await this.setObjectNotExistsAsync("prices.current_Price", {
            type: "state",
            common: { name: "Current price", type: "number", role: "value", unit: "ct/kWh", read: true, write: false },
            native: {},
        });
        const priceState = await this.getStateAsync(stateId);
        const currentPrice = priceState && priceState.val !== null ? priceState.val : null;
        await this.setStateAsync("prices.current_Price", currentPrice, true);
    }
}

export = (options: AdapterOptions): Nomosenergy => new Nomosenergy(options);

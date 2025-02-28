import { Adapter, AdapterOptions } from "@iobroker/adapter-core";
import axios, { AxiosResponse } from "axios";

interface Config {
    client_id?: string;
    client_secret?: string;
}

interface PriceItem {
    timestamp: string;
    amount: number;
}

interface PriceData {
    items: PriceItem[];
}

interface Subscription {
    id: string;
}

class Nomosenergy extends Adapter {
    private updateInterval: NodeJS.Timeout | null = null;
    private hourlyUpdateInterval: NodeJS.Timeout | null = null;

    constructor(options: AdapterOptions) {
    console.log("Constructor called with options: ", options); // Temporäres Log
    super(options);
    this.log.debug("Constructor called with options: " + JSON.stringify(options));
    this.on("ready", this.onReady.bind(this));
    this.on("unload", this.onUnload.bind(this));
    }

    private async onReady(): Promise<void> {
        this.log.debug("onReady started");
        try {
            await this.setObjectNotExistsAsync("info.last_update_time", {
                type: "state",
                common: {
                    name: "Last update time",
                    type: "string",
                    role: "date",
                    read: true,
                    write: false,
                },
                native: {},
            });
            this.log.debug("last_update_time object created");

            await this.setObjectNotExistsAsync("info.last_update_success", {
                type: "state",
                common: {
                    name: "Last update success",
                    type: "boolean",
                    role: "indicator",
                    read: true,
                    write: false,
                },
                native: {},
            });
            this.log.debug("last_update_success object created");

            const updateData = async (): Promise<void> => {
                this.log.debug("updateData started");
                try {
                    const token: string = await this.authenticate();
                    this.log.debug("Authentication successful, token received");
                    const subscriptionId: string = await this.getSubscriptionId(token);
                    this.log.debug("Subscription ID retrieved: " + subscriptionId);
                    const priceData: PriceData = await this.getPriceSeries(token, subscriptionId);
                    this.log.debug("Price data fetched: " + JSON.stringify(priceData));
                    await this.storePrices(priceData);
                    this.log.debug("Prices stored");
                    await this.updateCurrentPrice();
                    this.log.debug("Current price updated");
                    await this.setStateAsync("info.last_update_time", new Date().toISOString(), true);
                    this.log.debug("Last update time set");
                    await this.setStateAsync("info.last_update_success", true, true);
                    this.log.debug("Last update success set to true");
                    this.log.info("Data updated successfully");
                } catch (error: unknown) {
                    this.log.error(`Update failed: ${(error as Error).message || String(error)}`);
                    await this.setStateAsync("info.last_update_success", false, true);
                    this.log.debug("Last update success set to false due to error");
                }
            };

            this.log.debug("Calling initial updateData");
            await updateData();

            const now: Date = new Date();
            const msUntilNextHour: number = (60 - now.getMinutes()) * 60 * 1000 - now.getSeconds() * 1000 - now.getMilliseconds();
            this.log.debug(`Scheduling next update in ${msUntilNextHour} ms`);
            setTimeout(() => {
                this.log.debug("Executing scheduled updateData");
                updateData();
                this.updateInterval = setInterval(() => {
                    this.log.debug("Executing interval updateData");
                    updateData();
                }, 60 * 60 * 1000);
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
                }, 60 * 60 * 1000);
            }, msUntilNextHour);

            this.log.debug("onReady completed");
        } catch (error: unknown) {
            this.log.error(`onReady failed: ${(error as Error).message || String(error)}`);
            throw error; // Um sicherzustellen, dass der Adapter abstürzt und dies in den Logs sichtbar ist
        }
    }

    private onUnload(callback: () => void): void {
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
        } catch (error: unknown) {
            this.log.error(`onUnload failed: ${(error as Error).message || String(error)}`);
            callback();
        }
    }

    private async authenticate(): Promise<string> {
        this.log.debug("authenticate started");
        const config = this.config as Config;
        this.log.debug("Config: " + JSON.stringify(config));
        if (!config.client_id || !config.client_secret) {
            this.log.error("Client ID or Client Secret not configured");
            throw new Error("Client ID or Client Secret not configured");
        }

        const authString: string = Buffer.from(`${config.client_id}:${config.client_secret}`).toString("base64");
        const headers = {
            Authorization: `Basic ${authString}`,
            "Content-Type": "application/x-www-form-urlencoded",
        };
        const data: string = "grant_type=client_credentials";

        try {
            this.log.debug("Sending authentication request");
            const response: AxiosResponse<{ access_token: string }> = await axios.post(
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
        } catch (error: unknown) {
            this.log.error(`Authentication failed: ${(error as Error).message || String(error)}`);
            throw new Error(`Authentication failed: ${(error as Error).message || String(error)}`);
        }
    }

    private async getSubscriptionId(token: string): Promise<string> {
        this.log.debug("getSubscriptionId started with token: " + token);
        const headers = {
            Authorization: `Bearer ${token}`,
        };
        try {
            this.log.debug("Fetching subscriptions");
            const response: AxiosResponse<{ items: Subscription[] }> = await axios.get(
                "https://api.sandbox.nomos.energy/subscriptions",
                { headers }
            );
            this.log.debug("Subscriptions response: " + JSON.stringify(response.data));
            const subscriptions = response.data.items;
            if (!subscriptions || subscriptions.length === 0) {
                this.log.error("No subscriptions found");
                throw new Error("No subscriptions found");
            }
            const subscriptionId: string = subscriptions[0].id;
            this.log.info(`Using subscription ID: ${subscriptionId}`);
            this.log.debug("getSubscriptionId completed");
            return subscriptionId;
        } catch (error: unknown) {
            this.log.error(`Failed to fetch subscriptions: ${(error as Error).message || String(error)}`);
            throw new Error(`Failed to fetch subscriptions: ${(error as Error).message || String(error)}`);
        }
    }

    private async getPriceSeries(token: string, subscriptionId: string): Promise<PriceData> {
        this.log.debug("getPriceSeries started with token: " + token + " and subscriptionId: " + subscriptionId);
        const today: string = new Date().toISOString().split("T")[0];
        const tomorrow: string = new Date(Date.now() + 86400000).toISOString().split("T")[0];
        const params = {
            start: today,
            end: tomorrow,
        };
        const headers = {
            Authorization: `Bearer ${token}`,
        };
        try {
            this.log.debug("Fetching price series");
            const response: AxiosResponse<PriceData> = await axios.get(
                `https://api.sandbox.nomos.energy/subscriptions/${subscriptionId}/prices`,
                { headers, params }
            );
            this.log.debug("Price series response: " + JSON.stringify(response.data));
            this.log.debug("getPriceSeries completed");
            return response.data;
        } catch (error: unknown) {
            this.log.error(`Failed to fetch price series: ${(error as Error).message || String(error)}`);
            throw new Error(`Failed to fetch price series: ${(error as Error).message || String(error)}`);
        }
    }

    private async storePrices(priceData: PriceData): Promise<void> {
        this.log.debug("storePrices started with data: " + JSON.stringify(priceData));
        const today: string = new Date().toISOString().split("T")[0];
        const tomorrow: string = new Date(Date.now() + 86400000).toISOString().split("T")[0];

        await this.setObjectNotExistsAsync("prices_today", {
            type: "channel",
            common: { name: "Prices for today" },
            native: {},
        });
        this.log.debug("prices_today channel created");

        await this.setObjectNotExistsAsync("prices_tomorrow", {
            type: "channel",
            common: { name: "Prices for tomorrow" },
            native: {},
        });
        this.log.debug("prices_tomorrow channel created");

        const items: PriceItem[] = priceData.items || [];
        for (const item of items) {
            const timestamp: string = item.timestamp;
            const dateStr: string = timestamp.split("T")[0];
            const hour: string = new Date(timestamp).getHours().toString();
            const folder: string | null = dateStr === today ? "prices_today" : dateStr === tomorrow ? "prices_tomorrow" : null;
            if (folder) {
                const stateId: string = `${folder}.${hour}`;
                await this.setObjectNotExistsAsync(stateId, {
                    type: "state",
                    common: {
                        name: `Price for hour ${hour}`,
                        type: "number",
                        role: "value",
                        unit: "ct/kWh",
                        read: true,
                        write: false,
                    },
                    native: {},
                });
                await this.setStateAsync(stateId, item.amount, true);
                this.log.debug(`Stored price for ${stateId}`);
            }
        }

        const chartToday: Date = new Date();
        chartToday.setHours(0, 0, 0, 0);
        const xAxisData: string[] = [];
        const seriesData: (number | null)[] = [];
        for (let i = 0; i <= 48; i++) {
            const currentDate: Date = new Date(chartToday.getTime() + i * 3600000);
            const day: string = currentDate.getDate().toString().padStart(2, "0");
            const month: string = (currentDate.getMonth() + 1).toString().padStart(2, "0");
            const hour: string = currentDate.getHours().toString().padStart(2, "0");
            xAxisData.push(`${day}.${month}.\n${hour}:00`);

            const matchingItem: PriceItem | undefined = items.find((item: PriceItem) => {
                const itemDate: Date = new Date(item.timestamp);
                return itemDate.getTime() === currentDate.getTime();
            });
            seriesData.push(matchingItem ? matchingItem.amount : null);
        }

        const chartConfig: any = {
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

        const chartConfigString: string = JSON.stringify(chartConfig);

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

    private async updateCurrentPrice(): Promise<void> {
        this.log.debug("updateCurrentPrice started");
        const now: Date = new Date();
        const currentHour: string = now.getHours().toString();
        const stateId: string = `prices_today.${currentHour}`;

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
        const currentPrice: number | null = priceState && priceState.val !== null ? priceState.val as number : null;
        await this.setStateAsync("prices.current_Price", currentPrice, true);
        this.log.debug("Current price set to: " + currentPrice);
        this.log.debug("updateCurrentPrice completed");
    }
}

export = (options: AdapterOptions): Nomosenergy => new Nomosenergy(options);
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

"use strict";

import * as utils from "@iobroker/adapter-core";
import axios, { AxiosResponse } from "axios";

// Define your adapter's configuration interface
// Use a different approach since utils.AdapterConfig is not exported
interface NomosEnergyAdapterConfig {
    client_id: string;
    client_secret: string;
    // Add any other configuration properties your adapter uses
}

interface PriceItem {
    timestamp: string;
    amount: number;
}

interface PriceData {
    items?: PriceItem[];
}

interface TokenResponse {
    access_token: string;
}

interface Subscription {
    id: string;
}

interface SubscriptionsResponse {
    items: Subscription[];
}

interface ChartConfig {
    backgroundColor: string;
    title: {
        text: string;
        textStyle: {
            color: string;
        };
    };
    tooltip: {
        trigger: string;
        axisPointer: {
            type: string;
        };
    };
    grid: {
        left: string;
        right: string;
        top: string;
        bottom: string;
    };
    xAxis: {
        type: string;
        boundaryGap: boolean;
        data: string[];
    };
    yAxis: {
        type: string;
        axisLabel: {
            formatter: string;
        };
        axisPointer: {
            snap: boolean;
        };
    };
    visualMap: {
        min: number;
        max: number;
        inRange: {
            color: string[];
        };
        show: boolean;
    };
    series: {
        name: string;
        type: string;
        step: string;
        symbol: string;
        data: (number | null)[];
        markArea: {
            itemStyle: {
                color: string;
            };
            data: [
                [
                    {
                        xAxis: string;
                    },
                    {
                        xAxis: string;
                    }
                ]
            ];
        };
    }[];
}

class Nomosenergy extends utils.Adapter {
    private updateInterval: NodeJS.Timeout | null = null;
    private hourlyUpdateInterval: NodeJS.Timeout | null = null;
    
    // Access config as a general object with string indexing to bypass type checks
    private get nomosConfig(): NomosEnergyAdapterConfig {
        return this.config as any;
    }

    constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: "nomosenergy",
        });

        this.on("ready", this.onReady.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }

    async onReady(): Promise<void> {
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
            } catch (error: any) {
                await this.setStateAsync("info.last_update_success", false, true);
                this.log.error("Update failed: " + error.message);
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

    onUnload(callback: () => void): void {
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
        } catch (e) {
            callback();
        }
    }

    async authenticate(): Promise<string> {
        if (!this.nomosConfig.client_id || !this.nomosConfig.client_secret) {
            throw new Error("Client ID or Client Secret not configured");
        }

        const authString = Buffer.from(`${this.nomosConfig.client_id}:${this.nomosConfig.client_secret}`).toString("base64");
        const headers = {
            Authorization: `Basic ${authString}`,
            "Content-Type": "application/json",
        };
        const data = "grant_type=client_credentials";

        try {
            const response: AxiosResponse<TokenResponse> = await axios.post(
                "https://api.nomos.energy/oauth/token",
                data,
                { headers }
            );

            if (!response.data.access_token) {
                throw new Error("No access token received");
            }

            return response.data.access_token;
        } catch (error: any) {
            throw new Error(`Authentication failed: ${error.message}`);
        }
    }

    async getSubscriptionId(token: string): Promise<string> {
        const headers = {
            Authorization: `Bearer ${token}`,
        };

        try {
            const response: AxiosResponse<SubscriptionsResponse> = await axios.get(
                "https://api.nomos.energy/subscriptions",
                { headers }
            );

            const subscriptions = response.data.items;
            if (!subscriptions || subscriptions.length === 0) {
                throw new Error("No subscriptions found");
            }

            const subscriptionId = subscriptions[0].id;
            this.log.info(`Using subscription ID: ${subscriptionId}`);
            return subscriptionId;
        } catch (error: any) {
            throw new Error(`Failed to fetch subscriptions: ${error.message}`);
        }
    }

    async getPriceSeries(token: string, subscriptionId: string): Promise<PriceData> {
        const today = new Date().toISOString().split("T")[0];
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

        const params = {
            start: today,
            end: tomorrow,
        };

        const headers = {
            Authorization: `Bearer ${token}`,
        };

        try {
            const response: AxiosResponse<PriceData> = await axios.get(
                `https://api.nomos.energy/subscriptions/${subscriptionId}/prices`,
                { headers, params }
            );

            return response.data;
        } catch (error: any) {
            throw new Error(`Failed to fetch price series: ${error.message}`);
        }
    }

    async storePrices(priceData: PriceData): Promise<void> {
    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

    await this.setObjectNotExistsAsync("prices_today", {
        type: "channel",
        common: { name: "Prices for today" },
        native: {},
    });

    await this.setObjectNotExistsAsync("prices_tomorrow", {
        type: "channel",
        common: { name: "Prices for tomorrow" },
        native: {},
    });

    const items = priceData.items || [];

    // Store individual price states
    for (const item of items) {
        const timestamp = item.timestamp;
        const dateStr = timestamp.split("T")[0];
        const hour = new Date(timestamp).getUTCHours().toString(); // Use UTC hours
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
                    write: false,
                },
                native: {},
            });

            await this.setStateAsync(stateId, item.amount, true);
        }
    }

    // Generate chart data starting from today at 00:00 UTC
    const chartToday = new Date();
    chartToday.setUTCHours(0, 0, 0, 0); // Start of today in UTC

    const xAxisData: string[] = [];
    const seriesData: (number | null)[] = [];

    for (let i = 0; i <= 48; i++) {
        const currentDate = new Date(chartToday.getTime() + i * 3600000);
        const day = currentDate.getUTCDate().toString().padStart(2, "0");
        const month = (currentDate.getUTCMonth() + 1).toString().padStart(2, "0");
        const hour = currentDate.getUTCHours().toString().padStart(2, "0");

        xAxisData.push(`${day}.${month}.\n${hour}:00`);

        const matchingItem = items.find(item => {
            const itemDate = new Date(item.timestamp);
            return (
                itemDate.getUTCFullYear() === currentDate.getUTCFullYear() &&
                itemDate.getUTCMonth() === currentDate.getUTCMonth() &&
                itemDate.getUTCDate() === currentDate.getUTCDate() &&
                itemDate.getUTCHours() === currentDate.getUTCHours()
            );
        });

        seriesData.push(matchingItem ? matchingItem.amount : null);
    }

    const chartConfig: ChartConfig = {
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
            left: "17%",
            right: "1%",
            top: "2%",
            bottom: "12%"
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
                        [
                            { xAxis: "" },
                            { xAxis: "" }
                        ]
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
}

    async updateCurrentPrice(): Promise<void> {
        const now = new Date();
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

        const priceState = await this.getStateAsync(stateId);
        const currentPrice = priceState && priceState.val !== null ? priceState.val : null;

        await this.setStateAsync("prices.current_Price", currentPrice, true);
    }
}

// Export the constructor in a way that allows the constructor to be extended
export = (options?: Partial<utils.AdapterOptions>) => new Nomosenergy(options);

// If this file is called directly, start the adapter
if (require.main === module) {
    (() => new Nomosenergy())();
}

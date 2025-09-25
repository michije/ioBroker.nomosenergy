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

/**
 * Main adapter class for ioBroker Nomos Energy integration.
 * Fetches hourly electricity prices from Nomos Energy API and creates ioBroker states.
 */
class Nomosenergy extends utils.Adapter {
    private updateInterval: NodeJS.Timeout | null = null;
    private hourlyUpdateInterval: NodeJS.Timeout | null = null;

    // Access config as a general object with string indexing to bypass type checks
    private get nomosConfig(): NomosEnergyAdapterConfig {
        return this.config as any;
    }

    /**
     * Constructor for the Nomosenergy adapter.
     * @param options - Adapter options passed from ioBroker.
     */
    constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: "nomosenergy",
        });

        this.on("ready", this.onReady.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }

    /**
     * Called when the adapter is ready to start. Initializes states, sets up updates, and schedules periodic fetching of price data.
     */
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

        // Calculate time until next hour in local Berlin time
        const now = new Date();
        const berlinNow = this.utcToBerlin(now);
        const msUntilNextHour = (60 - berlinNow.getMinutes()) * 60 * 1000 - berlinNow.getSeconds() * 1000 - berlinNow.getMilliseconds();

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

    /**
     * Called when the adapter is being unloaded/stopped.
     * Cleans up intervals and calls the callback.
     * @param callback - Function to call when unloading is complete.
     */
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

    /**
     * Convert a UTC date to Berlin time (Europe/Berlin timezone)
     * Automatically handles Daylight Saving Time (DST) changes
     */
    utcToBerlin(date: Date): Date {
        const utcDate = new Date(date.toISOString());
        
        // Create a formatter that will output the date in Berlin timezone
        const berlinDateFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Europe/Berlin',
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            hour12: false
        });
        
        // Get the Berlin time components
        const parts = berlinDateFormatter.formatToParts(utcDate);
        const dateObj: Record<string, string> = {};
        parts.forEach(part => {
            if (part.type !== 'literal') {
                dateObj[part.type] = part.value;
            }
        });
        
        // Create a new date object with Berlin time components
        const berlinDate = new Date();
        berlinDate.setFullYear(
            parseInt(dateObj.year),
            parseInt(dateObj.month) - 1, // Month is 0-indexed
            parseInt(dateObj.day)
        );
        berlinDate.setHours(
            parseInt(dateObj.hour),
            parseInt(dateObj.minute),
            parseInt(dateObj.second),
            0 // Milliseconds
        );
        
        return berlinDate;
    }

    /**
     * Authenticates with the Nomos Energy API using client credentials (OAuth2).
     * @returns Access token string.
     * @throws Error if client ID/secret not configured or authentication fails.
     */
    async authenticate(): Promise<string> {
        if (!this.nomosConfig.client_id || !this.nomosConfig.client_secret) {
            throw new Error("Client ID or Client Secret not configured");
        }

        const authString = Buffer.from(`${this.nomosConfig.client_id}:${this.nomosConfig.client_secret}`).toString("base64");
        const headers = {
            Authorization: `Basic ${authString}`,
            "Content-Type": "application/x-www-form-urlencoded",
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

    /**
     * Retrieves the first subscription ID from the Nomos Energy API.
     * @param token - Access token for API authentication.
     * @returns Subscription ID string.
     * @throws Error if no subscriptions found or API request fails.
     */
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

    /**
     * Fetches price series data for today and tomorrow from the Nomos Energy API.
     * @param token - Access token for API authentication.
     * @param subscriptionId - Subscription ID to get prices for.
     * @returns Price data containing array of price items with timestamps and amounts.
     * @throws Error if API request fails.
     */
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

    /**
     * Stores price data as ioBroker states for today and tomorrow, creates channels if needed,
     * converts UTC timestamps to Berlin time, and generates ECharts configuration for visualization.
     * @param priceData - Price data object containing array of price items.
     */
    async storePrices(priceData: PriceData): Promise<void> {
        // Get today and tomorrow in Berlin timezone
        const berlinNow = this.utcToBerlin(new Date());
        const today = berlinNow.toISOString().split("T")[0];
        
        const berlinTomorrow = this.utcToBerlin(new Date(Date.now() + 86400000));
        const tomorrow = berlinTomorrow.toISOString().split("T")[0];

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
        const HOURS_IN_TWO_DAYS = 48;
        const priceMap = new Map<number, number>();

        // Store individual price states, converting UTC to Berlin time
        for (const item of items) {
            const utcTimestamp = item.timestamp;
            const berlinTime = this.utcToBerlin(new Date(utcTimestamp));
            const dateStr = berlinTime.toISOString().split("T")[0];
            const hour = berlinTime.getHours().toString(); // Use Berlin hours
            
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

            // Store the value keyed by Berlin timestamp for quick lookup later
            priceMap.set(berlinTime.getTime(), item.amount);
        }

        // Generate chart data starting from today at 00:00 Berlin time
        const chartToday = new Date(berlinNow);
        chartToday.setHours(0, 0, 0, 0); // Start of today in Berlin time

        const xAxisData: string[] = [];
        const seriesData: (number | null)[] = [];

        for (let i = 0; i < HOURS_IN_TWO_DAYS; i++) {
            const currentDate = new Date(chartToday.getTime() + i * 3600000);
            const day = currentDate.getDate().toString().padStart(2, "0");
            const month = (currentDate.getMonth() + 1).toString().padStart(2, "0");
            const hour = currentDate.getHours().toString().padStart(2, "0");

            xAxisData.push(`${day}.${month}.\n${hour}:00`);

            // Lookup the price directly using the timestamp map
            const value = priceMap.get(currentDate.getTime());
            seriesData.push(value !== undefined ? value : null);
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

    /**
     * Updates the current price state based on the current Berlin hour.
     * Retrieves the price for the current hour from prices_today states and sets prices.current_Price.
     */
    async updateCurrentPrice(): Promise<void> {
        // Get the current hour in Berlin time
        const berlinNow = this.utcToBerlin(new Date());
        const currentHour = berlinNow.getHours().toString();
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

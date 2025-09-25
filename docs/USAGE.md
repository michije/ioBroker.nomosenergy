# Advanced Usage Examples

This document provides advanced integration examples for the ioBroker.nomosenergy adapter, showing how to use energy price data in smart home automation.

## Automations

### Price-Based Device Control

#### Example: Run dishwasher when electricity is cheapest
```
// Create a script that runs every full hour
schedule('0 * * * *', () => {
    const currentPrice = getState('nomosenergy.0.prices.current_Price').val;
    const dishwasherRunning = getState('your.dishwasher.state').val;

    if (currentPrice < 0.15 && !dishwasherRunning) {
        setState('your.dishwasher.power', true);
        log('Dishwasher started - cheap electricity!');
    }
});
```

#### Example: Charge electric vehicle during low-price hours
```
// Daily schedule to find the lowest 4-hour window and charge EV
schedule('0 6 * * *', () => {
    const todayPrices = [];

    // Collect today's hourly prices
    for (let hour = 0; hour < 24; hour++) {
        const price = getState(`nomosenergy.0.prices_today.${hour}`).val;
        if (price !== null) {
            todayPrices.push({ hour, price });
        }
    }

    // Find the cheapest 4-hour window
    let bestWindow = { start: 0, averagePrice: Infinity };

    for (let start = 0; start <= 20; start++) { // Allow charging until 23:59
        const window = todayPrices.slice(start, start + 4);
        if (window.length === 4) {
            const averagePrice = window.reduce((sum, p) => sum + p.price, 0) / 4;
            if (averagePrice < bestWindow.averagePrice) {
                bestWindow = { start, averagePrice };
            }
        }
    }

    // Schedule charging
    const chargeTime = new Date();
    chargeTime.setHours(bestWindow.start, 0, 0, 0);

    schedule(chargeTime, () => {
        setState('your.ev.charger.on', true);
        log(`EV charging started at ${bestWindow.start}:00 - Average price: ${bestWindow.averagePrice.toFixed(3)} ct/kWh`);
    });
});
```

### Threshold-Based Notifications

#### Example: Alert when prices are high
```
// Weekly energy price summary
schedule('0 18 * * 1', () => { // Mondays at 18:00
    const weeklyPrices = [];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // Collect prices for the last 7 days (simplified - would need better date handling)
    for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour++) {
            const price = getState(`nomosenergy.0.prices_today.${hour}`).val;
            if (price !== null) {
                weeklyPrices.push(price);
            }
        }
    }

    if (weeklyPrices.length > 0) {
        const averagePrice = weeklyPrices.reduce((sum, p) => sum + p, 0) / weeklyPrices.length;
        const minPrice = Math.min(...weeklyPrices);
        const maxPrice = Math.max(...weeklyPrices);

        const message = `Weekly energy price summary:\nAverage: ${averagePrice.toFixed(3)} ct/kWh\nMin: ${minPrice.toFixed(3)} ct/kWh\nMax: ${maxPrice.toFixed(3)} ct/kWh`;

        sendTo('telegram', message);
    }
});
```

## Visualizations

### ECharts Integration in ioBroker VIS

The adapter provides `prices.chart_config` state containing ECharts configuration. Use this in VIS widgets:

1. Add a "JSON" widget in VIS
2. Bind it to `nomosenergy.0.prices.chart_config`
3. The widget will automatically display a line chart with:
   - 48 hours of price data (today + tomorrow)
   - Color-coded bars (green <0.2 ct/kWh, yellow 0.2-0.3 ct/kWh, red >0.3 ct/kWh)
   - Berlin timezone timestamps

### Custom Charts

Create your own visualizations:

```javascript
// Extract prices for custom visualization
function getTodaysPrices() {
    const prices = [];
    for (let hour = 0; hour < 24; hour++) {
        const price = getState(`nomosenergy.0.prices_today.${hour}`).val;
        prices.push({
            hour,
            price: price !== null ? price : null
        });
    }
    return prices;
}

// Example: Calculate and display price statistics
schedule('0 7 * * *', () => {
    const prices = getTodaysPrices();
    const validPrices = prices.filter(p => p.price !== null);

    if (validPrices.length > 0) {
        const stats = {
            average: validPrices.reduce((sum, p) => sum + p.price, 0) / validPrices.length,
            min: Math.min(...validPrices.map(p => p.price)),
            max: Math.max(...validPrices.map(p => p.price)),
        };

        setState('my.custom.price_average', stats.average);
        setState('my.custom.price_min', stats.min);
        setState('my.custom.price_max', stats.max);

        log(`Today's price stats - Avg: ${stats.average.toFixed(3)}, Min: ${stats.min.toFixed(3)}, Max: ${stats.max.toFixed(3)} ct/kWh`);
    }
});
```

## Energy Management Scenarios

### Heat Pump Optimization
```javascript
// Boost heat pump during cheap hours, reduce during expensive hours
schedule('0 * * * *', () => {
    const currentPrice = getState('nomosenergy.0.prices.current_Price').val;

    if (currentPrice < 0.1) {
        setState('your.heatpump.mode', 'boost');
        log('Heat pump boost mode - very cheap electricity');
    } else if (currentPrice > 0.3) {
        setState('your.heatpump.mode', 'eco');
        log('Heat pump eco mode - expensive electricity');
    } else {
        setState('your.heatpump.mode', 'normal');
    }
});
```

### Solar Battery Management
```javascript
// Decide whether to use grid electricity or charge battery
schedule('0 * * * *', () => {
    const gridPrice = getState('nomosenergy.0.prices.current_Price').val;
    const solarExcess = getState('your.solar.excess_power').val;

    if (gridPrice < 0) {
        // Negative pricing - use as much grid power as possible
        setState('your.battery.mode', 'charge');
        log('Charging battery - negative electricity prices!');
    } else if (solarExcess > 0 && gridPrice > 0.25) {
        // Expensive grid, excess solar - charge battery with solar
        setState('your.battery.mode', 'charge_solar');
    }
});
```

## Best Practices

1. **Time Zones**: All timestamps and scheduling use Berlin local time (Europe/Berlin) to match price periods.

2. **Error Handling**: Always check if price states are `null` before using them, as data may take time to load.

3. **Update Timing**: Prices update hourly on Berlin time. Automations should account for this delay.

4. **API Limits**: Respect Nomos Energy API rate limits. The adapter already handles this with 1-hour polling.

5. **Fallbacks**: Implement fallback logic for when price data is unavailable.

6. **Testing**: Test automations with different price scenarios before deploying in production.

For more examples or help, check the [ioBroker Community Forum](https://forum.iobroker.net) or create an issue on GitHub.

# ioBroker.nomosenergy

[![NPM version](https://img.shields.io/npm/v/iobroker.nomosenergy.svg)](https://www.npmjs.com/package/iobroker.nomosenergy)
[![Downloads](https://img.shields.io/npm/dm/iobroker.nomosenergy.svg)](https://www.npmjs.com/package/iobroker.nomosenergy)
![Number of Installations](https://iobroker.live/badges/nomosenergy-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/nomosenergy-stable.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## Table of Contents

- [Introduction](#introduction)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Troubleshooting](#troubleshooting)
- [Changelog](#changelog)
- [License](#license)

## Introduction

The **ioBroker.nomosenergy** adapter fetches real-time electricity price data from the [Nomos Energy](https://nomos.energy) API, which provides wholesale energy prices for Germany and Luxembourg. Prices are retrieved hourly for the current and next day, displayed in cents per kilowatt-hour (ct/kWh), and automatically adjusted to the European time zone (Europe/Berlin, handling Daylight Saving Time).

This adapter is ideal for smart home automation, allowing you to:
- Monitor hourly electricity costs.
- Create automations based on price thresholds (e.g., run appliances during cheap electricity hours).
- Visualize price trends using charts in ioBroker VIS.

The adapter runs as a daemon, polling the API hourly and updating ioBroker states dynamically.

## Installation

### Stable Release (Recommended)
1. Open the ioBroker Admin interface in your browser.
2. Navigate to **Adapters**.
3. Search for "nomosenergy".
4. Click **Install** on the adapter.
5. Restart ioBroker if prompted.

### Development/Build from Source
```bash
git clone https://github.com/michije/ioBroker.nomosenergy.git
cd ioBroker.nomosenergy
npm install
npm run build
```
Restart ioBroker Admin to load the adapter.

**Requirements:**
- Node.js >= 18
- ioBroker js-controller >= 6.0.11
- ioBroker admin >= 7.4.21

## Configuration

After installation, configure the adapter instance:

1. In ioBroker Admin, go to **Instances** and select your nomosenergy adapter.
2. Open the configuration window.
3. Obtain credentials from your [Nomos Energy account](https://nomos.energy/dashboard):
   - **Client ID**: Your API client identifier.
   - **Client Secret**: Your API client secret (stored encrypted).
4. Enter the credentials and save.
5. Start the adapter instance.

**Notes:**
- The adapter assumes your Nomos subscription is for Germany/Luxembourg (Europe/Berlin timezone).
- Prices are fetched for the current day and the next day.
- Hourly updates occur at the top of each hour (Berlin time).

## Usage

Once configured and running, the adapter creates the following states in your ioBroker objects tree (under `nomosenergy.0` or your instance ID):

### Price States
- **prices_today.0** to **prices_today.23**: Hourly prices for today (Berlin time).
- **prices_tomorrow.0** to **prices_tomorrow.23**: Hourly prices for tomorrow (Berlin time).
- **prices.current_Price**: Current hourly price based on the current Berlin hour.

All price states have:
- Type: `number`
- Unit: `ct/kWh`
- Role: `value`

### Information States
- **info.last_update_time**: ISO timestamp of the last successful update (e.g., "2025-09-25T09:00:00.000Z").
- **info.last_update_success**: Boolean indicating if the last update succeeded.

### Chart Configuration
- **prices.chart_config**: JSON configuration for ECharts visualization (line chart with color gradient: green for <0.2 ct/kWh, yellow for 0.2-0.3 ct/kWh, red for >0.3 ct/kWh).

### Examples
- Create VIS widgets to display current prices or trends.
- Set up scenes to turn on devices when `prices.current_Price` < 0.2.
- Use scripts to schedule tasks based on hourly forecasts.

For advanced integration examples, see [docs/USAGE.md](docs/USAGE.md).

## Troubleshooting

### Common Issues
- **Authentication Failed**: Check your client ID and secret in configuration. Ensure your Nomos account has an active subscription.
- **No Prices Loaded**: Verify API availability; the adapter logs errors. Possible rate limiting from Nomos API.
- **Hourly Updates Not Occurring**: Confirm adapter is running (check instance status). Berlin timezone issues may cause offset—logs will show "Berlin time".
- **Visualization Not Working**: Ensure VIS is installed and add a "JSON" widget with `prices.chart_config` state.

### Logs and Debugging
- View logs in ioBroker Admin → Logs, filter by "nomosenergy".
- Check states in Objects tab for populated data.
- Run `npm run test` if building from source (relations tests may exist).

### Support
- [Open an Issue](https://github.com/michije/ioBroker.nomosenergy/issues) on GitHub for bugs.
- Consult the [ioBroker Community](https://forum.iobroker.net) forum.

## Changelog

### 0.2.1 (2025-07-10)
- Fixed minor bugs and dependency updates.

### 0.2.0 (2025-04-08)
- Added timezone handling for Europe/Berlin (handles DST).

### 0.1.6 (2025-04-03)
- Adapted to API changes.

### 0.1.5 (2025-03-05)
- Fixed ongoing npm publishing issues.

### 0.1.3 (2025-03-04)
- Recreated package lock for stability.

### 0.1.2 (2025-03-04)
- Re-released for npm compliance.

### 0.1.1 (2025-03-04)
- Fixed topic alignment in changelog.

### 0.1.0 (2025-03-03)
- Switched endpoint from sandbox to production.

### 0.0.4 (2025-02-28)
- Fixed main file reference.

### 0.0.3 (2025-02-28)
- Fixed main file include.

### 0.0.2 (2025-02-28)
- Fixed main file compilation.

### 0.0.1 (2025-02-28)
- Initial release.

## License

MIT License

Copyright (c) 2025 michije

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE USE OR OTHER DEALINGS IN THE SOFTWARE.

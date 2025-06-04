import sinon from "sinon";
import proxyquireModule from "proxyquire";
import { utils } from "@iobroker/testing";
let expect: any;

const { createMocks, createAsserts } = utils.unit;
const { mockAdapterCore } = require("@iobroker/testing/build/tests/unit/mocks/mockAdapterCore");

describe("Nomosenergy main module", () => {
    let database: any;
    let adapter: any;
    let instance: any;
    let asserts: any;

    before(async () => {
        const chai = await import("chai");
        expect = chai.expect;
    });

    beforeEach(() => {
        ({ database, adapter } = createMocks({}));
        const mockedCore = mockAdapterCore(database);
        const proxyquire = proxyquireModule.noCallThru();
        const createInstance = proxyquire("./main", {
            "@iobroker/adapter-core": mockedCore,
        });
        instance = createInstance();
        asserts = createAsserts(database, instance);
    });

    afterEach(() => {
        sinon.restore();
        adapter.resetMockHistory();
        database.clear();
    });

    it("converts UTC to Berlin time correctly", () => {
        const winterUTC = new Date("2024-01-01T12:00:00Z");
        const winterBerlin = instance.utcToBerlin(winterUTC);
        expect(winterBerlin.toISOString()).to.equal("2024-01-01T13:00:00.000Z");

        const summerUTC = new Date("2024-07-01T12:00:00Z");
        const summerBerlin = instance.utcToBerlin(summerUTC);
        expect(summerBerlin.toISOString()).to.equal("2024-07-01T14:00:00.000Z");
    });

    it("stores price data in states", async () => {
        const clock = sinon.useFakeTimers({ now: Date.UTC(2024, 0, 1, 10, 0, 0) });

        const priceData = {
            items: [
                { timestamp: "2024-01-01T12:00:00Z", amount: 0.25 },
                { timestamp: "2024-01-02T12:00:00Z", amount: 0.27 },
            ],
        };

        await instance.storePrices(priceData);

        asserts.assertStateHasValue(`${instance.namespace}.prices_today.13`, 0.25);
        asserts.assertStateHasValue(`${instance.namespace}.prices_tomorrow.13`, 0.27);
        asserts.assertStateExists(`${instance.namespace}.prices.chart_config`);

        clock.restore();
    });

    it("updates current price from today's values", async () => {
        const clock = sinon.useFakeTimers({ now: Date.UTC(2024, 0, 1, 12, 30, 0) });
        database.publishState("nomosenergy.0.prices_today.13", { val: 0.42, ack: true });

        await instance.updateCurrentPrice();

        asserts.assertStateHasValue(`${instance.namespace}.prices.current_Price`, 0.42);

        clock.restore();
    });
});

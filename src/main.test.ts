import proxyquire from 'proxyquire';

let expect: any;
let sinon: any;

before(async () => {
    const chai = await import('chai');
    expect = chai.expect;
    sinon = (await import('sinon')).default;
});

/**
 * Create the adapter under test with stubs for axios and adapter-core
 */
function getAdapter(stubs: { axios?: any; config?: any }) {
    const axiosStub = stubs.axios || { post: sinon.stub(), get: sinon.stub() };
    class AdapterMock {
        public config: any;
        public log = { info: sinon.stub(), error: sinon.stub(), debug: sinon.stub(), warn: sinon.stub() };
        constructor(options: any = {}) {
            this.config = options.config || {};
        }
        on = sinon.stub();
        setObjectNotExistsAsync = sinon.stub().resolves();
        setStateAsync = sinon.stub().resolves();
        getStateAsync = sinon.stub().resolves(null);
    }
    const createAdapter: (opts?: any) => any = proxyquire.noCallThru()('./main', {
        axios: axiosStub,
        '@iobroker/adapter-core': { Adapter: AdapterMock }
    });
    return { instance: createAdapter({ config: stubs.config || {} }), axiosStub };
}

describe('Nomosenergy', () => {
    describe('utcToBerlin', () => {
        it('converts winter time correctly', () => {
            const { instance } = getAdapter({});
            const utc = new Date('2023-01-01T00:00:00Z');
            const berlin = instance.utcToBerlin(utc);
            expect(berlin.getFullYear()).to.equal(2023);
            expect(berlin.getMonth()).to.equal(0); // January
            expect(berlin.getDate()).to.equal(1);
            expect(berlin.getHours()).to.equal(1); // UTC+1
        });

        it('converts summer time correctly', () => {
            const { instance } = getAdapter({});
            const utc = new Date('2023-06-01T00:00:00Z');
            const berlin = instance.utcToBerlin(utc);
            expect(berlin.getHours()).to.equal(2); // UTC+2
        });
    });

    describe('authenticate', () => {
        it('returns token when request succeeds', async () => {
            const axiosStub = { post: sinon.stub().resolves({ data: { access_token: 'abc' } }) };
            const { instance } = getAdapter({ axios: axiosStub, config: { client_id: 'id', client_secret: 'secret' } });
            const token = await instance.authenticate();
            expect(token).to.equal('abc');
        });

        it('throws when credentials are missing', async () => {
            const { instance } = getAdapter({});
            await expect(instance.authenticate()).to.be.rejectedWith('Client ID or Client Secret not configured');
        });
    });

    describe('getSubscriptionId', () => {
        it('extracts the first subscription id', async () => {
            const axiosStub = { get: sinon.stub().resolves({ data: { items: [{ id: 'sub1' }, { id: 'sub2' }] } }) };
            const { instance } = getAdapter({ axios: axiosStub });
            const id = await instance.getSubscriptionId('token');
            expect(id).to.equal('sub1');
        });

        it('throws when no subscriptions are returned', async () => {
            const axiosStub = { get: sinon.stub().resolves({ data: { items: [] } }) };
            const { instance } = getAdapter({ axios: axiosStub });
            await expect(instance.getSubscriptionId('token')).to.be.rejectedWith('No subscriptions found');
        });
    });
});

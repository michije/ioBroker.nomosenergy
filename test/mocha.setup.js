'use strict';

process.env.TS_NODE_IGNORE_WARNINGS = 'TRUE';
process.env.TS_NODE_PROJECT = 'tsconfig.json';
process.env.TS_NODE_FILES = 'TRUE';

process.on('unhandledRejection', (e) => {
    throw e;
});

const sinonChai = require('sinon-chai');
const chaiAsPromised = require('chai-as-promised');
const { should, use } = require('chai');

should();
use(sinonChai.default || sinonChai);
use(chaiAsPromised.default || chaiAsPromised);


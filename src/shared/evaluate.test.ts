import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isValidHomePath, normalizeAppPath, normalizeConfig, ruleHasTargets, userMatchesRule } from './evaluate';

const context = { roleIds: ['r1'], policyIds: ['p1'] } as Parameters<typeof userMatchesRule>[1];

test('a rule without targets matches nobody', () => {
	assert.equal(ruleHasTargets({}), false);
	assert.equal(userMatchesRule({}, context), false);
	assert.equal(userMatchesRule({ roles: ['r1'] }, context), true);
	assert.equal(userMatchesRule({ policies: ['p1'] }, context), true);
	assert.equal(userMatchesRule({ roles: ['other'] }, context), false);
});

test('normalizeConfig returns a usable config from junk', () => {
	for (const raw of [null, 'junk', 7, []]) assert.equal(typeof normalizeConfig(raw), 'object');
});

test('home paths must be in-app paths', () => {
	assert.equal(isValidHomePath('https://evil.test/'), false);
	assert.equal(isValidHomePath('//evil.test/'), false);
	assert.equal(isValidHomePath(null), false);
	assert.equal(isValidHomePath('/content'), true);
	assert.equal(normalizeAppPath(null), null);
});

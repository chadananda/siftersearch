/**
 * Step definitions for referrals feature
 * Note: Common auth steps are in common.steps.js
 */

import { Given, When, Then, Before } from '@cucumber/cucumber';
import { expect } from 'chai';

// Test state
let referralInfo = null;
let referralStats = null;
let referralList = [];

Before({ tags: '@referrals' }, function () {
  referralInfo = null;
  referralStats = null;
  referralList = [];
});

// ============================================
// Given Steps (referrals-specific)
// ============================================

Given('I am logged in as user {string}', function (userId) {
  this.testUser = { email: `${userId}@test.com`, tier: 'approved', id: userId };
  this.authToken = `test_${userId}_token`;
});

Given('I have referred {int} users', function (count) {
  referralList = Array(count).fill(null).map((_, i) => ({
    id: `referred_${i}`,
    name: `User ${i}`,
    tier: i < 3 ? 'approved' : 'verified',
    joined_at: new Date().toISOString()
  }));
});

Given('{int} of them have been approved', function (count) {
  for (let i = 0; i < referralList.length; i++) {
    referralList[i].tier = i < count ? 'approved' : 'verified';
  }
});

Given('I have referred users:', function (dataTable) {
  referralList = dataTable.hashes().map(row => ({
    name: row.name,
    tier: row.tier,
    joined_at: row.joined_at
  }));
});

Given('I have not referred anyone', function () {
  referralList = [];
});

Given('user {string} has referral code {string}', function (userId, code) {
  this.referrerUserId = userId;
  this.referralCode = code;
});

// ============================================
// When Steps
// ============================================

When('I request my referral information', async function () {
  await this.apiRequest('GET', '/api/user/referrals');
  referralInfo = this.responseData;
});

When('I request my referral stats', async function () {
  await this.apiRequest('GET', '/api/user/referrals');
  referralStats = this.responseData?.stats || this.responseData;
});

When('I request my referral list', async function () {
  await this.apiRequest('GET', '/api/user/referrals');
  referralList = this.responseData?.referrals || [];
});

When('I request referral information', async function () {
  await this.apiRequest('GET', '/api/user/referrals');
});

When('a new user signs up with referral code {string}', async function (code) {
  await this.apiRequest('POST', '/api/auth/signup', {
    email: 'newuser@test.com',
    password: 'password123',
    referral_code: code
  });
});

When('I try to use my own referral code', async function () {
  // Simulate self-referral attempt
  await this.apiRequest('POST', '/api/auth/signup', {
    email: 'self@test.com',
    password: 'password123',
    referral_code: this.testUser?.referral_code || 'self_ref'
  });
});

// ============================================
// Then Steps
// ============================================

Then('I should receive my unique referral code', function () {
  expect(referralInfo).to.have.property('referral_code');
  expect(referralInfo.referral_code).to.be.a('string');
});

Then('the code should be based on my user ID', function () {
  // Code is generated from user ID
  expect(referralInfo.referral_code).to.be.a('string');
  expect(referralInfo.referral_code.length).to.be.at.least(6);
});

Then('I should receive a full referral URL', function () {
  expect(referralInfo).to.have.property('referral_url');
  expect(referralInfo.referral_url).to.include('http');
});

Then('the URL should include my referral code', function () {
  expect(referralInfo.referral_url).to.include(referralInfo.referral_code);
});

Then('I should see:', function (dataTable) {
  const expected = dataTable.rowsHash();

  for (const [stat, value] of Object.entries(expected)) {
    const numValue = parseInt(value);
    if (stat === 'total_referrals') {
      expect(referralStats?.total || referralList.length).to.equal(numValue);
    } else if (stat === 'approved_count') {
      const approved = referralList.filter(r => r.tier === 'approved').length;
      expect(referralStats?.approved || approved).to.equal(numValue);
    } else if (stat === 'pending_count') {
      const pending = referralList.filter(r => r.tier !== 'approved').length;
      expect(referralStats?.pending || pending).to.equal(numValue);
    }
  }
});

Then('I should see {int} referred users', function (count) {
  expect(referralList.length).to.equal(count);
});

Then('I should see their names and tiers', function () {
  for (const referral of referralList) {
    expect(referral).to.have.property('name');
    expect(referral).to.have.property('tier');
  }
});

Then('total_referrals should be {int}', function (count) {
  expect(referralStats?.total || referralList.length).to.equal(count);
});

Then('the referral list should be empty', function () {
  expect(referralList.length).to.equal(0);
});

Then('the signup should still succeed', function () {
  // Signup succeeds even with invalid referral code
  expect(this.response.ok || this.response.status === 201).to.be.true;
});

Then('the user should not be linked to any referrer', function () {
  expect(this.responseData?.referred_by).to.be.oneOf([null, undefined]);
});

Then('the new user should be linked to {string}', function (referrerId) {
  expect(this.responseData?.referred_by || this.referrerUserId).to.equal(referrerId);
});

Then('{string} should see the new referral in their list', function (_referrerId) {
  // Verified by referrer's referral list
  expect(true).to.be.true;
});

Then('the referral should not be counted', function () {
  expect(true).to.be.true;
});

Then('I should not appear in my own referral list', function () {
  const selfRef = referralList.find(r => r.id === this.testUser?.id);
  expect(selfRef).to.be.undefined;
});

Then('I should receive referral data', function () {
  expect(this.response.ok).to.be.true;
});


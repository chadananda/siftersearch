@donations
Feature: Donation and Subscription System
  As a user who wants to support SifterSearch
  I want to make donations and manage subscriptions
  So that I can contribute to the project financially

  # ============================================
  # IMPLEMENTED - Donation Tiers
  # ============================================

  @implemented @api
  Scenario: Get available donation tiers
    When I request the donation tiers
    Then I should see available tiers:
      | id         | name       | monthly | yearly | once  |
      | supporter  | Supporter  | 5       | 50     | 10    |
      | patron     | Patron     | 15      | 150    | 25    |
      | benefactor | Benefactor | 50      | 500    | 100   |

  @implemented @api
  Scenario: Each tier has description
    When I request the donation tiers
    Then each tier should have a description
    And patron and benefactor should have upgradeTier set

  # ============================================
  # IMPLEMENTED - Checkout Session Creation
  # ============================================

  @implemented @api
  Scenario: Create checkout session for monthly donation
    Given I am logged in as an approved user
    When I create a checkout session:
      | tierId    | supporter |
      | frequency | monthly   |
    Then I should receive a checkout URL
    And the URL should be a valid Stripe URL

  @implemented @api
  Scenario: Create checkout session for yearly donation
    Given I am logged in as an approved user
    When I create a checkout session:
      | tierId    | patron |
      | frequency | yearly |
    Then I should receive a checkout URL

  @implemented @api
  Scenario: Create checkout session for one-time donation
    Given I am logged in as an approved user
    When I create a checkout session:
      | tierId    | benefactor |
      | frequency | once       |
    Then I should receive a checkout URL
    And the session mode should be "payment"

  @implemented @api
  Scenario: Create checkout with custom amount
    Given I am logged in as an approved user
    When I create a checkout session:
      | tierId       | custom |
      | frequency    | once   |
      | customAmount | 75     |
    Then I should receive a checkout URL
    And the amount should be 75 dollars

  @implemented @api
  Scenario: Anonymous user can create checkout
    Given I am an anonymous user
    When I create a checkout session:
      | tierId    | supporter |
      | frequency | once      |
    Then I should receive a checkout URL
    And metadata should contain userId "anonymous"

  @implemented @api
  Scenario: Invalid tier returns error
    Given I am logged in as an approved user
    When I create a checkout with invalid tier "fake_tier"
    Then I should receive a 400 bad request error
    And the error should mention "Invalid donation tier"

  # ============================================
  # IMPLEMENTED - Webhook Handling
  # ============================================

  @implemented @api @webhook
  Scenario: Handle checkout.session.completed
    Given a valid Stripe webhook signature
    When I receive a checkout.session.completed event:
      | session_id | sess_123       |
      | customer   | cus_456        |
      | amount     | 500            |
      | tierId     | supporter      |
      | frequency  | monthly        |
      | userId     | user_789       |
    Then a donation record should be created
    And the user's stripe_customer_id should be updated

  @implemented @api @webhook
  Scenario: Handle subscription creation for patron tier
    Given a valid Stripe webhook signature
    And user "user_123" made a patron subscription
    When I receive a checkout.session.completed event
    Then the user's tier should be upgraded to "patron"

  @implemented @api @webhook
  Scenario: Handle subscription cancellation
    Given a user has an active patron subscription
    When I receive a customer.subscription.deleted event
    Then the donation status should be "canceled"
    And the user should be downgraded if no other active subscriptions

  @implemented @api @webhook
  Scenario: Handle invoice.paid event
    Given a user has a subscription
    When I receive an invoice.paid event
    Then the donation status should be updated to "active"

  @implemented @api @webhook
  Scenario: Invalid webhook signature is rejected
    Given an invalid Stripe webhook signature
    When I send a webhook event
    Then I should receive a 400 error
    And the error should mention "Invalid signature"

  # ============================================
  # IMPLEMENTED - Donation History
  # ============================================

  @implemented @api
  Scenario: View my donation history
    Given I am logged in as an approved user
    And I have made 3 donations
    When I request my donation history
    Then I should see 3 donations
    And each donation should include:
      | field      |
      | id         |
      | amount     |
      | currency   |
      | frequency  |
      | status     |
      | created_at |

  @implemented @api
  Scenario: Donation history requires authentication
    Given I am an anonymous user
    When I request donation history
    Then I should receive a 401 unauthorized error

  @implemented @api
  Scenario: Donation history is limited to 50 entries
    Given I am logged in as an approved user
    And I have made 100 donations
    When I request my donation history
    Then I should see at most 50 donations

  # ============================================
  # IMPLEMENTED - Customer Portal
  # ============================================

  @implemented @api
  Scenario: Access customer billing portal
    Given I am logged in as an approved user
    And I have a stripe_customer_id
    When I request a portal session
    Then I should receive a portal URL
    And the URL should be a valid Stripe billing portal URL

  @implemented @api
  Scenario: Portal requires existing customer
    Given I am logged in as an approved user
    And I have no stripe_customer_id
    When I request a portal session
    Then I should receive a 400 bad request error
    And the error should mention "No active subscription"

  @implemented @api
  Scenario: Portal requires authentication
    Given I am an anonymous user
    When I request a portal session
    Then I should receive a 401 unauthorized error

  # ============================================
  # UI TESTS
  # ============================================

  @pending @ui
  Scenario: Support page displays donation tiers
    Given I navigate to the support page
    Then I should see three donation tiers
    And each tier should show monthly, yearly, and one-time prices

  @pending @ui
  Scenario: Frequency toggle changes displayed prices
    Given I am on the support page
    When I toggle to "yearly" frequency
    Then all tier prices should update to yearly amounts

  @pending @ui
  Scenario: Custom amount input appears for custom tier
    Given I am on the support page
    When I select "Custom amount"
    Then a number input should appear
    And I should be able to enter a custom amount

  @pending @ui
  Scenario: Checkout redirects to Stripe
    Given I am logged in and on the support page
    When I click donate on a tier
    Then I should be redirected to Stripe checkout

  @pending @ui
  Scenario: Success page displays after donation
    Given I completed a Stripe checkout
    When I am redirected to the success page
    Then I should see a thank you message
    And I should see options to continue or manage subscription

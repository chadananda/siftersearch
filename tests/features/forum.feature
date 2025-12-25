@forum
Feature: Community Forum
  As a verified user
  I want to participate in community discussions
  So that I can share knowledge and learn from others

  Background:
    Given the forum database tables are initialized

  # ============================================
  # IMPLEMENTED - Viewing Posts
  # ============================================

  @implemented @api
  Scenario: List forum posts as anonymous user
    Given I am an anonymous user
    When I request the forum posts list
    Then I should see a list of posts
    And each post should include:
      | field      |
      | id         |
      | title      |
      | author     |
      | created_at |
      | vote_count |
      | reply_count|

  @implemented @api
  Scenario: List posts with sorting
    Given there are multiple forum posts
    When I request posts sorted by "popular"
    Then posts should be sorted by vote_count descending

  @implemented @api
  Scenario: List posts with category filter
    Given there are posts in different categories
    When I request posts in category "discussions"
    Then I should only see posts in "discussions" category

  @implemented @api
  Scenario: View single post with replies
    Given there is a post with ID "post_123"
    And the post has 5 replies
    When I request post "post_123"
    Then I should see the post content
    And I should see 5 replies
    And replies should be threaded

  # ============================================
  # IMPLEMENTED - Creating Posts
  # ============================================

  @implemented @api
  Scenario: Create post as verified user
    Given I am logged in as a verified user
    When I create a post:
      | title    | My Question About Faith    |
      | content  | I've been wondering about...|
      | category | questions                  |
    Then the post should be created
    And I should be the author

  @implemented @api
  Scenario: Cannot create post as anonymous user
    Given I am an anonymous user
    When I try to create a post
    Then I should receive a 401 unauthorized error

  @implemented @api
  Scenario: Post title is required
    Given I am logged in as a verified user
    When I create a post without a title
    Then I should receive a validation error
    And the error should mention "title required"

  @implemented @api
  Scenario: Post content minimum length
    Given I am logged in as a verified user
    When I create a post with content "Hi"
    Then I should receive a validation error
    And the error should mention minimum content length

  # ============================================
  # IMPLEMENTED - Replying to Posts
  # ============================================

  @implemented @api
  Scenario: Reply to a post
    Given I am logged in as a verified user
    And there is a post with ID "post_456"
    When I reply to post "post_456" with:
      | content | Great question! Here's my perspective... |
    Then the reply should be created
    And the post's reply_count should increase

  @implemented @api
  Scenario: Reply to a reply (threading)
    Given I am logged in as a verified user
    And there is a reply with ID "reply_789"
    When I reply to reply "reply_789" with:
      | content | I agree with this point... |
    Then a nested reply should be created
    And the parent_id should be "reply_789"

  @implemented @api
  Scenario: Maximum nesting depth is enforced
    Given I am logged in as a verified user
    And there is a reply at nesting level 5
    When I try to reply to it
    Then the reply should be flattened to level 5

  # ============================================
  # IMPLEMENTED - Voting
  # ============================================

  @implemented @api
  Scenario: Upvote a post
    Given I am logged in as a verified user
    And there is a post with vote_count 5
    When I upvote the post
    Then the post's vote_count should be 6
    And my vote should be recorded

  @implemented @api
  Scenario: Downvote a post
    Given I am logged in as a verified user
    And there is a post with vote_count 5
    When I downvote the post
    Then the post's vote_count should be 4

  @implemented @api
  Scenario: Change vote from up to down
    Given I am logged in as a verified user
    And I have upvoted a post
    When I downvote the same post
    Then my vote should change to downvote
    And the vote_count should decrease by 2

  @implemented @api
  Scenario: Remove my vote
    Given I am logged in as a verified user
    And I have voted on a post
    When I remove my vote
    Then my vote should be deleted
    And the vote_count should adjust accordingly

  @implemented @api
  Scenario: Cannot vote without authentication
    Given I am an anonymous user
    When I try to vote on a post
    Then I should receive a 401 unauthorized error

  # ============================================
  # IMPLEMENTED - Editing and Deleting
  # ============================================

  @implemented @api
  Scenario: Edit my own post
    Given I am logged in as a verified user
    And I have created a post
    When I edit my post with new content
    Then the post content should be updated
    And updated_at should change

  @implemented @api
  Scenario: Cannot edit another user's post
    Given I am logged in as a verified user
    And there is a post by another user
    When I try to edit that post
    Then I should receive a 403 forbidden error

  @implemented @api
  Scenario: Admin can edit any post
    Given I am logged in as an admin
    And there is a post by a regular user
    When I edit that post
    Then the post should be updated

  @implemented @api
  Scenario: Delete my own post
    Given I am logged in as a verified user
    And I have created a post
    When I delete my post
    Then the post should be soft-deleted
    And it should not appear in listings

  # ============================================
  # IMPLEMENTED - Categories
  # ============================================

  @implemented @api
  Scenario: List available categories
    When I request forum categories
    Then I should see available categories:
      | id          | name             |
      | discussions | Discussions      |
      | questions   | Questions        |
      | resources   | Resources        |
      | introductions| Introductions   |

  # ============================================
  # UI TESTS
  # ============================================

  @pending @ui
  Scenario: Forum listing page displays posts
    Given I navigate to the community page
    Then I should see a list of forum posts
    And each post should show title, author, and vote count
    And I should see category filter options

  @pending @ui
  Scenario: Create post form validation
    Given I am logged in and on the new post page
    When I submit the form with empty title
    Then I should see a validation error
    And the form should not submit

  @pending @ui
  Scenario: Voting updates count in real-time
    Given I am logged in and viewing a post
    When I click the upvote button
    Then the vote count should increase immediately
    And the upvote button should show as active

  @pending @ui
  Scenario: Reply form appears on reply button click
    Given I am logged in and viewing a post
    When I click reply on a comment
    Then a reply form should appear
    And I should be able to submit my reply

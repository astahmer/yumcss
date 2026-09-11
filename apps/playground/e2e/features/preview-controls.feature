Feature: Interactive example variants
  Preview controls re-evaluate the same default-exported component with each authored prop choice.

  Scenario: the variants preview exposes every combination
    Given I open the playground route "/variants"
    When I choose "sm" from preview control "size"
    And I choose "danger" from preview control "tone"
    Then the variant preview button uses background "rgb(229, 62, 62)" and padding "8px"

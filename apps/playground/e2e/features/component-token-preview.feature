Feature: Theme-aware component token preview
  Component token refs stay in the rendered component while theme changes
  rebind the semantic values and keep the explanation honest.

  Scenario: the preview explanation follows the active theme
    Given I open the playground route "/component-tokens"
    When I click the "light" button
    Then the component-token preview uses background "rgb(229, 231, 235)"
    When I click the "dark" button
    Then the component-token preview uses background "rgb(55, 65, 81)"

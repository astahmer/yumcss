Feature: Playground editor typings
  Built-in examples use the same generated design-system declarations as the
  application compiler, so valid playground code should not show diagnostics.

  Scenario Outline: a built-in API example is type-safe
    Given I open the playground route "<route>"
    Then the page heading is "<heading>"
    And the editor has no TypeScript error markers
    And the editor has syntax highlighting

    Examples:
      | route              | heading                    |
      | /                  | Basics                     |
      | /dynamic           | Dynamic styling            |
      | /responsive        | Responsive                 |
      | /container-queries | Container queries          |
      | /conflicts         | Conflicts                  |
      | /token-bindings    | Named token bindings       |
      | /component-tokens  | Component token contracts |
      | /variants          | Variants                   |
      | /groups            | Groups                     |

  Scenario: an inspector section has enough room to show its content
    Given I open the playground route "/variants"
    When I expand the "Generated CSS" inspector panel
    Then the "Generated CSS" inspector panel has room for content
    When I collapse the "Generated CSS" inspector panel
    Then the "Generated CSS" inspector panel is collapsed

  Scenario: inspector separators follow visible panel ownership
    Given I open the playground route "/basics?api=tw"
    Then the collapsed inspector separators match their visible sizes
    And the "Resize live-preview and execution-evidence" inspector separator is disabled
    When I expand the "Execution evidence" inspector panel
    Then the "Resize live-preview and execution-evidence" inspector separator is enabled

  Scenario: CSS Basics renders with the Tailwind adapter
    Given I open the playground route "/basics?api=css&adapter=tailwind"
    Then the page heading is "Basics"
    And the "Class string" inspector panel contains "bg-blue-500"

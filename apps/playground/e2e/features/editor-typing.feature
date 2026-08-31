Feature: Playground editor typings
  Built-in examples use the same generated design-system declarations as the
  application compiler, so valid playground code should not show diagnostics.

  Scenario Outline: a built-in API example is type-safe
    Given I open the playground route "<route>"
    Then the page heading is "<heading>"
    And the editor has no TypeScript error markers

    Examples:
      | route             | heading          |
      | /                 | Basics           |
      | /conflicts        | Conflicts        |
      | /semantic-tokens  | Semantic tokens  |
      | /responsive       | Responsive       |
      | /atoms            | css() atoms      |

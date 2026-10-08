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

  Scenario: switching adapters keeps preview classes aligned with the inspector
    Given I open the playground route "/basics?api=css"
    When I choose "Panda" from "Select class name adapter"
    Then the "Class string" inspector panel contains "bg-c_$blue-500"
    And the preview button classes match the class string inspector
    And the variant preview button uses background "rgb(49, 130, 206)" and padding "16px"
    When I choose "danger" from preview control "tone"
    Then the "Class string" inspector panel contains "bg-c_$red-500"
    And the preview button classes match the class string inspector
    And the variant preview button uses background "rgb(229, 62, 62)" and padding "16px"

    When I choose "Tailwind CSS" from "Select class name adapter"
    Then the "Class string" inspector panel contains "[background-color:#E53E3E]"
    And the preview button classes match the class string inspector
    And the variant preview button uses background "rgb(229, 62, 62)" and padding "16px"

  Scenario Outline: selected adapter classes render in each own API preview
    Given I open the playground route "/basics?api=<api>&adapter=<adapter>"
    Then the preview button classes match the class string inspector
    And the variant preview button uses background "rgb(49, 130, 206)" and padding "16px"
    And the preview button has no inline declarations
    And disabling the native preview stylesheet removes the button background

    Examples:
      | api | adapter     |
      | css | panda       |
      | dss | panda       |
      | css | unocss      |
      | dss | unocss      |
      | css | tailwind    |
      | dss | tailwind    |
      | css | named-atoms |
      | css | atomic      |
      | dss | stylex      |

  Scenario Outline: the native compiler owns conditional styling
    Given I open the native hover fixture with adapter "<adapter>"
    Then the preview button classes match the class string inspector
    And the variant preview button uses background "rgb(49, 130, 206)" and padding "16px"
    And the preview button has no inline declarations
    When I hover the preview button
    Then the variant preview button uses background "rgb(229, 62, 62)" and padding "16px"

    Examples:
      | adapter     |
      | atomic      |
      | named-atoms |
      | panda       |
      | unocss      |
      | tailwind    |
      | stylex      |

  Scenario: unsupported native semantics display an error
    Given I open the unsupported StyleX selector fixture
    Then the page contains the text "StyleX does not support selector '.dark &'"
    And the live preview document is absent

  Scenario Outline: native engines preserve vars runtime companion rules
    Given I open the vars fixture with adapter "<adapter>"
    Then the variant preview button uses background "rgb(49, 130, 206)" and padding "16px"

    Examples:
      | adapter     |
      | atomic      |
      | named-atoms |
      | panda       |
      | unocss      |
      | tailwind    |
      | stylex      |

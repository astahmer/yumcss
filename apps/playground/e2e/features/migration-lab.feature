Feature: Playground migration examples
  The playground exposes the same registry-backed migration use case as the
  CLI, so users can inspect source adapters, target adapters, emitted code,
  validation, and residuals in a browser.

  Background:
    Given I open the playground migration examples

  @smoke
  Scenario: the default migration lane is visible
    Then the page heading is "Migration examples"
    And the editor has no TypeScript error markers
    And the "from · source adapter" selector has value "styled-components"
    And the "to · target adapter" selector has value "pandwind"
    And the output pane for "Pandwind" is visible
    And the "Canonical validation" panel is visible

  Scenario: a user can route another source adapter to Pandwind
    When I choose "Emotion" from "from · source adapter"
    And I choose "Pandwind" from "to · target adapter"
    Then the "from · source adapter" selector has value "emotion"
    And the output pane for "Pandwind" contains "pandwind"
    And the migration summary reports "yes" for "changed"

  Scenario: resetting a source restores its canonical sample
    When I choose "Chakra Ui" from "from · source adapter"
    And I click the "reset" button
    Then the code editor contains "@chakra-ui/react"
    And the "from · source adapter" selector has value "chakra-ui"

  Scenario: the browser exposes residual and contract evidence
    Then the "Residual report" panel is visible
    And the "Target contract · Pandwind" panel is visible
    And the page contains the text "dynamic-values"

  Scenario Outline: every registered source adapter routes through Pandwind
    When I choose "<sourceLabel>" from "from · source adapter"
    And I choose "Pandwind" from "to · target adapter"
    Then the "from · source adapter" selector has value "<sourceId>"
    And the output pane for "Pandwind" contains "pandwind"

    Examples:
      | sourceLabel       | sourceId         |
      | Pandwind           | pandwind         |
      | Panda              | panda            |
      | Tailwind           | tailwind         |
      | Bamboo             | bamboo           |
      | Chakra Ui          | chakra-ui        |
      | Emotion            | emotion          |
      | Styled Components  | styled-components |
      | Vanilla Extract    | vanilla-extract  |
      | Stitches           | stitches         |
      | Linaria            | linaria           |
      | Mantine            | mantine          |
      | Mui                | mui              |
      | Next Yak           | next-yak          |
      | Jss                | jss              |
      | Stylex             | stylex            |
      | Fela               | fela              |
      | Goober             | goober            |
      | Aphrodite          | aphrodite         |
      | Style9             | style9            |
      | Treat              | treat             |
      | Compiled           | compiled          |
      | Solid Styled       | solid-styled      |
      | Vue Styled         | vue-styled        |
      | React Native       | react-native      |
      | Tokenami           | tokenami          |
      | Unocss             | unocss            |

  Scenario Outline: every registered target adapter is reachable in the browser
    When I choose "<targetLabel>" from "to · target adapter"
    Then the "to · target adapter" selector has value "<targetId>"
    And the output pane for "<targetLabel>" is visible

    Examples:
      | targetLabel       | targetId         |
      | Pandwind          | pandwind         |
      | Panda             | panda            |
      | Tailwind          | tailwind         |
      | Bamboo            | bamboo           |
      | Chakra Ui         | chakra-ui        |
      | Emotion           | emotion          |
      | Styled Components | styled-components |
      | Vanilla Extract   | vanilla-extract  |
      | Stitches          | stitches         |
      | Linaria           | linaria          |
      | Mantine           | mantine          |
      | Mui               | mui              |
      | Next Yak          | next-yak          |
      | Jss               | jss              |
      | Stylex            | stylex            |
      | Fela              | fela              |
      | Goober            | goober            |
      | Aphrodite         | aphrodite         |
      | Style9            | style9            |
      | Treat             | treat             |
      | Compiled          | compiled          |
      | Solid Styled      | solid-styled      |
      | Vue Styled        | vue-styled        |
      | React Native      | react-native      |
      | Tokenami          | tokenami          |
      | Unocss            | unocss            |

  Scenario Outline: every Pandwind API target is reachable in the browser
    When I choose "<targetLabel>" from "to · target adapter"
    Then the "to · target adapter" selector has value "<targetId>"
    And the output pane for "<targetLabel>" is visible

    Examples:
      | targetLabel          | targetId     |
      | Pandwind · css.class | pandwind/css |
      | Pandwind · dss       | pandwind/dss |
      | Pandwind · tw        | pandwind/tw  |

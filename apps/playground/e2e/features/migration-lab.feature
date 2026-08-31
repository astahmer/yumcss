Feature: Playground migration lab
  The playground exposes the same registry-backed migration use case as the
  CLI, so users can inspect source adapters, target adapters, emitted code,
  validation, and residuals in a browser.

  Background:
    Given I open the playground migration lab

  @smoke
  Scenario: the default migration lane is visible
    Then the page heading is "Migration lab"
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

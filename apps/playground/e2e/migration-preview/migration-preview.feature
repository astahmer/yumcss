Feature: Local codebase migration preview
  The Migration Preview evaluates real project source through the shared codemod route.
  Edits remain in memory and the browser only receives serialized snapshots.

  Scenario: evaluate and edit a registered adapter target
    Given I open the local Migration Preview
    Then the source adapter "emotion" is available
    When I choose "css.class" from the "target adapter" selector
    And I click the "Evaluate target" button
    Then the Migration Preview output contains "css.class"
    When I replace the Migration Preview editor with:
      """
      import { css } from "@emotion/css";
      export const Card = css({ color: "blue" });
      """
    And I click the "Apply edit" button
    Then the Migration Preview output contains "blue"

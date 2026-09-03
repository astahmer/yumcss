Feature: Local codebase Studio
  The Studio evaluates real project source through the shared codemod route.
  Edits remain in memory and the browser only receives serialized snapshots.

  Scenario: evaluate and edit a registered adapter target
    Given I open the local Studio
    Then the source adapter "emotion" is available
    When I choose "css.class" from the "target adapter" selector
    And I click the "Evaluate target" button
    Then the Studio output contains "css.class"
    When I replace the Studio editor with:
      """
      import { css } from "@emotion/css";
      export const Card = css({ color: "blue" });
      """
    And I click the "Apply edit" button
    Then the Studio output contains "blue"

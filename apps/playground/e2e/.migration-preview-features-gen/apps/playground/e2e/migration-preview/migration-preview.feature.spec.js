// Generated from: apps/playground/e2e/migration-preview/migration-preview.feature
import { test } from "playwright-bdd";

test.describe('Local codebase migration preview', () => {

  test('evaluate and edit a registered adapter target', async ({ Given, When, Then, And, page }) => { 
    await Given('I open the local Migration Preview', null, { page }); 
    await Then('the source adapter "emotion" is available', null, { page }); 
    await When('I choose "css.class" from the "target adapter" selector', null, { page }); 
    await And('I click the "Evaluate target" button', null, { page }); 
    await Then('the Migration Preview output contains "css.class"', null, { page }); 
    await When('I replace the Migration Preview editor with:', {"docString":{"content":"import { css } from \"@emotion/css\";\nexport const Card = css({ color: \"blue\" });"}}, { page }); 
    await And('I click the "Apply edit" button', null, { page }); 
    await Then('the Migration Preview output contains "blue"', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('apps/playground/e2e/migration-preview/migration-preview.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":6,"pickleLine":5,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":6,"keywordType":"Context","textWithKeyword":"Given I open the local Migration Preview","stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":7,"keywordType":"Outcome","textWithKeyword":"Then the source adapter \"emotion\" is available","stepMatchArguments":[{"group":{"start":19,"value":"\"emotion\"","children":[{"start":20,"value":"emotion","children":[{}]},{"children":[{}]}]},"parameterTypeName":"string"}]},{"pwStepLine":9,"gherkinStepLine":8,"keywordType":"Action","textWithKeyword":"When I choose \"css.class\" from the \"target adapter\" selector","stepMatchArguments":[{"group":{"start":9,"value":"\"css.class\"","children":[{"start":10,"value":"css.class","children":[{}]},{"children":[{}]}]},"parameterTypeName":"string"},{"group":{"start":30,"value":"\"target adapter\"","children":[{"start":31,"value":"target adapter","children":[{}]},{"children":[{}]}]},"parameterTypeName":"string"}]},{"pwStepLine":10,"gherkinStepLine":9,"keywordType":"Action","textWithKeyword":"And I click the \"Evaluate target\" button","stepMatchArguments":[{"group":{"start":12,"value":"\"Evaluate target\"","children":[{"start":13,"value":"Evaluate target","children":[{}]},{"children":[{}]}]},"parameterTypeName":"string"}]},{"pwStepLine":11,"gherkinStepLine":10,"keywordType":"Outcome","textWithKeyword":"Then the Migration Preview output contains \"css.class\"","stepMatchArguments":[{"group":{"start":38,"value":"\"css.class\"","children":[{"start":39,"value":"css.class","children":[{}]},{"children":[{}]}]},"parameterTypeName":"string"}]},{"pwStepLine":12,"gherkinStepLine":11,"keywordType":"Action","textWithKeyword":"When I replace the Migration Preview editor with:","stepMatchArguments":[]},{"pwStepLine":13,"gherkinStepLine":16,"keywordType":"Action","textWithKeyword":"And I click the \"Apply edit\" button","stepMatchArguments":[{"group":{"start":12,"value":"\"Apply edit\"","children":[{"start":13,"value":"Apply edit","children":[{}]},{"children":[{}]}]},"parameterTypeName":"string"}]},{"pwStepLine":14,"gherkinStepLine":17,"keywordType":"Outcome","textWithKeyword":"Then the Migration Preview output contains \"blue\"","stepMatchArguments":[{"group":{"start":38,"value":"\"blue\"","children":[{"start":39,"value":"blue","children":[{}]},{"children":[{}]}]},"parameterTypeName":"string"}]}]},
]; // bdd-data-end
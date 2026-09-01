// Generated from the workspace-linked pandwind package. Do not edit.
import type { RecipeProps } from "./generated/recipes.gen.d.ts";
import type { RecipeKey } from "./use-recipe.d.ts";
import type { SlotRecipeKey } from "./use-slot-recipe.d.ts";
declare const useParentRecipeProps: () => {
    recipe?: import("./recipe.types.d.ts").RecipeDefinition | undefined;
};
interface Props<T> {
    children: React.ReactNode;
    value: RecipeProps<T>;
}
declare function RecipePropsProvider<T extends RecipeKey | SlotRecipeKey>(props: Props<T>): import("react").JSX.Element;
export { RecipePropsProvider, useParentRecipeProps };

// Generated from the workspace-linked pandwind package. Do not edit.
import type { JsxFactoryOptions } from "./factory.types.d.ts";
import { type RecipeKey, type UseRecipeOptions } from "./use-recipe.d.ts";
export declare function createRecipeContext<K extends RecipeKey>(options: UseRecipeOptions<K>): {
    withContext: <T, P>(Component: React.ElementType<any>, options?: JsxFactoryOptions<P>) => React.ForwardRefExoticComponent<React.PropsWithoutRef<P> & React.RefAttributes<T>>;
    PropsProvider: import("react").Provider<Record<string, any>>;
    withPropsProvider: <P>() => React.Provider<Partial<P>>;
    usePropsContext: () => Record<string, any>;
    useRecipeResult: (props: any) => {
        styles: Readonly<import("./css.types.d.ts").SystemStyleObject>;
        className: string;
        props: {
            [x: string]: any;
            [x: number]: any;
            [x: symbol]: any;
        };
    };
};

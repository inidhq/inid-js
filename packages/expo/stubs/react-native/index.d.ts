// The few parts of React Native @inid/expo uses, with the same names as the real types, so the
// monorepo typechecks without installing React Native. Apps get the real ones.
import type { ComponentType, ReactNode } from "react";

export type ViewStyle = object;
export type TextStyle = object;
export type StyleProp<T> = T | null | undefined | false | ReadonlyArray<StyleProp<T>>;

export declare const View: ComponentType<{ style?: StyleProp<ViewStyle>; children?: ReactNode }>;
export declare const Text: ComponentType<{ style?: StyleProp<TextStyle>; numberOfLines?: number; children?: ReactNode }>;
export declare const Pressable: ComponentType<{
  onPress?: () => void;
  disabled?: boolean;
  accessibilityRole?: string;
  accessibilityLabel?: string;
  accessibilityState?: { busy?: boolean; disabled?: boolean };
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  children?: ReactNode;
}>;
export declare const AppState: {
  addEventListener(type: "change", listener: (state: "active" | "background" | "inactive" | "unknown" | "extension") => void): { remove(): void };
};

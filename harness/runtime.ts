import * as React from "react";
export { React };
export const { useMemo, useState } = React;
export const ThemeStore = { theme: "dark" };
export const useStateFromStores = (_stores: unknown[], get: () => unknown) => get();

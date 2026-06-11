import { createContext, useContext } from "react";

// 默认值为 false (非只读)
export const ReadOnlyContext = createContext<boolean>(false);

// 自定义 Hook，方便组件调用
export const useReadOnly = () => useContext(ReadOnlyContext);

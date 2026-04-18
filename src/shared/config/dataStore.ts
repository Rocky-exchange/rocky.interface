/**
 * DataStore Configuration Export
 * 
 * 根据使用场景导出对应的 DataStore 配置：
 * - GMX 路由使用 gmx/dataStore（链上合约键）
 * - X10000 路由使用 custom/dataStore（API 后端，无需链上键）
 * 
 * 默认导出 GMX 配置以保持向后兼容
 */
export * from "./gmx/dataStore";

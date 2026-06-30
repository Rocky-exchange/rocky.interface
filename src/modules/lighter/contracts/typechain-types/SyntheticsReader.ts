export type ReaderOrderInfoStructOutput = {
  order: any;
  [key: string]: any;
};

export type SyntheticsReader = {
  getAccountPositionInfoList: (...args: any[]) => any;
};

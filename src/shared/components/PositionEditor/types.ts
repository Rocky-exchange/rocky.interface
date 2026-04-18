import { msg } from "@lingui/macro";

export enum Operation {
  Deposit = "Deposit",
  Withdraw = "Withdraw",
}

export const OPERATION_LABELS = {
  [Operation.Deposit]: msg`Deposit`,
  [Operation.Withdraw]: msg`Withdraw`,
};

// x10000 mode labels (CEX style)
export const X10000_OPERATION_LABELS = {
  [Operation.Deposit]: msg`Add Collateral`,
  [Operation.Withdraw]: msg`Remove Collateral`,
};

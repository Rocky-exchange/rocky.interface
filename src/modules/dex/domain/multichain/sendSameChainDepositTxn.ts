import { Contract } from "ethers";
import { Address, encodeFunctionData, zeroAddress, type Hex } from "viem";

import { ARBITRUM, ARBITRUM_SEPOLIA, type SettlementChainId } from "config/chains";
import { getContract } from "config/contracts";
import { getX10000ZtdxVaultAddress } from "config/custom/contracts";
import { GasPriceData, getGasPrice } from "lib/gas/gasPrice";
import { getProvider } from "lib/rpc";
import { TxnCallback, WalletTxnCtx, sendWalletTransaction } from "lib/transactions";
import type { WalletSigner } from "lib/wallets";
import { abis } from "sdk/abis";
import { getToken } from "sdk/configs/tokens";

export async function sendSameChainDepositTxn({
  chainId,
  signer,
  tokenAddress,
  amount,
  account,
  callback,
}: {
  chainId: SettlementChainId;
  signer: WalletSigner;
  tokenAddress: string;
  amount: bigint;
  account: string;
  callback?: TxnCallback<WalletTxnCtx>;
}) {
  // =========================
  // ZTDXVault same-chain deposit (Arbitrum Sepolia & Arbitrum Mainnet, USDT-only)
  // =========================
  // When on Arbitrum Sepolia or Arbitrum Mainnet, we bypass the generic MultichainTransferRouter flow
  // and send the deposit directly to the custom ZTDXVault contract
  if (chainId === ARBITRUM_SEPOLIA || chainId === ARBITRUM) {
    const ZTDX_VAULT_ADDRESS = getX10000ZtdxVaultAddress(chainId);
    if (!ZTDX_VAULT_ADDRESS) {
      throw new Error("ZTDXVault address not found for chain");
    }

    // Minimal ABI for ZTDXVault.deposit(uint256 amount, bytes32 referralCode)
    const ztdxVaultAbi = [
      {
        type: "function",
        stateMutability: "nonpayable",
        name: "deposit",
        inputs: [
          { name: "amount", type: "uint256" },
          { name: "referralCode", type: "bytes32" },
        ],
        outputs: [],
      },
    ] as const;

    const emptyReferralCode = ("0x" + "0".repeat(64)) as Hex;

    const callData = encodeFunctionData({
      abi: ztdxVaultAbi,
      functionName: "deposit",
      args: [amount, emptyReferralCode],
    });

    // Use a fixed gas limit for ZTDXVault deposit (multiplied by 2 for MetaMask compatibility)
    // MetaMask requires higher gas limits than OKX wallet, so we multiply by 2x
    const DEPOSIT_GAS_LIMIT = 400000n; // 200000 * 2

    // Get gas price and multiply by 2 for MetaMask compatibility
    // MetaMask may reject transactions with insufficient gas price
    const provider = getProvider(undefined, chainId);
    const baseGasPriceData = await getGasPrice(provider, chainId);
    const multipliedGasPriceData: GasPriceData =
      "gasPrice" in baseGasPriceData
        ? { gasPrice: baseGasPriceData.gasPrice * 2n }
        : {
            maxFeePerGas: baseGasPriceData.maxFeePerGas * 2n,
            maxPriorityFeePerGas: baseGasPriceData.maxPriorityFeePerGas * 2n,
          };

    // Try to simulate the transaction first to get a better error message if it will fail
    // This is especially useful for MetaMask which may reject transactions that will revert
    const runSimulation = async () => {
      try {
        await signer.provider!.call({
          to: ZTDX_VAULT_ADDRESS,
          data: callData,
          from: account,
          value: 0n,
        });
      } catch (simulationError: any) {
        // If simulation fails, it means the transaction will revert
        // Extract the revert reason if possible
        const revertReason = simulationError?.reason || simulationError?.message || "Transaction will revert";
        throw new Error(`Deposit simulation failed: ${revertReason}. Please check token allowance and balance.`);
      }
    };

    await sendWalletTransaction({
      chainId,
      signer,
      to: ZTDX_VAULT_ADDRESS as Address,
      callData,
      // No native value is sent; USDT will be transferred via ERC20.transferFrom
      value: 0n,
      gasLimit: DEPOSIT_GAS_LIMIT,
      gasPriceData: multipliedGasPriceData,
      runSimulation,
      callback,
    });

    return;
  }

  const multichainVaultAddress = getContract(chainId, "MultichainVault");

  const contract = new Contract(
    getContract(chainId, "MultichainTransferRouter")!,
    abis.MultichainTransferRouter,
    signer
  );

  if (tokenAddress === zeroAddress) {
    const token = getToken(chainId, tokenAddress);
    const wrappedAddress = token?.wrappedAddress;

    if (!wrappedAddress) {
      throw new Error("Wrapped address is not set");
    }

    await sendWalletTransaction({
      chainId: chainId,
      signer: signer,
      to: await contract.getAddress(),
      callData: contract.interface.encodeFunctionData("multicall", [
        [
          encodeFunctionData({
            abi: abis.MultichainTransferRouter,
            functionName: "sendWnt",
            args: [multichainVaultAddress, amount],
          }),
          encodeFunctionData({
            abi: abis.MultichainTransferRouter,
            functionName: "bridgeIn",
            args: [account, wrappedAddress as Address],
          }),
        ],
      ]),
      value: amount,
      callback,
    });
  } else {
    await sendWalletTransaction({
      chainId: chainId,
      signer: signer,
      to: await contract.getAddress(),
      callData: contract.interface.encodeFunctionData("multicall", [
        [
          encodeFunctionData({
            abi: abis.MultichainTransferRouter,
            functionName: "sendTokens",
            args: [tokenAddress as Address, multichainVaultAddress, amount],
          }),

          encodeFunctionData({
            abi: abis.MultichainTransferRouter,
            functionName: "bridgeIn",
            args: [account, tokenAddress as Address],
          }),
        ],
      ]),
      callback,
    });
  }
}

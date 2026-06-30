type Hex = `0x${string}`;

export class OFTComposeMsgCodec {
  public static encode(_nonce: bigint, _srcEid: number, _amountLD: bigint, _composeMsg: string): Hex {
    return "0x";
  }

  public static nonce(_msg: Hex): bigint {
    return 0n;
  }

  public static srcEid(_msg: Hex): bigint {
    return 0n;
  }

  public static amountLD(_msg: Hex): bigint {
    return 0n;
  }

  public static composeFrom(_msg: Hex): Hex {
    return "0x";
  }

  public static composeMsg(_msg: Hex): Hex {
    return "0x";
  }
}

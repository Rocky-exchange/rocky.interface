import { ARBITRUM, AVALANCHE, AVALANCHE_FUJI, BOTANIX } from "./chains";

/*
  A temporary solution before positions sorting logic is updated
  to not depend on marketInfo sorting.

  When adding new markets, add them to the end of the list
  or update arrays based on marketInfo sorting in runtime
*/
export const SORTED_MARKETS = {
  [ARBITRUM]: ["0x47c031236e19d024b42f8AE6780E44A573170703", "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336"],
  [AVALANCHE]: ["0xFb02132333A79C8B5Bd0b64E3AbccA5f7fAf2937", "0xB7e69749E3d2EDd90ea59A4932EFEa2D41E245d7"],
  [AVALANCHE_FUJI]: ["0xbf338a6C595f06B7Cfff2FA8c958d49201466374", "0x79E6e0E454dE82fA98c02dB012a2A69103630B07"],
  [BOTANIX]: [
    "0x6682BB60590a045A956541B1433f016Ed22E361d",
    "0x2f95a2529328E427d3204555F164B1102086690E",
    "0x6bFDD025827F7CE130BcfC446927AEF34ae2a98d",
  ],
};

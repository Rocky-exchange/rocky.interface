export const SEND_MODE_TAXI = 0;

export class OftCmd {
  constructor(
    public sendMode: number,
    public passengers: string[]
  ) {}

  toBytes(): string {
    return "0x";
  }
}

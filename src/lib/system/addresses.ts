export const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/

export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase()
}

export function isValidAddress(address: string): boolean {
  return EVM_ADDRESS_PATTERN.test(address.trim())
}

export const SYSTEM_ADDRESSES = {
  zero: '0x0000000000000000000000000000000000000000',
  initialMint: '0xCddFB85F74F48D7C90B4126e01007583503537fD',
  main: '0xeDdF22523776d06B46DCc96768A8DfD01f5B1ff6',
  workspace: '0x11fa8Be7383AeD9549EB1693295F4a4A4B8C42AC',
  distributorPool: '0xd8FF598242e87EA33055E2bAE38e5E7855206EA1',
  operationPool: '0x5375D9B6d9289F4b6c8C59734713764c4c1127D9',
  loyaltySwap: '0x3270a1658E43fc5d7A0aE947A552cA916F76A05e',
  marketplaceV1: '0x56ef6445CC79801b3a6b41319D996cFf8f901ac2',
  marketplaceV2: '0x032B2668EEf54b165A2D969Eab94f57d2bf546E4',
  marketplaceFee: '0x2Dd756BEfD774AcB510a4389DBFDd34CBAeA1F0b',
} as const

export const TOKEN_ADDRESSES = {
  iccyyn: '0x176458708C6C5F91745E19683AbA93681e16110B',
  fit: '0x765fdD2333003814b8B0c132bC0f40bf90D55BB9',
  grn: '0x3e19685894F822ec9E9caa752f459750a2B7ab44',
  int: '0x4E407c438bF2Cafc30e63dec17d77c9cc642cf93',
  tgt: '0xB4c77F6c02b661750c4386d3D391167B4D443fF7',
  yyn: '0x1F7e5a547d3E62456550590e6C3420bFBaE7d80d',
  evt: '0x5908117eb6dc3b4D45E5fEC1A8b53d72CF4Ebdb6',
  hlt: '0xfFCAE5e390C99c1E6067cc86611f1AcAAD2d1B3A',
  sct: '0x7F99039F00e80b253c85976d281c26D9BEd0f2d7',
  gvt: '0x5c97DA9cc8e70754BE24574072867501b8869E9e',
  redemptionNft: '0xe089bc4b774b03f1D5F8C3f624603643F0718B62',
} as const

export const CANONICAL_NORMALIZED_ADDRESSES = new Set<string>([
  ...Object.values(SYSTEM_ADDRESSES),
  ...Object.values(TOKEN_ADDRESSES),
].map(normalizeAddress))

export function isCanonicalAddress(address: string): boolean {
  return CANONICAL_NORMALIZED_ADDRESSES.has(normalizeAddress(address))
}

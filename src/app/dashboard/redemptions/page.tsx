import { redirect } from 'next/navigation'

export default function LegacyRedemptionsPage(): never {
  redirect('/dashboard/nft-redemptions')
}

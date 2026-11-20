import { NextResponse } from 'next/server'
import { getFreshSession } from '@/lib/auth'

export async function GET() {
  const session = await getFreshSession()
  if (!session) return NextResponse.json({ error: 'Belum masuk' }, { status: 401 })
  return NextResponse.json({ data: session })
}

import { Suspense } from 'react'
import type { Metadata } from 'next'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = { title: 'Log in' }

export default function LoginWrapper() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
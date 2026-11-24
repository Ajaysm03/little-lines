import { lazy, StrictMode, Suspense, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import { AppShell } from './screens/AppShell'
import { BookScreen } from './screens/BookScreen'
import { GalleryScreen } from './screens/GalleryScreen'
import { GrownUps } from './screens/GrownUps'
import { IndexRedirect, ParentGate, PublicOnly, RequireAccount, RequireProfile, Root, Splash } from './screens/guards'
import { HomeScreen } from './screens/HomeScreen'
import { ChildInsightsScreen, DeviceInsightsScreen } from './screens/InsightsScreens'
import { LibraryScreen } from './screens/LibraryScreen'
import { NotFound } from './screens/NotFound'
import { ProfileEditor } from './screens/ProfileEditor'
import { ForgotPasswordScreen, ResetPasswordScreen, SetupPinScreen } from './screens/PasswordScreens'
import { ProfilePicker } from './screens/ProfilePicker'
import { SignUpScreen } from './screens/SignUpScreen'
import { WelcomeScreen } from './screens/WelcomeScreen'

// Heavier screens load on first use: the flip book, the coloring editor, and PDF import (pdf.js).
const ReaderScreen = lazy(() => import('./screens/ReaderScreen').then((m) => ({ default: m.ReaderScreen })))
const ColorScreen = lazy(() => import('./screens/ColorScreen').then((m) => ({ default: m.ColorScreen })))
const ImportScreen = lazy(() => import('./screens/ImportScreen').then((m) => ({ default: m.ImportScreen })))

function Loading({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Splash />}>{children}</Suspense>
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { index: true, element: <IndexRedirect /> },
      // Reachable signed in or out: the reset link opens from an email.
      { path: 'forgot-password', element: <ForgotPasswordScreen /> },
      { path: 'reset-password', element: <ResetPasswordScreen /> },
      {
        element: <PublicOnly />,
        children: [
          { path: 'welcome', element: <WelcomeScreen /> },
          { path: 'signup', element: <SignUpScreen /> },
        ],
      },
      {
        element: <RequireAccount />,
        children: [
          { path: 'setup-pin', element: <SetupPinScreen /> },
          { path: 'profiles', element: <ProfilePicker /> },
          {
            path: 'profiles/new',
            element: (
              <ParentGate openWhenNoProfiles>
                <ProfileEditor />
              </ParentGate>
            ),
          },
          {
            path: 'profiles/:id/edit',
            element: (
              <ParentGate>
                <ProfileEditor />
              </ParentGate>
            ),
          },
          {
            path: 'grown-ups',
            element: (
              <ParentGate>
                <GrownUps />
              </ParentGate>
            ),
          },
          {
            path: 'grown-ups/children/:id',
            element: (
              <ParentGate>
                <ChildInsightsScreen />
              </ParentGate>
            ),
          },
          {
            path: 'grown-ups/import',
            element: (
              <ParentGate>
                <Loading>
                  <ImportScreen />
                </Loading>
              </ParentGate>
            ),
          },
          {
            path: 'grown-ups/device',
            element: (
              <ParentGate>
                <DeviceInsightsScreen />
              </ParentGate>
            ),
          },
          {
            element: <RequireProfile />,
            children: [
              {
                path: 'books/:bookId/read',
                element: (
                  <Loading>
                    <ReaderScreen />
                  </Loading>
                ),
              },
              {
                path: 'color/:bookId/:pageId',
                element: (
                  <Loading>
                    <ColorScreen />
                  </Loading>
                ),
              },
              {
                element: <AppShell />,
                children: [
                  { path: 'home', element: <HomeScreen /> },
                  { path: 'library', element: <LibraryScreen /> },
                  { path: 'gallery', element: <GalleryScreen /> },
                  { path: 'books/:bookId', element: <BookScreen /> },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)

// Cache the app for offline use (production builds only) and update it quietly in the background.
if (import.meta.env.PROD) registerSW({ immediate: true })

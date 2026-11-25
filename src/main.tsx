import { lazy, StrictMode, Suspense, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import { AppShell } from './screens/AppShell'
import { BookScreen } from './screens/BookScreen'
import { GalleryScreen } from './screens/GalleryScreen'
import { GrownUps } from './screens/GrownUps'
import { IndexRedirect, ParentGate, PublicOnly, RequireAccount, RequireOwner, RequireProfile, Root, Splash } from './screens/guards'
import { HomeScreen } from './screens/HomeScreen'
import { ChildInsightsScreen } from './screens/InsightsScreens'
import { LibraryScreen } from './screens/LibraryScreen'
import { NotFound } from './screens/NotFound'
import { ProfileEditor } from './screens/ProfileEditor'
import { ForgotPasswordScreen, ResetPasswordScreen, SetupPinScreen } from './screens/PasswordScreens'
import { ProfilePicker } from './screens/ProfilePicker'
import { SignUpScreen } from './screens/SignUpScreen'
import { StickersScreen } from './screens/StickersScreen'
import { WelcomeScreen } from './screens/WelcomeScreen'

// Heavier screens load on first use: the flip book, the coloring editor, and the owner console.
const ReaderScreen = lazy(() => import('./screens/ReaderScreen').then((m) => ({ default: m.ReaderScreen })))
const ColorScreen = lazy(() => import('./screens/ColorScreen').then((m) => ({ default: m.ColorScreen })))
const AdminLayout = lazy(() => import('./admin/AdminLayout').then((m) => ({ default: m.AdminLayout })))
const AdminOverview = lazy(() => import('./admin/OverviewScreen').then((m) => ({ default: m.OverviewScreen })))
const AdminAudit = lazy(() => import('./admin/AuditScreen').then((m) => ({ default: m.AuditScreen })))
const AdminEmails = lazy(() => import('./admin/AdminEmails').then((m) => ({ default: m.AdminEmails })))
const AdminUsers = lazy(() => import('./admin/AdminUsers').then((m) => ({ default: m.AdminUsers })))
const AdminUserDetail = lazy(() => import('./admin/AdminUserDetail').then((m) => ({ default: m.AdminUserDetail })))
const AdminAnalytics = lazy(() => import('./admin/AdminAnalytics').then((m) => ({ default: m.AdminAnalytics })))
const AdminPlans = lazy(() => import('./admin/AdminPlans').then((m) => ({ default: m.AdminPlans })))
const AdminBooks = lazy(() => import('./admin/AdminBooks').then((m) => ({ default: m.AdminBooks })))
const AdminBookUpload = lazy(() => import('./admin/AdminBookUpload').then((m) => ({ default: m.AdminBookUpload })))
const AdminBookEditor = lazy(() => import('./admin/AdminBookEditor').then((m) => ({ default: m.AdminBookEditor })))
const AdminBookPreview = lazy(() => import('./admin/AdminBookPreview').then((m) => ({ default: m.AdminBookPreview })))
// Developer-only kit of the cozy building blocks; not part of production builds.
const KitScreen = import.meta.env.DEV ? lazy(() => import('./screens/KitScreen').then((m) => ({ default: m.KitScreen }))) : null

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
                  { path: 'stickers', element: <StickersScreen /> },
                  { path: 'books/:bookId', element: <BookScreen /> },
                ],
              },
            ],
          },
        ],
      },
      {
        path: 'admin',
        element: <RequireOwner notFound={<NotFound />} />,
        children: [
          {
            element: (
              <Loading>
                <AdminLayout />
              </Loading>
            ),
            children: [
              { index: true, element: <AdminOverview /> },
              { path: 'users', element: <AdminUsers /> },
              { path: 'users/:id', element: <AdminUserDetail /> },
              { path: 'books', element: <AdminBooks /> },
              { path: 'plans', element: <AdminPlans /> },
              { path: 'books/new', element: <AdminBookUpload /> },
              { path: 'books/:id', element: <AdminBookEditor /> },
              { path: 'analytics', element: <AdminAnalytics /> },
              { path: 'emails', element: <AdminEmails /> },
              { path: 'audit', element: <AdminAudit /> },
            ],
          },
          {
            // Full screen, like the family reader.
            path: 'books/:id/preview',
            element: (
              <Loading>
                <AdminBookPreview />
              </Loading>
            ),
          },
        ],
      },
      ...(KitScreen
        ? [
            {
              path: 'dev/kit',
              element: (
                <Loading>
                  <KitScreen />
                </Loading>
              ),
            },
          ]
        : []),
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

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import './index.css'
import { AppShell } from './screens/AppShell'
import { BookScreen } from './screens/BookScreen'
import { ColorScreen } from './screens/ColorScreen'
import { GalleryScreen } from './screens/GalleryScreen'
import { GrownUps } from './screens/GrownUps'
import { IndexRedirect, ParentGate, PublicOnly, RequireAccount, RequireProfile, Root } from './screens/guards'
import { HomeScreen } from './screens/HomeScreen'
import { ChildInsightsScreen, DeviceInsightsScreen } from './screens/InsightsScreens'
import { LibraryScreen } from './screens/LibraryScreen'
import { NotFound } from './screens/NotFound'
import { ProfileEditor } from './screens/ProfileEditor'
import { ProfilePicker } from './screens/ProfilePicker'
import { ReaderScreen } from './screens/ReaderScreen'
import { SignUpScreen } from './screens/SignUpScreen'
import { WelcomeScreen } from './screens/WelcomeScreen'

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { index: true, element: <IndexRedirect /> },
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
              { path: 'books/:bookId/read', element: <ReaderScreen /> },
              { path: 'color/:bookId/:pageId', element: <ColorScreen /> },
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

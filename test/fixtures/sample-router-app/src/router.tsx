import { createBrowserRouter, Route, createRoutesFromElements } from "react-router-dom";

import { HomePage } from "./views/HomePage";
import { SettingsPage } from "./views/SettingsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <HomePage />
  },
  {
    path: "/settings",
    element: <SettingsPage />
  }
]);

export const routeElements = createRoutesFromElements(
  <Route path="/account" element={<SettingsPage />} />
);

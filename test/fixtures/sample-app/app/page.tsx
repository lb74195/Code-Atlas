import { Dashboard } from "../components/Dashboard";
import { useLegacyThing } from "../components/useLegacyThing";
import { cookies } from "next/headers";

export default function HomePage() {
  const cookieStore = cookies();
  useLegacyThing(cookieStore);
  return <Dashboard />;
}

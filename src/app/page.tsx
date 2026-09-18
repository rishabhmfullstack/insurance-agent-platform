import { redirect } from "next/navigation";

// The app has no public landing page: agents go to the dashboard, and the
// (agent) layout bounces anonymous visitors to /login.
export default function Home() {
  redirect("/dashboard");
}
